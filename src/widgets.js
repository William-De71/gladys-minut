// -----------------------------------------------------------------------------
// Dashboard widgets of the Minut integration.
//
//   - `home`           a home at a glance: the alarm, the noise monitoring,
//                      the sensors online and the lowest battery, then the
//                      temperature, the humidity (averages of the sensors) and
//                      the loudest sound level; buttons: turn the alarm on or
//                      off, silence it while it rings, pause or resume the
//                      noise alerts;
//   - `events`         the last events of a home (noise, alarms, sensors,
//                      climate), newest first;
//   - `sound_history`  the sound level of a sensor over the last 24 hours,
//                      hourly average and peak.
// All of them show the source (Minut) and the hour of the data.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, all, alarmText, noiseText, decimal } from './i18n.js';
import { alarmArmed, noiseStateOf, noiseWatching } from './model.js';
import { EVENT_TYPES, eventTitle } from './events.js';
import { formatTime } from './time.js';

const WIDGETS = { HOME: 'home', EVENTS: 'events', SOUND_HISTORY: 'sound_history' };
const WIDGET_ACTIONS = {
  ALARM_ON: 'alarm_on',
  ALARM_OFF: 'alarm_off',
  SILENCE: 'silence',
  NOISE_PAUSE: 'noise_pause',
  NOISE_RESUME: 'noise_resume',
};
const TTL_SECONDS = { home: 60, events: 60, history: 900, message: 300 };
const LOW_BATTERY = 20;
const EVENTS_SHOWN = 8;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Seconds.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The caption of a widget: name, hour, source.
 * @param {string} name - The home or sensor name.
 * @param {number|null} at - The instant of the data.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} The text component.
 */
function caption(name, at, { language, timeZone }) {
  // The source and the hour always show: a long name gives way.
  const time = formatTime(at, { language, timeZone });
  const tail = `${time ? ` · ${t('updatedAt', language, { time })}` : ''} · Minut`;
  return { type: 'text', variant: 'caption', text: `${clip(name, 80 - tail.length)}${tail}` };
}

/**
 * @description The color of an alarm state.
 * @param {string|null} status - `alarm_status`.
 * @returns {string} A widget color.
 */
function alarmColor(status) {
  if (status === 'critical_event' || status === 'off_grace_period') {
    return WIDGET_COLORS.DANGER;
  }
  return alarmArmed(status) ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL;
}

/**
 * @description The color of a noise state.
 * @param {string|null} state - A noise state (`inactive` included).
 * @returns {string} A widget color.
 */
function noiseColor(state) {
  if (state === 'idle') {
    return WIDGET_COLORS.SUCCESS;
  }
  if (state === 'level_1' || state === 'level_2') {
    return WIDGET_COLORS.WARNING;
  }
  if (state === 'level_3' || state === 'level_4' || state === 'response_service_dispatched') {
    return WIDGET_COLORS.DANGER;
  }
  return WIDGET_COLORS.NEUTRAL;
}

const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/**
 * @description The "home" widget.
 * @param {object} options - Options.
 * @param {object} options.home - The home (model.js).
 * @param {object[]} options.sensors - Its sensors (model.js).
 * @param {number|null} options.at - When the home was read.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildHomeWidget({ home, sensors = [], at, language, timeZone }) {
  const components = [caption(home.name, at, { language, timeZone })];
  const rows = [];
  if (home.alarmStatus) {
    rows.push({
      label: t('statusAlarm', language),
      value: clip(alarmText(home.alarmStatus, language), 40),
      icon: 'shield',
      color: alarmColor(home.alarmStatus),
    });
  }
  const noise = noiseStateOf(home);
  if (noise) {
    rows.push({
      label: t('statusNoise', language),
      value: clip(noiseText(noise, language), 40),
      icon: 'volume-2',
      color: noiseColor(noise),
    });
  }
  if (sensors.length) {
    const offline = sensors.filter((sensor) => sensor.offline).length;
    rows.push({
      label: t('statusSensors', language),
      value: clip(
        offline
          ? t('sensorsSomeOffline', language, { online: sensors.length - offline, offline })
          : t('sensorsOnline', language, { online: sensors.length }),
        40,
      ),
      icon: 'wifi',
      color: offline ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    });
    const batteries = sensors.map((sensor) => sensor.battery).filter(Number.isFinite);
    if (batteries.length) {
      const lowest = Math.min(...batteries);
      rows.push({
        label: t('statusBattery', language),
        value: `${Math.round(lowest)} %`,
        icon: 'battery',
        color: lowest < LOW_BATTERY ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      });
    }
  }
  if (rows.length) {
    components.push({ type: 'status', items: rows });
  }
  const values = (key) => sensors.map((sensor) => sensor.values?.[key]).filter(Number.isFinite);
  const temperature = average(values('temperature'));
  const humidity = average(values('humidity'));
  const sounds = values('sound');
  if (temperature !== null) {
    components.push({
      type: 'value',
      value: decimal(temperature, language, 1),
      unit: '°C',
      label: t('tileTemperature', language),
      icon: 'thermometer',
    });
  }
  if (humidity !== null) {
    components.push({
      type: 'value',
      value: decimal(humidity, language, 0),
      unit: '%',
      label: t('tileHumidity', language),
      icon: 'droplet',
    });
  }
  if (sounds.length) {
    components.push({
      type: 'value',
      value: decimal(Math.max(...sounds), language, 0),
      unit: 'dBA',
      label: t('tileSound', language),
      icon: 'volume-2',
    });
  }
  const params = { home: home.id };
  const armed = alarmArmed(home.alarmStatus);
  if (armed !== null) {
    components.push({
      type: 'button',
      label: all(armed ? 'buttonAlarmOff' : 'buttonAlarmOn'),
      icon: armed ? 'shield-off' : 'shield',
      action: {
        key: armed ? WIDGET_ACTIONS.ALARM_OFF : WIDGET_ACTIONS.ALARM_ON,
        params,
        confirm: true,
      },
    });
  }
  if (home.alarmStatus === 'critical_event') {
    components.push({
      type: 'button',
      label: all('buttonSilence'),
      icon: 'bell-off',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.SILENCE, params, confirm: true },
    });
  }
  const watching = home.noiseActive === true ? noiseWatching(home) : null;
  if (watching !== null) {
    components.push({
      type: 'button',
      label: all(watching ? 'buttonNoisePause' : 'buttonNoiseResume'),
      icon: watching ? 'pause' : 'play',
      action: { key: watching ? WIDGET_ACTIONS.NOISE_PAUSE : WIDGET_ACTIONS.NOISE_RESUME, params },
    });
  }
  return { ttl_seconds: TTL_SECONDS.home, components };
}

/**
 * @description The "events" widget.
 * @param {object} options - Options.
 * @param {object} options.home - The home.
 * @param {object[]} options.events - The last events, newest first (events.js).
 * @param {Function} options.sensorName - `(minutId) => string|null`.
 * @param {number|null} options.at - When the events were read.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildEventsWidget({ home, events = [], sensorName = () => null, at, language, timeZone }) {
  const heading = caption(t('eventsHeading', language, { name: home.name }), at, {
    language,
    timeZone,
  });
  if (!events.length) {
    return {
      ttl_seconds: TTL_SECONDS.events,
      components: [heading, { type: 'text', variant: 'body', text: t('noEvents', language) }],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS.events,
    components: [
      heading,
      {
        type: 'card-list',
        display: 'list',
        items: events.slice(0, EVENTS_SHOWN).map((record) => {
          const known = EVENT_TYPES[record.type];
          const name = record.deviceId ? sensorName(record.deviceId) : null;
          const title = eventTitle(record, language);
          return {
            title: clip(name ? `${title} · ${name}` : title, 60),
            date: new Date(record.at).toISOString(),
            badge: {
              text: clip(t(`badge_${known?.badge ?? 'home'}`, language), 16),
              color: known?.color ?? WIDGET_COLORS.NEUTRAL,
            },
          };
        }),
      },
    ],
  };
}

/**
 * @description The "sound_history" widget.
 * @param {object} options - Options.
 * @param {object} options.sensor - The sensor.
 * @param {object|null} options.history - `{ at, points: [{ at, value, max }] }`.
 * @param {string} options.language - The user language.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildSoundHistoryWidget({ sensor, history, language, timeZone }) {
  const name = t('soundHeading', language, { name: sensor.name });
  const points = (history?.points ?? []).filter((point) => Number.isFinite(point.value));
  if (!points.length) {
    return {
      ttl_seconds: TTL_SECONDS.message,
      components: [
        caption(name, history?.at ?? null, { language, timeZone }),
        { type: 'text', variant: 'body', text: t('noHistory', language) },
      ],
    };
  }
  const round = (value) => Math.round(value * 10) / 10;
  const peaks = points.filter((point) => Number.isFinite(point.max));
  const loudest = (peaks.length ? peaks : points).reduce((best, point) =>
    (point.max ?? point.value) > (best.max ?? best.value) ? point : best,
  );
  const format = (value) => `${decimal(value, language, 0)} dBA`;
  const series = [
    {
      name: t('seriesAverage', language),
      points: points.map((point) => ({
        t: new Date(point.at).toISOString(),
        v: round(point.value),
      })),
    },
  ];
  if (peaks.length) {
    series.push({
      name: t('seriesPeak', language),
      points: peaks.map((point) => ({ t: new Date(point.at).toISOString(), v: round(point.max) })),
    });
  }
  return {
    ttl_seconds: TTL_SECONDS.history,
    components: [
      caption(name, history.at, { language, timeZone }),
      { type: 'chart', chart_type: 'line', unit: 'dBA', series },
      {
        type: 'status',
        items: [
          { label: t('rowNow', language), value: format(points.at(-1).value) },
          {
            label: t('rowAverage', language),
            value: format(points.reduce((sum, point) => sum + point.value, 0) / points.length),
          },
          {
            label: t('rowPeak', language),
            value: clip(
              `${format(loudest.max ?? loudest.value)} · ${formatTime(loudest.at, { language, timeZone })}`,
              40,
            ),
          },
        ],
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  TTL_SECONDS,
  LOW_BATTERY,
  EVENTS_SHOWN,
  clip,
  messageContent,
  alarmColor,
  noiseColor,
  buildHomeWidget,
  buildEventsWidget,
  buildSoundHistoryWidget,
};
