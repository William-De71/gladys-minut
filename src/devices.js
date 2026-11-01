// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Minut <name>": one per Minut sensor, read-only features, each one offered
// once the sensor gave the value it needs (they never go away afterwards: a
// feature that flaps would ask the user to update the device):
//   - `temperature`   temperature-sensor / decimal, °C;
//   - `humidity`      humidity-sensor / decimal, %;
//   - `sound`         noise-sensor / integer, dB (A-weighted by Minut);
//   - `pressure`      pressure-sensor / decimal, hPa;
//   - `battery`       battery / integer, %;
//   - `tamper`        tamper / binary: 1 when the sensor is off its mounting
//                     plate (only for the sensors that report it).
//
// "Minut home <name>": one per Minut home:
//   - `alarm`             switch / binary, writable: the security alarm on or
//                         off (on while arming, ringing or in its grace period);
//   - `alarm_status`      text: the state of the alarm, in words;
//   - `noise_monitoring`  switch / binary, writable: noise alerts watching (1)
//                         or paused (0, a "snooze" of the configured length);
//                         offered when the noise monitoring is on in Minut;
//   - `disturbance`       text: the state of the noise monitoring, in words.
//
// External ids: the Minut ids (24 hexadecimal digits, stable), never a name.
// `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t, alarmText, noiseText } from './i18n.js';
import { alarmArmed, noiseStateOf, noiseWatching } from './model.js';

const KINDS = { SENSOR: 'sensor', HOME: 'home' };
const TEXT_MAX = 250;

const sensor = (category, type, unit, min, max) => ({
  category,
  type,
  ...(unit ? { unit } : {}),
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});
const command = (category, type) => ({
  category,
  type,
  min: 0,
  max: 1,
  read_only: false,
  has_feedback: true,
  keep_history: true,
});
const textShape = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  min: 0,
  max: 0,
  read_only: true,
  has_feedback: false,
  keep_history: false,
};
const value = (key) => (device) => device.values?.[key] ?? null;

// `state(source)`: the number, or `text(source, language)`: the text; null when unknown.
const SENSOR_FEATURES = [
  {
    key: 'temperature',
    name: 'featureTemperature',
    shape: sensor(CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.CELSIUS, -40, 85),
    state: value('temperature'),
  },
  {
    key: 'humidity',
    name: 'featureHumidity',
    shape: sensor(CATEGORIES.HUMIDITY_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.PERCENT, 0, 100),
    state: value('humidity'),
  },
  {
    key: 'sound',
    name: 'featureSound',
    shape: sensor(CATEGORIES.NOISE_SENSOR, TYPES.SENSOR.INTEGER, UNITS.DECIBEL, 0, 150),
    state: (device) =>
      Number.isFinite(device.values?.sound) ? Math.round(device.values.sound) : null,
  },
  {
    key: 'pressure',
    name: 'featurePressure',
    shape: sensor(CATEGORIES.PRESSURE_SENSOR, TYPES.SENSOR.DECIMAL, UNITS.HECTO_PASCAL, 300, 1100),
    state: value('pressure'),
  },
  {
    key: 'battery',
    name: 'featureBattery',
    shape: sensor(CATEGORIES.BATTERY, TYPES.BATTERY.INTEGER, UNITS.PERCENT, 0, 100),
    state: (device) => (Number.isFinite(device.battery) ? Math.round(device.battery) : null),
  },
  {
    key: 'tamper',
    name: 'featureTamper',
    shape: sensor(CATEGORIES.TAMPER, TYPES.TAMPER.BINARY, undefined, 0, 1),
    state: (device) => (device.mount ? Number(device.mount === 'unmounted') : null),
  },
];

const HOME_FEATURES = [
  {
    key: 'alarm',
    name: 'featureAlarm',
    shape: command(CATEGORIES.SWITCH, TYPES.SWITCH.BINARY),
    state: (home) => {
      const armed = alarmArmed(home.alarmStatus);
      return armed === null ? null : Number(armed);
    },
  },
  {
    key: 'alarm_status',
    name: 'featureAlarmStatus',
    shape: textShape,
    given: (home) => Boolean(home.alarmStatus),
    text: (home, language) => alarmText(home.alarmStatus, language),
  },
  {
    key: 'noise_monitoring',
    name: 'featureNoiseMonitoring',
    shape: command(CATEGORIES.SWITCH, TYPES.SWITCH.BINARY),
    given: (home) => home.noiseActive === true,
    state: (home) => {
      const watching = noiseWatching(home);
      return watching === null ? null : Number(watching);
    },
  },
  {
    key: 'disturbance',
    name: 'featureDisturbance',
    shape: textShape,
    given: (home) => Boolean(noiseStateOf(home)),
    text: (home, language) => noiseText(noiseStateOf(home), language),
  },
];

for (const feature of [...SENSOR_FEATURES, ...HOME_FEATURES]) {
  feature.given ??= (source) => feature.state(source) !== null;
}
const SENSOR_KEYS = SENSOR_FEATURES.map((feature) => feature.key);
const HOME_KEYS = HOME_FEATURES.map((feature) => feature.key);
const WRITABLE = { ALARM: 'alarm', NOISE_MONITORING: 'noise_monitoring' };

/**
 * @description The external ids of a sensor or a home.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} kind - `sensor` or `home`.
 * @param {string} id - The Minut id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, kind, id) => gladys.externalIds(kind, id);

/**
 * @description The kind and Minut id of a device (or feature) external id.
 * @param {unknown} externalId - The id.
 * @returns {{ kind: string, id: string, feature: string|null }|null} Null when not one of ours.
 * @example
 * parseExternalId('ext:minut:home:5ffff22ab167b70039f806fe:alarm');
 * // -> { kind: 'home', id: '5ffff22ab167b70039f806fe', feature: 'alarm' }
 */
function parseExternalId(externalId) {
  const match = /:(sensor|home):([0-9a-f]{24})(?::([a-z_]+))?$/.exec(String(externalId ?? ''));
  return match ? { kind: match[1], id: match[2], feature: match[3] ?? null } : null;
}

/**
 * @description The features a sensor or a home gives now.
 * @param {string} kind - `sensor` or `home`.
 * @param {object|null} source - The sensor or the home.
 * @returns {string[]} The feature keys.
 */
function givenKeysOf(kind, source) {
  const list = kind === KINDS.SENSOR ? SENSOR_FEATURES : HOME_FEATURES;
  return source
    ? list.filter((feature) => feature.given(source)).map((feature) => feature.key)
    : [];
}

/**
 * @description Build the device of a sensor or a home.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} kind - `sensor` or `home`.
 * @param {object} source - `{ id, name }`.
 * @param {string[]} features - The feature keys it ever gave.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, kind, source, features, language = 'en') {
  const ids = idsOf(gladys, kind, source.id);
  const given = new Set(features ?? []);
  const list = kind === KINDS.SENSOR ? SENSOR_FEATURES : HOME_FEATURES;
  return {
    name: t(kind === KINDS.SENSOR ? 'sensorName' : 'homeName', language, { name: source.name }),
    external_id: ids.device,
    model: kind === KINDS.SENSOR ? 'Minut' : 'Minut home',
    should_poll: false,
    params: [],
    features: list
      .filter((feature) => given.has(feature.key))
      .map((feature) => ({
        name: t(feature.name, language),
        external_id: ids.feature(feature.key),
        ...feature.shape,
      })),
  };
}

/**
 * @description The states of a sensor or a home. A value Minut did not give
 * is left untouched.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} kind - `sensor` or `home`.
 * @param {object} source - The sensor or the home.
 * @param {string[]} features - Its feature keys.
 * @param {object} [options] - `{ language }`.
 * @returns {object[]} `{ device_feature_external_id, state | text }`.
 */
function buildStates(gladys, kind, source, features, { language = 'en' } = {}) {
  if (!source) {
    return [];
  }
  const ids = idsOf(gladys, kind, source.id);
  const given = new Set(features ?? []);
  const states = [];
  for (const feature of kind === KINDS.SENSOR ? SENSOR_FEATURES : HOME_FEATURES) {
    if (!given.has(feature.key)) {
      continue;
    }
    const id = ids.feature(feature.key);
    if (feature.text) {
      const words = feature.text(source, language);
      if (words) {
        states.push({ device_feature_external_id: id, text: words.slice(0, TEXT_MAX) });
      }
      continue;
    }
    const state = feature.state(source);
    if (Number.isFinite(state)) {
      states.push({
        device_feature_external_id: id,
        state: Math.min(Math.max(state, feature.shape.min), feature.shape.max),
      });
    }
  }
  return states;
}

export {
  KINDS,
  SENSOR_FEATURES,
  HOME_FEATURES,
  SENSOR_KEYS,
  HOME_KEYS,
  WRITABLE,
  idsOf,
  parseExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
};
