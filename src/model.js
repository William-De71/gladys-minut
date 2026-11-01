// -----------------------------------------------------------------------------
// What the integration keeps of the answers of the Minut API: small, flat
// objects, the same whatever the version of the answer.
//
// A sensor (schema `Device`):
//   `latest_sensor_values.{temperature, humidity, sound, pressure}.value`
//   (`{ time, value }`: °C, % rH, dBA, hPa — the units of the time series of
//   the API), `battery.percent`, `offline` (no news for 3 hours),
//   `next_heartbeat_at` (the next expected report), `mount_status`
//   (mounted, unmounted, unknown, unsupported), `description` (the name given
//   in the Minut app), `home`.
// A home (schema `Home`):
//   `name`, `alarm.alarm_status` (on, off, on_grace_period, off_grace_period,
//   critical_event), `disturbance_monitoring.disturbance_monitoring_active`
//   and `.state` (idle, level_1 … level_4, response_service_dispatched,
//   snoozed).
// A value the API did not give stays null: it is never published as 0.
// -----------------------------------------------------------------------------

import { ID_PATTERN } from './minut-api.js';

const ALARM_STATUSES = ['on', 'off', 'on_grace_period', 'off_grace_period', 'critical_event'];
const NOISE_STATES = [
  'idle',
  'level_1',
  'level_2',
  'level_3',
  'level_4',
  'response_service_dispatched',
  'snoozed',
];
const VALUES = ['temperature', 'humidity', 'sound', 'pressure'];

const finite = (value) => {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};
const instant = (value) => {
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? at : null;
};
const text = (value, max = 80) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';

/**
 * @description Whether an alarm status counts as "on" (armed, arming or ringing).
 * @param {string|null} status - `alarm_status`.
 * @returns {boolean|null} Null when unknown.
 */
function alarmArmed(status) {
  if (!ALARM_STATUSES.includes(status)) {
    return null;
  }
  return status !== 'off';
}

/**
 * @description The sensor kept of a `Device` answer.
 * @param {object} raw - The answer.
 * @returns {object|null} The sensor, null without a valid id.
 */
function parseDevice(raw) {
  const id = String(raw?.device_id ?? '');
  if (!ID_PATTERN.test(id)) {
    return null;
  }
  const latest = raw.latest_sensor_values ?? {};
  const values = {};
  let valuesAt = null;
  for (const key of VALUES) {
    const value = finite(latest[key]?.value);
    if (value !== null) {
      values[key] = value;
      const at = instant(latest[key]?.time);
      valuesAt = at !== null && (valuesAt === null || at > valuesAt) ? at : valuesAt;
    }
  }
  const percent = finite(raw.battery?.percent);
  const mount = ['mounted', 'unmounted'].includes(raw.mount_status) ? raw.mount_status : null;
  return {
    id,
    homeId: ID_PATTERN.test(String(raw.home ?? '')) ? raw.home : null,
    name: text(raw.description) || `Minut ${id.slice(-6)}`,
    active: raw.active !== false,
    offline: raw.offline === true,
    lastHeardAt: instant(raw.last_heard_from_at),
    nextHeartbeatAt: instant(raw.next_heartbeat_at),
    battery: percent === null ? null : Math.min(100, Math.max(0, percent)),
    mount,
    values,
    valuesAt,
    firmware: finite(raw.firmware?.installed),
    hardware: finite(raw.hardware_version),
  };
}

/**
 * @description The home kept of a `Home` answer.
 * @param {object} raw - The answer.
 * @param {string} organizationId - The organization it was read from.
 * @returns {object|null} The home, null without a valid id.
 */
function parseHome(raw, organizationId) {
  const id = String(raw?.home_id ?? '');
  if (!ID_PATTERN.test(id)) {
    return null;
  }
  const status = ALARM_STATUSES.includes(raw.alarm?.alarm_status) ? raw.alarm.alarm_status : null;
  const monitoring = raw.disturbance_monitoring;
  const state = NOISE_STATES.includes(monitoring?.state) ? monitoring.state : null;
  return {
    id,
    organizationId,
    name: text(raw.name) || `Minut ${id.slice(-6)}`,
    timezone: text(raw.timezone, 64) || null,
    alarmStatus: status,
    noiseActive:
      typeof monitoring?.disturbance_monitoring_active === 'boolean'
        ? monitoring.disturbance_monitoring_active
        : null,
    noiseState: state,
    noiseDevice: ID_PATTERN.test(String(monitoring?.device_triggering_disturbance ?? ''))
      ? monitoring.device_triggering_disturbance
      : null,
  };
}

/**
 * @description The noise state of a home, as shown: `inactive` when the
 * noise monitoring is off in Minut.
 * @param {object} home - The home.
 * @returns {string|null} A noise state.
 */
function noiseStateOf(home) {
  if (home?.noiseActive === false) {
    return 'inactive';
  }
  return home?.noiseState ?? null;
}

/**
 * @description Whether the noise monitoring of a home is watching (on, not paused).
 * @param {object} home - The home.
 * @returns {boolean|null} Null when unknown.
 */
function noiseWatching(home) {
  if (home?.noiseActive === false) {
    return false;
  }
  if (!home?.noiseState) {
    return home?.noiseActive === true ? true : null;
  }
  return home.noiseState !== 'snoozed';
}

/**
 * @description The hourly sound levels of a `TimeSeries` answer, oldest first.
 * @param {object[]} values - `{ datetime, value, max }` (default format),
 * `{ time, value, max }` (readable) or `[timestamp, value]` (compact).
 * @returns {Array<{ at: number, value: number, max: number|null }>} The points.
 */
function parseSoundLevels(values = []) {
  const points = [];
  for (const entry of Array.isArray(values) ? values : []) {
    let at = null;
    let level = null;
    let max = null;
    if (Array.isArray(entry)) {
      const [stamp, value] = entry;
      at = finite(stamp) === null ? null : finite(stamp) * (finite(stamp) < 1e11 ? 1000 : 1);
      level = finite(value);
    } else if (entry && typeof entry === 'object') {
      at =
        instant(entry.datetime) ?? (finite(entry.time) === null ? null : finite(entry.time) * 1000);
      level = finite(entry.value);
      max = finite(entry.max);
    }
    if (at !== null && level !== null) {
      points.push({ at, value: level, max });
    }
  }
  return points.sort((a, b) => a.at - b.at);
}

export {
  parseSoundLevels,
  ALARM_STATUSES,
  NOISE_STATES,
  VALUES,
  alarmArmed,
  parseDevice,
  parseHome,
  noiseStateOf,
  noiseWatching,
};
