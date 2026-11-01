// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): should_poll without poll_frequency,
// min / max / read_only / has_feedback on every feature, category / type
// pairs, and a single invalid field rejecting the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';

import {
  KINDS,
  SENSOR_KEYS,
  HOME_KEYS,
  parseExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
} from '../src/devices.js';
import { parseDevice, parseHome } from '../src/model.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture, ORG, CHALET, LIVING, BEDROOM } from './helpers/fake-api.js';

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:minut:${type}:${id}`,
    feature: (key) => `ext:minut:${type}:${id}:${key}`,
  }),
};
const [living, bedroom, gone] = fixture('devices.json').devices.map(parseDevice);
const [chalet, studio] = fixture('homes.json').homes.map((raw) => parseHome(raw, ORG));
const devices = (language, gladys = fakeGladys) => [
  buildDevice(gladys, KINDS.HOME, chalet, HOME_KEYS, language),
  buildDevice(gladys, KINDS.SENSOR, living, SENSOR_KEYS, language),
];

const PAIRS = [
  [C.TEMPERATURE_SENSOR, T.SENSOR.DECIMAL, U.CELSIUS],
  [C.HUMIDITY_SENSOR, T.SENSOR.DECIMAL, U.PERCENT],
  [C.NOISE_SENSOR, T.SENSOR.INTEGER, U.DECIBEL],
  [C.PRESSURE_SENSOR, T.SENSOR.DECIMAL, U.HECTO_PASCAL],
  [C.BATTERY, T.BATTERY.INTEGER, U.PERCENT],
  [C.TAMPER, T.TAMPER.BINARY, undefined],
  [C.SWITCH, T.SWITCH.BINARY, undefined],
  [C.TEXT, T.TEXT.TEXT, undefined],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        assert.equal(typeof feature.min, 'number', feature.external_id);
        assert.equal(typeof feature.max, 'number', feature.external_id);
        assert.ok(feature.min <= feature.max);
        assert.equal(typeof feature.read_only, 'boolean');
        assert.equal(typeof feature.has_feedback, 'boolean');
        assert.equal(typeof feature.keep_history, 'boolean');
      }
      assert.equal(new Set(device.features.map((f) => f.name)).size, device.features.length);
    }
  }
});

test('category / type / unit pairs known to the Gladys front; only the switches are writable', () => {
  for (const feature of devices('en').flatMap((device) => device.features)) {
    assert.ok(
      PAIRS.some(
        ([c, ty, u]) => feature.category === c && feature.type === ty && feature.unit === u,
      ),
      `${feature.external_id}: ${feature.category}/${feature.type}/${feature.unit}`,
    );
    assert.equal(feature.read_only, feature.category !== C.SWITCH, feature.external_id);
    assert.equal(feature.has_feedback, feature.category === C.SWITCH, feature.external_id);
  }
});

test('external ids from the Minut ids; names from the Minut app; features from what they give', () => {
  const [home, sensor] = devices('fr');
  assert.equal(home.external_id, `ext:minut:home:${CHALET}`);
  assert.equal(home.name, 'Maison Minut Chalet');
  assert.equal(sensor.external_id, `ext:minut:sensor:${LIVING}`);
  assert.equal(sensor.name, 'Minut Living room');
  assert.equal(sensor.features.find((f) => f.external_id.endsWith(':sound')).name, 'Niveau sonore');
  assert.deepEqual(givenKeysOf(KINDS.SENSOR, living), SENSOR_KEYS);
  assert.deepEqual(givenKeysOf(KINDS.SENSOR, bedroom), [
    'temperature',
    'humidity',
    'sound',
    'battery',
  ]);
  assert.deepEqual(givenKeysOf(KINDS.HOME, chalet), HOME_KEYS);
  assert.deepEqual(givenKeysOf(KINDS.HOME, studio), []);
  assert.equal(gone.active, false);
  assert.deepEqual(parseExternalId(`ext:minut:home:${CHALET}:alarm`), {
    kind: 'home',
    id: CHALET,
    feature: 'alarm',
  });
  assert.deepEqual(parseExternalId(`ext:minut:sensor:${BEDROOM}`), {
    kind: 'sensor',
    id: BEDROOM,
    feature: null,
  });
  assert.equal(parseExternalId('nothing'), null);
});

test('states: values, words; a value Minut did not give is left untouched', () => {
  const byKey = (states) =>
    Object.fromEntries(
      states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
    );
  assert.deepEqual(byKey(buildStates(fakeGladys, KINDS.SENSOR, living, SENSOR_KEYS)), {
    temperature: 21.815673828125,
    humidity: 40.0634765625,
    sound: 44,
    pressure: 1013.4,
    battery: 74,
    tamper: 0,
  });
  assert.deepEqual(byKey(buildStates(fakeGladys, KINDS.SENSOR, bedroom, SENSOR_KEYS)), {
    temperature: 19.2,
    humidity: 48.5,
    sound: 31,
    battery: 12,
  });
  assert.deepEqual(
    byKey(buildStates(fakeGladys, KINDS.HOME, chalet, HOME_KEYS, { language: 'de' })),
    { alarm: 0, alarm_status: 'Aus', noise_monitoring: 1, disturbance: 'Ruhig' },
  );
  const ringing = { ...chalet, alarmStatus: 'critical_event', noiseState: 'snoozed' };
  assert.deepEqual(byKey(buildStates(fakeGladys, KINDS.HOME, ringing, HOME_KEYS)), {
    alarm: 1,
    alarm_status: 'Alarm triggered',
    noise_monitoring: 0,
    disturbance: 'Paused',
  });
  const off = { ...chalet, noiseActive: false };
  assert.equal(byKey(buildStates(fakeGladys, KINDS.HOME, off, HOME_KEYS)).disturbance, 'Off');
  assert.deepEqual(buildStates(fakeGladys, KINDS.SENSOR, null, SENSOR_KEYS), []);
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices(devices(language, gladys));
  }
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
  await gladys.publishStates([
    ...buildStates(gladys, KINDS.HOME, chalet, HOME_KEYS),
    ...buildStates(gladys, KINDS.SENSOR, living, SENSOR_KEYS),
  ]);
  const id = (kind, minutId, key) => gladys.externalIds(kind, minutId).feature(key);
  assert.equal(gladys.fake.lastState(id('home', CHALET, 'alarm')), 0);
  assert.equal(gladys.fake.lastState(id('home', CHALET, 'disturbance')), 'Quiet');
  assert.equal(gladys.fake.lastState(id('sensor', LIVING, 'sound')), 44);
});
