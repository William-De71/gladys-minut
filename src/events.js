// -----------------------------------------------------------------------------
// Scene triggers, from the events of the homes and from the alarm state.
//
// `GET /homes/{home_id}/events` gives the events of a home (`event_id`,
// `event_type`, `event_time`, `metadata.event_specific_data.device_id`…).
// The types of this endpoint are the "home event" names of the API (for
// example `noise_detected` / `noise_quieted`, not the webhook names
// `disturbance_first_notice`…). Each type the integration knows becomes one
// trigger, with a `state` telling which kind it is:
//
//   noise_disturbance     noise_detected (started), noise_quieted (ended)
//   alarm_heard           alarm_heard: a smoke or CO alarm was heard
//   security_alarm        alarm_grace_period_expired (triggered), alarm_silenced
//                         (silenced), alarm_muted_button_press (muted)
//   tamper                tamper_removed (removed), tamper_mounted (mounted),
//                         tamper (moved, older sensors), casing_tamper_detected (casing)
//   connection_changed    device_offline (offline), device_online (online)
//   battery_low           battery_low (low), battery_empty (empty)
//   temperature_alert     temperature_high, temperature_low, *_normal, almost_freezing
//   humidity_alert        humidity_high, humidity_low, *_normal
//   mould_risk            risk_of_mould (detected), risk_of_mould_cleared (cleared)
//   button_pressed        short_button_press
//   smoking_detected      smoking_detected
//   crowd_detected        crowd_detected
// and one trigger the events do not carry, read from the homes:
//   alarm_status_changed  the alarm went on or off outside Gladys (Minut app,
//                         schedule): never after a command sent by Gladys.
//
// Events are deduplicated on `event_id` (kept in /data), and only the ones
// after the first start count: no replay of the past.
// -----------------------------------------------------------------------------

import { t } from './i18n.js';
import { formatTime } from './time.js';

const TRIGGERS = {
  NOISE_DISTURBANCE: 'noise_disturbance',
  ALARM_HEARD: 'alarm_heard',
  SECURITY_ALARM: 'security_alarm',
  ALARM_STATUS_CHANGED: 'alarm_status_changed',
  TAMPER: 'tamper',
  CONNECTION_CHANGED: 'connection_changed',
  BATTERY_LOW: 'battery_low',
  TEMPERATURE_ALERT: 'temperature_alert',
  HUMIDITY_ALERT: 'humidity_alert',
  MOULD_RISK: 'mould_risk',
  BUTTON_PRESSED: 'button_pressed',
  SMOKING_DETECTED: 'smoking_detected',
  CROWD_DETECTED: 'crowd_detected',
};

// Minut home event type -> trigger, its `state`, the badge and color of the events widget.
const EVENT_TYPES = {
  noise_detected: {
    trigger: 'noise_disturbance',
    state: 'started',
    badge: 'noise',
    color: 'warning',
  },
  noise_quieted: { trigger: 'noise_disturbance', state: 'ended', badge: 'noise', color: 'success' },
  alarm_heard: { trigger: 'alarm_heard', badge: 'alarm', color: 'danger' },
  alarm_grace_period_expired: {
    trigger: 'security_alarm',
    state: 'triggered',
    badge: 'alarm',
    color: 'danger',
  },
  alarm_silenced: {
    trigger: 'security_alarm',
    state: 'silenced',
    badge: 'alarm',
    color: 'neutral',
  },
  alarm_muted_button_press: {
    trigger: 'security_alarm',
    state: 'muted',
    badge: 'alarm',
    color: 'neutral',
  },
  tamper_removed: { trigger: 'tamper', state: 'removed', badge: 'sensor', color: 'warning' },
  tamper_mounted: { trigger: 'tamper', state: 'mounted', badge: 'sensor', color: 'success' },
  tamper: { trigger: 'tamper', state: 'moved', badge: 'sensor', color: 'warning' },
  casing_tamper_detected: { trigger: 'tamper', state: 'casing', badge: 'sensor', color: 'danger' },
  device_offline: {
    trigger: 'connection_changed',
    state: 'offline',
    badge: 'sensor',
    color: 'danger',
  },
  device_online: {
    trigger: 'connection_changed',
    state: 'online',
    badge: 'sensor',
    color: 'success',
  },
  battery_low: { trigger: 'battery_low', state: 'low', badge: 'battery', color: 'warning' },
  battery_empty: { trigger: 'battery_low', state: 'empty', badge: 'battery', color: 'danger' },
  temperature_high: {
    trigger: 'temperature_alert',
    state: 'high',
    badge: 'climate',
    color: 'warning',
  },
  temperature_low: {
    trigger: 'temperature_alert',
    state: 'low',
    badge: 'climate',
    color: 'warning',
  },
  temperature_dropped_normal: {
    trigger: 'temperature_alert',
    state: 'normal',
    badge: 'climate',
    color: 'success',
  },
  temperature_risen_normal: {
    trigger: 'temperature_alert',
    state: 'normal',
    badge: 'climate',
    color: 'success',
  },
  almost_freezing: {
    trigger: 'temperature_alert',
    state: 'freezing',
    badge: 'climate',
    color: 'danger',
  },
  humidity_high: { trigger: 'humidity_alert', state: 'high', badge: 'climate', color: 'warning' },
  humidity_low: { trigger: 'humidity_alert', state: 'low', badge: 'climate', color: 'warning' },
  humidity_dropped_normal: {
    trigger: 'humidity_alert',
    state: 'normal',
    badge: 'climate',
    color: 'success',
  },
  humidity_risen_normal: {
    trigger: 'humidity_alert',
    state: 'normal',
    badge: 'climate',
    color: 'success',
  },
  risk_of_mould: { trigger: 'mould_risk', state: 'detected', badge: 'climate', color: 'warning' },
  risk_of_mould_cleared: {
    trigger: 'mould_risk',
    state: 'cleared',
    badge: 'climate',
    color: 'success',
  },
  short_button_press: { trigger: 'button_pressed', badge: 'sensor', color: 'info' },
  smoking_detected: { trigger: 'smoking_detected', badge: 'home', color: 'danger' },
  crowd_detected: { trigger: 'crowd_detected', badge: 'home', color: 'warning' },
  // Not a Minut event type: the alarm switched outside Gladys (homes read).
  alarm_turned_on: {
    trigger: 'alarm_status_changed',
    state: 'on',
    badge: 'alarm',
    color: 'primary',
  },
  alarm_turned_off: {
    trigger: 'alarm_status_changed',
    state: 'off',
    badge: 'alarm',
    color: 'neutral',
  },
};

// The `state` values of each trigger, in the order of the manifest.
const TRIGGER_STATES = {};
for (const { trigger, state } of Object.values(EVENT_TYPES)) {
  if (state) {
    TRIGGER_STATES[trigger] ??= [];
    if (!TRIGGER_STATES[trigger].includes(state)) {
      TRIGGER_STATES[trigger].push(state);
    }
  }
}
// Events of the whole home: no sensor to filter on.
const HOME_TRIGGERS = [
  TRIGGERS.SECURITY_ALARM,
  TRIGGERS.ALARM_STATUS_CHANGED,
  TRIGGERS.SMOKING_DETECTED,
  TRIGGERS.CROWD_DETECTED,
];
const SEEN_MAX = 500;
const RECENT_MAX = 20;

/**
 * @description The record kept of an event of the API.
 * @param {object} raw - A `HomeEvent`.
 * @param {string} homeId - The home it was read from.
 * @returns {object|null} `{ id, type, at, homeId, deviceId, title, soundLevel,
 * soundThreshold, noiseCount }`, null without an id or an instant.
 */
function parseEvent(raw, homeId) {
  const id = raw?.event_id === undefined || raw?.event_id === null ? '' : String(raw.event_id);
  const at = Date.parse(String(raw?.event_time ?? ''));
  if (!id || !Number.isFinite(at) || typeof raw?.event_type !== 'string') {
    return null;
  }
  const specific = raw.metadata?.event_specific_data ?? {};
  const deviceId = [specific.device_id, specific.noise_event_device_id, raw.device_id].find(
    (value) => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value),
  );
  const number = (value) =>
    Number.isFinite(Number(value)) && value !== null ? Number(value) : null;
  return {
    id: id.slice(0, 64),
    type: raw.event_type.slice(0, 64),
    at,
    homeId,
    deviceId: deviceId ?? null,
    title:
      typeof raw.user_representation?.title === 'string'
        ? raw.user_representation.title.slice(0, 200)
        : '',
    soundLevel: number(specific.sound_level),
    soundThreshold: number(specific.sound_threshold),
    noiseCount: number(specific.noise_count),
  };
}

/**
 * @description The events not seen yet and recent enough to count, oldest first.
 * @param {object[]} records - Parsed events.
 * @param {object} state - `{ since, seen }` of the home.
 * @returns {{ fresh: object[], seen: string[] }} The new events, the ids to keep.
 */
function freshEvents(records, { since = 0, seen = [] } = {}) {
  const known = new Set(seen);
  const fresh = [];
  for (const record of [...records].sort((a, b) => a.at - b.at)) {
    if (known.has(record.id)) {
      continue;
    }
    known.add(record.id);
    if (record.at >= since) {
      fresh.push(record);
    }
  }
  return { fresh, seen: [...known].slice(-SEEN_MAX) };
}

/**
 * @description The title of an event: ours when the type is known, Minut's otherwise.
 * @param {object} record - The event.
 * @param {string} language - The language.
 * @returns {string} The title.
 */
function eventTitle(record, language) {
  if (EVENT_TYPES[record.type]) {
    return t(`event_${record.type}`, language);
  }
  return record.title || t('event_other', language);
}

/**
 * @description The data of the scene event of an event.
 * @param {object} record - The event.
 * @param {object} context - `{ home: { deviceId, name }, sensor: { deviceId, name }|null,
 * language, timeZone }`.
 * @returns {{ key: string, data: object }|null} Null for a type that fires nothing.
 */
function sceneEventOf(record, { home, sensor, language, timeZone }) {
  const known = EVENT_TYPES[record.type];
  if (!known) {
    return null;
  }
  const data = {
    home: home?.deviceId ?? null,
    home_name: home?.name ?? '',
    event_type: record.type,
    event_time: new Date(record.at).toISOString(),
    time: formatTime(record.at, { language, timeZone }),
    title: eventTitle(record, language),
  };
  if (!HOME_TRIGGERS.includes(known.trigger)) {
    data.device = sensor?.deviceId ?? null;
    data.device_name = sensor?.name ?? '';
  }
  if (known.state) {
    data.state = known.state;
  }
  if (known.trigger === TRIGGERS.NOISE_DISTURBANCE) {
    data.sound_level = record.soundLevel;
    data.sound_threshold = record.soundThreshold;
    data.noise_count = record.noiseCount;
  }
  return { key: known.trigger, data };
}

/**
 * @description Keep the last events of a home for the widget, newest first.
 * @param {object[]} recent - The kept events.
 * @param {object[]} fresh - The new ones.
 * @returns {object[]} The list.
 */
function keepRecent(recent = [], fresh = []) {
  const byId = new Map([...recent, ...fresh].map((record) => [record.id, record]));
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, RECENT_MAX);
}

/**
 * @description Keep only the declared keys of a scene action result.
 * @param {object} outputs - The values.
 * @param {string[]} keys - The declared outputs.
 * @returns {object} The result.
 */
const pick = (outputs, keys) => Object.fromEntries(keys.map((key) => [key, outputs[key] ?? null]));

export {
  TRIGGERS,
  EVENT_TYPES,
  TRIGGER_STATES,
  HOME_TRIGGERS,
  SEEN_MAX,
  RECENT_MAX,
  parseEvent,
  freshEvents,
  eventTitle,
  sceneEventOf,
  keepRecent,
  pick,
};
