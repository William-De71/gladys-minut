// -----------------------------------------------------------------------------
// Times.
//
// Minut gives UTC instants (ISO 8601). Texts are written in the timezone
// of the Gladys instance (TZ, given by the supervisor).
// -----------------------------------------------------------------------------

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description An instant in RFC 3339 without milliseconds, as the API wants it.
 * @param {number} instant - The instant (ms).
 * @returns {string} "2026-11-01T18:00:00Z".
 */
const isoSeconds = (instant) => new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * @description "18:00" in the language and timezone of the user.
 * @param {number|null} instant - The instant (ms).
 * @param {object} [options] - `{ language, timeZone }`.
 * @returns {string} The time, '' when none.
 */
function formatTime(instant, { language = 'en', timeZone = defaultTimeZone() } = {}) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  return new Intl.DateTimeFormat(language, {
    timeZone,
    hour: language === 'en' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hourCycle: language === 'en' ? 'h12' : 'h23',
  }).format(new Date(instant));
}

/**
 * @description Whole minutes from one instant to another, rounded down.
 * @param {number} from - The instant (ms).
 * @param {number} to - The later instant (ms).
 * @returns {number} Minutes, at least 0.
 */
const minutesBetween = (from, to) => Math.max(0, Math.floor((to - from) / MINUTE_MS));

export {
  SECOND_MS,
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  defaultTimeZone,
  isoSeconds,
  formatTime,
  minutesBetween,
};
