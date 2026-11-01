// -----------------------------------------------------------------------------
// Configuration of the Minut integration.
//
// Fields of the config_schema:
//   - `client_id`       the id of the OAuth2 client the user created in the
//                       Minut web app (Settings -> Developer tools);
//   - `client_secret`   its secret (a `secret`: never sent back to the UI,
//                       never logged);
//   - `snooze_minutes`  how long "noise monitoring off" pauses it, minutes;
//   - `language`        language of the texts Gladys does not ask for in a
//                       language (device names, scene texts): `auto` follows
//                       the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const SNOOZE = { default: 60, min: 5, max: 1440 };

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description Read the pause of the noise monitoring, within its range.
 * @param {unknown} raw - The value.
 * @returns {number} Minutes, the default when absent or out of range.
 */
function readSnooze(raw) {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(readString(raw));
  return Number.isFinite(value) && value >= SNOOZE.min && value <= SNOOZE.max
    ? Math.round(value)
    : SNOOZE.default;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ clientId, clientSecret, snoozeMinutes, language }`.
 * @example
 * normalizeConfig({ client_id: 'id', client_secret: 's' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    clientId: readString(config.client_id),
    clientSecret: readString(config.client_secret),
    snoozeMinutes: readSnooze(config.snooze_minutes),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export { AUTO_LANGUAGE, INTERNAL_KEYS, SNOOZE, readSnooze, normalizeConfig, readLanguage };
