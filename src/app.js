// -----------------------------------------------------------------------------
// The Minut integration: every handler, registered on a Gladys client.
//
// Brings Minut home sensors into Gladys through the official Minut API
// (OAuth2 client credentials, created in the Minut web app):
//   - devices (devices.js): one per sensor (temperature, humidity, sound
//     level, pressure, battery, mounting plate) and one per home (alarm on or
//     off, noise monitoring watching or paused, their states in words);
//   - scene triggers (events.js): the events of the homes (noise, alarms,
//     tamper, offline, battery, climate, mould…) and the alarm switched
//     outside Gladys;
//   - scene actions: turn the alarm on or off, silence it, pause or resume
//     the noise monitoring, read the status of a home;
//   - dashboard widgets (widgets.js): a home at a glance, its last events,
//     the sound level of a sensor over 24 hours.
//
// Reading plan, on its own timer (never a Gladys poll), within the rate limit
// of the API (120 requests a minute, see minut-api.js):
//   - the events of each home every minute (a minute more per 50 homes);
//   - the homes (alarm, noise monitoring) every 5 minutes, and soon after an
//     alarm or noise event or a command;
//   - the sensors when their next heartbeat is due (`next_heartbeat_at` + 2
//     minutes, between 5 and 60 minutes): Minut sensors report about once an
//     hour, or at once on an event — reading them more often brings nothing
//     and gets the client blocked. An event of a sensor brings its read
//     forward (not more than once every 2 minutes);
//   - the organizations every 6 hours.
// A 429 pauses everything (1 minute, doubled up to 30, or the Retry-After);
// refused credentials stop until the configuration changes. Transport: cloud.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake Minut API (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE, SNOOZE } from './config.js';
import { createMinutClient, MinutError, ID_PATTERN } from './minut-api.js';
import {
  parseDevice,
  parseHome,
  parseSoundLevels,
  alarmArmed,
  noiseStateOf,
  noiseWatching,
} from './model.js';
import { createStore, DEFAULT_PATH } from './store.js';
import {
  KINDS,
  WRITABLE,
  idsOf,
  parseExternalId,
  givenKeysOf,
  buildDevice,
  buildStates,
} from './devices.js';
import { EVENT_TYPES, parseEvent, freshEvents, sceneEventOf, keepRecent, pick } from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  buildHomeWidget,
  buildEventsWidget,
  buildSoundHistoryWidget,
} from './widgets.js';
import { defaultTimeZone, isoSeconds, MINUTE_MS, HOUR_MS, DAY_MS } from './time.js';
import { t, all, allOf, alarmText, noiseText, decimal } from './i18n.js';

const ACTIONS = { TEST_CONNECTION: 'test_connection', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = {
  SET_ALARM: 'set_alarm',
  SILENCE_ALARM: 'silence_alarm',
  SET_NOISE_MONITORING: 'set_noise_monitoring',
  REFRESH_STATUS: 'refresh_status',
};
const OUTPUTS = {
  set_alarm: ['home_name', 'alarm_status', 'alarm_on'],
  silence_alarm: ['home_name', 'alarm_status', 'alarm_on'],
  set_noise_monitoring: ['home_name', 'noise_state', 'noise_monitoring'],
  refresh_status: [
    'home_name',
    'alarm_status',
    'alarm_on',
    'noise_state',
    'noise_monitoring',
    'sensors_online',
    'sensors_offline',
    'temperature',
    'humidity',
    'sound_level',
    'lowest_battery',
    'summary',
  ],
};
const TICK_MS = 15 * 1000;
const EVENTS_EVERY_MS = MINUTE_MS;
const HOMES_PER_EVENT_MINUTE = 50;
const HOMES_EVERY_MS = 5 * MINUTE_MS;
const HOMES_SOON_MS = 30 * 1000;
const ORGANIZATIONS_EVERY_MS = 6 * HOUR_MS;
const DEVICES = { marginMs: 2 * MINUTE_MS, minMs: 5 * MINUTE_MS, maxMs: 60 * MINUTE_MS };
const DEVICES_DEFAULT_MS = 30 * MINUTE_MS;
const DEVICES_SOON = { delayMs: 30 * 1000, gapMs: 2 * MINUTE_MS };
const HISTORY_EVERY_MS = HOUR_MS;
const HISTORY_WANTED_MS = DAY_MS;
const HISTORY_RETRY_MS = 5 * MINUTE_MS;
// Events older than this when they are first seen are never fired (a restart
// after a long stop does not replay the past).
const EVENTS_MAX_AGE_MS = 15 * MINUTE_MS;
const EVENTS_OVERLAP_MS = 10 * MINUTE_MS;
const EVENTS_MAX_PAGES = 5;
const PAUSE_MS = MINUTE_MS;
const PAUSE_MAX_MS = 30 * MINUTE_MS;
const EXPECT_MS = 10 * MINUTE_MS;
const FRESH_MS = 2 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of the Minut API (tests).
 * @param {string} [options.baseUrl] - The API root (tests).
 * @param {object} [options.limits] - Rate limits of the client (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of the texts (TZ by default).
 * @param {boolean} [options.timers] - Arm the timer (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    limits,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let language = 'en';
  let createdDevices = new Set();
  let authError = null;
  let roundError = null;
  let noOrganization = false;
  let pause = { until: 0, ms: 0 };
  let requests = 0;
  let lastStatus = null;
  let lastDiscovery = null;
  let timer = null;
  let busy = null;
  let stopped = false;
  const due = { organizationsAt: 0, homesAt: 0, devicesAt: 0, eventsAt: 0 };
  const last = { homesAt: 0, devicesAt: 0 };
  // homeId -> { armed, until }: the alarm state a command of Gladys asked for.
  const expected = new Map();
  const historyTried = new Map();

  const store = createStore({ path: storePath, logger });
  const snapshot = () => store.data.snapshot;

  const api = createMinutClient({
    getCredentials: () => ({ clientId: config.clientId, clientSecret: config.clientSecret }),
    onRequest: () => {
      requests += 1;
    },
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(limits ? { limits } : {}),
  });

  const configured = () => Boolean(config.clientId && config.clientSecret);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Whether Minut asked to slow down (a 429).
   * @returns {boolean} True while paused.
   */
  const paused = () => now() < pause.until;
  const pauseMinutes = () => Math.max(1, Math.ceil((pause.until - now()) / MINUTE_MS));

  const homes = () => snapshot().homes;
  const sensors = () => snapshot().devices;
  const homeById = (id) => homes().find((home) => home.id === id) ?? null;
  const sensorById = (id) => sensors().find((sensor) => sensor.id === id) ?? null;
  const sensorsOf = (home) => sensors().filter((sensor) => sensor.homeId === home.id);

  /**
   * @description The message of an error, for a user.
   * @param {object} err - A MinutError (or `{ kind, message, errorKey }`).
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err?.errorKey === 'motion_disabled_for_organization') {
      return t('errMotionDisabled', lang);
    }
    if (err?.errorKey === 'noise_monitoring_not_enabled') {
      return t('errNoiseNotEnabled', lang);
    }
    const key = {
      no_credentials: 'errNoCredentials',
      auth: 'errAuth',
      forbidden: 'errForbidden',
      rate_limit: 'errRateLimit',
      unreachable: 'errUnreachable',
      no_organization: 'errNoOrganization',
      no_alarm: 'errNoAlarm',
      noise_off: 'errNoiseNotEnabled',
    }[err?.kind];
    return t(key ?? 'errFailed', lang, { detail: String(err?.message ?? '').slice(0, 80) });
  }

  const errorMessage = (err) => allOf((lang) => errorText(err, lang).slice(0, 200));

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const clipped = Object.fromEntries(
      Object.entries(message).map(([lang, text]) => [lang, text.trim().slice(0, 200)]),
    );
    const signature = JSON.stringify([connected, clipped]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, clipped);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!configured()) {
      await reportStatus(false, all('errNoCredentials'));
    } else if (authError) {
      await reportStatus(false, errorMessage(authError));
    } else if (paused()) {
      await reportStatus(true, all('statusPaused', { minutes: pauseMinutes() }));
    } else if (roundError) {
      await reportStatus(false, errorMessage(roundError));
    } else if (noOrganization) {
      await reportStatus(false, all('errNoOrganization'));
    } else if (snapshot().at) {
      await reportStatus(
        true,
        all('statusConnected', { homes: homes().length, devices: sensors().length }),
      );
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const list = await gladys.getDevices();
      createdDevices = new Set(list.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} [keys] - The widgets, all by default.
   */
  function refreshWidgets(keys = Object.values(WIDGETS)) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one, while connected.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      if (gladys.connected === false) {
        return;
      }
      logger.info(`Minut ${data.home_name}: ${key} (${data.event_type})`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Devices -----------------------------------------------------------------------

  /**
   * @description Grow the features of a sensor or a home with what it gives now.
   * @param {string} kind - `sensor` or `home`.
   * @param {object} source - The sensor or the home.
   */
  function growFeatures(kind, source) {
    const known = store.data.features[source.id] ?? [];
    store.data.features[source.id] = [...new Set([...known, ...givenKeysOf(kind, source)])];
  }

  /**
   * @description The Gladys device of a sensor or a home: its external id and name.
   * @param {string} kind - `sensor` or `home`.
   * @param {object|null} source - The sensor or the home.
   * @returns {{ deviceId: string, name: string }|null} The reference.
   */
  const referenceOf = (kind, source) =>
    source ? { deviceId: idsOf(gladys, kind, source.id).device, name: source.name } : null;

  /**
   * @description Offer the homes and the sensors, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const list = [
      ...homes().map((home) => [KINDS.HOME, home]),
      ...sensors().map((sensor) => [KINDS.SENSOR, sensor]),
    ]
      .filter(([, source]) => (store.data.features[source.id] ?? []).length > 0)
      .map(([kind, source]) =>
        buildDevice(gladys, kind, source, store.data.features[source.id], lang),
      );
    const signature = JSON.stringify(list);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(list);
      lastDiscovery = signature;
    }
    return list.length;
  }

  /**
   * @description Publish the states of a sensor or a home, when it exists in Gladys.
   * @param {string} kind - `sensor` or `home`.
   * @param {object} source - The sensor or the home.
   * @returns {Promise<void>}
   */
  async function publishStates(kind, source) {
    if (!createdDevices.has(idsOf(gladys, kind, source.id).device)) {
      return;
    }
    const states = buildStates(gladys, kind, source, store.data.features[source.id], {
      language: textLanguage(),
    });
    if (states.length) {
      await gladys
        .publishChangedStates(states)
        .catch((err) =>
          logger.warn(`Unable to publish the states of ${source.name}: ${err.message}`),
        );
    }
  }

  async function publishAllStates() {
    for (const home of homes()) {
      await publishStates(KINDS.HOME, home);
    }
    for (const sensor of sensors()) {
      await publishStates(KINDS.SENSOR, sensor);
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /**
   * @description Handle an error of a read: the status, the pause.
   * @param {Error} err - The error.
   */
  function readFailed(err) {
    const error = err instanceof MinutError ? err : new MinutError('failed', String(err?.message));
    logger.warn(`Minut (${error.kind}): ${error.message}`);
    if (error.kind === 'auth' || error.kind === 'no_credentials') {
      authError = { kind: error.kind, message: error.message };
    } else if (error.kind === 'rate_limit') {
      pause.ms = Math.min(PAUSE_MAX_MS, pause.ms ? pause.ms * 2 : PAUSE_MS);
      pause.until = now() + Math.max(pause.ms, Math.min(error.retryAfterMs ?? 0, PAUSE_MAX_MS));
    } else {
      roundError = { kind: error.kind, message: error.message, errorKey: error.errorKey };
    }
  }

  async function readOrganizations() {
    const list = await api.organizations();
    snapshot().organizations = list.map((organization) => ({
      id: organization.id,
      name: String(organization.name ?? '').slice(0, 80),
    }));
    noOrganization = list.length === 0;
    due.organizationsAt = now() + ORGANIZATIONS_EVERY_MS;
  }

  /**
   * @description Whether the alarm of a home moved outside Gladys: an event.
   * @param {object} home - The home just read.
   * @param {Array} events - Where to add the scene event.
   */
  function checkAlarm(home, events) {
    const armed = alarmArmed(home.alarmStatus);
    if (armed === null) {
      return;
    }
    const wish = expected.get(home.id);
    if (wish && now() < wish.until) {
      // A command of Gladys is on its way: the read only confirms it (or lags).
      if (wish.armed === armed) {
        expected.delete(home.id);
        store.data.alarm[home.id] = armed;
      }
      return;
    }
    expected.delete(home.id);
    const previous = store.data.alarm[home.id];
    store.data.alarm[home.id] = armed;
    if (previous === undefined || previous === armed) {
      return;
    }
    const record = {
      id: `alarm-${home.id}-${now()}`,
      type: armed ? 'alarm_turned_on' : 'alarm_turned_off',
      at: now(),
      homeId: home.id,
      deviceId: null,
      title: '',
    };
    const state = eventsState(home.id);
    state.recent = keepRecent(state.recent, [record]);
    const scene = sceneEventOf(record, {
      home: referenceOf(KINDS.HOME, home),
      sensor: null,
      language: textLanguage(),
      timeZone,
    });
    scene.data.alarm_status = home.alarmStatus;
    events.push(scene);
  }

  /**
   * @description Read the homes of every organization.
   * @param {boolean} quiet - Fire no event (a scene action).
   * @returns {Promise<void>}
   */
  async function readHomes(quiet) {
    const list = [];
    for (const organization of snapshot().organizations) {
      for (const raw of await api.homes(organization.id)) {
        const home = parseHome(raw, organization.id);
        if (home && !list.some((other) => other.id === home.id)) {
          list.push(home);
        }
      }
    }
    snapshot().homes = list;
    snapshot().at = now();
    last.homesAt = now();
    due.homesAt = now() + HOMES_EVERY_MS;
    const events = [];
    for (const home of list) {
      growFeatures(KINDS.HOME, home);
      if (!quiet) {
        checkAlarm(home, events);
      }
    }
    await publishEvents(events);
    for (const home of list) {
      await publishStates(KINDS.HOME, home);
    }
  }

  /**
   * @description The next read of the sensors: their next heartbeat, bounded.
   * @param {object[]} list - The sensors.
   * @returns {number} The instant (ms).
   */
  function nextSensorsRead(list) {
    const next = list
      .map((sensor) => sensor.nextHeartbeatAt)
      .filter((at) => Number.isFinite(at) && at > now() - DEVICES.marginMs);
    const delay = next.length ? Math.min(...next) + DEVICES.marginMs - now() : DEVICES_DEFAULT_MS;
    return now() + Math.min(DEVICES.maxMs, Math.max(DEVICES.minMs, delay));
  }

  /**
   * @description Read the hourly sound levels of the last 24 hours of a sensor.
   * @param {object} sensor - The sensor.
   * @returns {Promise<boolean>} Whether new levels were read.
   */
  async function readHistory(sensor) {
    historyTried.set(sensor.id, now());
    try {
      const values = await api.soundLevels(sensor.id, {
        startAt: isoSeconds(now() - DAY_MS),
        endAt: isoSeconds(now()),
      });
      const entry = (store.data.history[sensor.id] ??= {});
      entry.at = now();
      entry.points = parseSoundLevels(values).slice(-48);
      return true;
    } catch (err) {
      // The chart is a comfort: the status stays as it is.
      logger.warn(
        `Minut sound history of ${sensor.name} (${err.kind ?? 'failed'}): ${err.message}`,
      );
      if (err.kind === 'rate_limit') {
        throw err;
      }
      return false;
    }
  }

  /**
   * @description Read the sensors of every organization (and the wanted histories).
   * @returns {Promise<void>}
   */
  async function readSensors() {
    const list = [];
    for (const organization of snapshot().organizations) {
      for (const raw of await api.devices(organization.id)) {
        const sensor = parseDevice(raw);
        if (sensor?.active && !list.some((other) => other.id === sensor.id)) {
          list.push(sensor);
        }
      }
    }
    snapshot().devices = list;
    last.devicesAt = now();
    due.devicesAt = nextSensorsRead(list);
    for (const sensor of list) {
      growFeatures(KINDS.SENSOR, sensor);
      await publishStates(KINDS.SENSOR, sensor);
    }
    for (const sensor of list) {
      const history = store.data.history[sensor.id];
      if (
        history?.wanted > now() - HISTORY_WANTED_MS &&
        (!history.at || now() - history.at >= HISTORY_EVERY_MS)
      ) {
        await readHistory(sensor);
      }
    }
  }

  /**
   * @description What /data keeps of the events of a home.
   * @param {string} homeId - The home.
   * @returns {object} `{ since, cursor, seen, recent }`.
   */
  function eventsState(homeId) {
    store.data.events[homeId] ??= { since: now(), cursor: now(), seen: [], recent: [] };
    return store.data.events[homeId];
  }

  /**
   * @description Read the new events of every home and fire their triggers.
   * @returns {Promise<void>}
   */
  async function pollEvents() {
    const list = homes();
    due.eventsAt =
      now() + EVENTS_EVERY_MS * Math.max(1, Math.ceil(list.length / HOMES_PER_EVENT_MINUTE));
    let soonHomes = false;
    let soonSensors = false;
    for (const home of list) {
      const first = !store.data.events[home.id];
      const state = eventsState(home.id);
      if (first) {
        // From now on only: never replay what happened before the first start.
        continue;
      }
      const start = Math.max(state.cursor - EVENTS_OVERLAP_MS, now() - EVENTS_MAX_AGE_MS);
      const polledAt = now();
      const records = [];
      for (let page = 0; page < EVENTS_MAX_PAGES; page += 1) {
        const answer = await api.homeEvents(home.id, {
          startAt: isoSeconds(start),
          offset: page * 50,
        });
        records.push(...answer.events.map((raw) => parseEvent(raw, home.id)).filter(Boolean));
        if (answer.events.length < answer.limit) {
          break;
        }
      }
      const { fresh, seen } = freshEvents(records, {
        since: Math.max(state.since, now() - EVENTS_MAX_AGE_MS),
        seen: state.seen,
      });
      state.seen = seen;
      state.cursor = polledAt;
      if (!fresh.length) {
        continue;
      }
      state.recent = keepRecent(state.recent, fresh);
      refreshWidgets([WIDGETS.EVENTS]);
      const scenes = [];
      for (const record of fresh) {
        const sensor = record.deviceId ? sensorById(record.deviceId) : null;
        const scene = sceneEventOf(record, {
          home: referenceOf(KINDS.HOME, home),
          sensor: referenceOf(KINDS.SENSOR, sensor),
          language: textLanguage(),
          timeZone,
        });
        if (scene) {
          scenes.push(scene);
        }
        const trigger = EVENT_TYPES[record.type]?.trigger;
        if (['noise_disturbance', 'security_alarm', 'alarm_heard'].includes(trigger)) {
          soonHomes = true;
        }
        if (record.deviceId) {
          soonSensors = true;
        }
      }
      await publishEvents(scenes);
    }
    // An event means the sensor just reported: its values are new.
    if (soonHomes) {
      due.homesAt = Math.min(due.homesAt, Math.max(now(), last.homesAt + HOMES_SOON_MS));
    }
    if (soonSensors) {
      due.devicesAt = Math.min(
        due.devicesAt,
        Math.max(now() + DEVICES_SOON.delayMs, last.devicesAt + DEVICES_SOON.gapMs),
      );
    }
  }

  /**
   * @description One round of the timer: read what is due.
   * @param {object} [options] - `{ force, user, quiet }`: `force` reads the
   * organizations, homes and sensors now; `user` (asked by the user) reads
   * even after refused credentials; `quiet` (a scene action) fires no event
   * and reads no event.
   * @returns {Promise<void>}
   */
  function tick({ force = false, user = false, quiet = false } = {}) {
    if (busy) {
      return busy.then(() => (force ? tick({ force, user, quiet }) : undefined));
    }
    busy = (async () => {
      if (!configured() || (authError && !user) || paused()) {
        await refreshStatus();
        return;
      }
      const before = JSON.stringify([snapshot().homes, snapshot().devices]);
      try {
        if (user) {
          authError = null;
        }
        if (force || due.organizationsAt <= now() || !snapshot().organizations.length) {
          await readOrganizations();
        }
        if (force || due.homesAt <= now()) {
          await readHomes(quiet);
        }
        if (force || due.devicesAt <= now()) {
          await readSensors();
        }
        if (!quiet && due.eventsAt <= now()) {
          await pollEvents();
        }
        authError = null;
        roundError = null;
        pause.ms = 0;
      } catch (err) {
        readFailed(err);
      }
      await store.save();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      if (JSON.stringify([snapshot().homes, snapshot().devices]) !== before) {
        refreshWidgets();
      }
      await refreshStatus();
    })().finally(() => {
      busy = null;
    });
    return busy;
  }

  /**
   * @description (Re)arm the timer.
   */
  function schedule() {
    clearInterval(timer);
    if (!timers || stopped) {
      return;
    }
    timer = setInterval(() => {
      tick().catch((err) => logger.error('Minut round', err));
    }, TICK_MS);
    timer.unref?.();
  }

  /**
   * @description Read everything, offer the devices, arm the timer.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    authError = null;
    roundError = null;
    noOrganization = false;
    await tick({ force: true, user: true });
    await publishAllStates();
    schedule();
  }

  // --- Commands ----------------------------------------------------------------------

  /**
   * @description The home a widget, a scene action or a device targets.
   * @param {unknown} externalId - A home or sensor device external id, or a Minut id.
   * @returns {object|null} The home, the first one by default.
   */
  function targetHome(externalId) {
    const value = String(externalId ?? '');
    const parsed = parseExternalId(value);
    const id = parsed
      ? parsed.kind === KINDS.HOME
        ? parsed.id
        : sensorById(parsed.id)?.homeId
      : ID_PATTERN.test(value)
        ? value
        : null;
    if (!id && value) {
      return null;
    }
    return id ? homeById(id) : (homes()[0] ?? null);
  }

  /**
   * @description Check that commands can be sent.
   * @param {object|null} home - The home.
   * @throws {MinutError} When not.
   */
  function checkCommand(home) {
    if (!configured()) {
      throw new MinutError('no_credentials', 'No client id or secret');
    }
    if (!home) {
      throw new MinutError('not_found', 'No Minut home');
    }
    if (paused()) {
      throw new MinutError('rate_limit', 'Paused after too many requests');
    }
  }

  /**
   * @description After a command: publish, refresh, read the home again soon.
   * @param {object} home - The home.
   * @returns {Promise<void>}
   */
  async function afterCommand(home) {
    growFeatures(KINDS.HOME, home);
    due.homesAt = Math.min(due.homesAt, now() + HOMES_SOON_MS);
    await store.save();
    await publishStates(KINDS.HOME, home);
    refreshWidgets([WIDGETS.HOME]);
  }

  /**
   * @description Turn the alarm of a home on or off.
   * @param {object|null} home - The home.
   * @param {string} status - `on` or `off`.
   * @returns {Promise<object>} The home.
   */
  async function commandAlarm(home, status) {
    checkCommand(home);
    if (!home.alarmStatus) {
      throw new MinutError('no_alarm', 'This home has no security alarm');
    }
    const answer = await api.setAlarm(home.id, status);
    home.alarmStatus = alarmArmed(answer?.alarm_status) === null ? status : answer.alarm_status;
    const armed = alarmArmed(home.alarmStatus);
    expected.set(home.id, { armed, until: now() + EXPECT_MS });
    store.data.alarm[home.id] = armed;
    logger.info(`Minut ${home.name}: alarm ${home.alarmStatus} (asked by Gladys)`);
    await afterCommand(home);
    return home;
  }

  /**
   * @description Silence the ongoing alarm of a home.
   * @param {object|null} home - The home.
   * @returns {Promise<object>} The home.
   */
  async function commandSilence(home) {
    checkCommand(home);
    const answer = await api.silenceAlarm(home.id);
    if (alarmArmed(answer?.alarm_status) !== null) {
      home.alarmStatus = answer.alarm_status;
      const armed = alarmArmed(home.alarmStatus);
      expected.set(home.id, { armed, until: now() + EXPECT_MS });
      store.data.alarm[home.id] = armed;
    }
    logger.info(`Minut ${home.name}: alarm silenced (asked by Gladys)`);
    await afterCommand(home);
    return home;
  }

  /**
   * @description Pause or resume the noise alerts of a home.
   * @param {object|null} home - The home.
   * @param {string} action - `pause` or `resume`.
   * @param {number} [minutes] - The pause.
   * @returns {Promise<object>} The home.
   */
  async function commandNoise(home, action, minutes = config.snoozeMinutes) {
    checkCommand(home);
    if (home.noiseActive === false) {
      throw new MinutError('noise_off', 'Noise monitoring is off for this home');
    }
    const answer = await api.disturbance(
      home.id,
      action === 'pause' ? 'snooze' : 'end_snooze',
      Math.round(minutes * 60),
    );
    home.noiseState =
      typeof answer?.state === 'string' ? answer.state : action === 'pause' ? 'snoozed' : 'idle';
    logger.info(`Minut ${home.name}: noise monitoring ${home.noiseState} (asked by Gladys)`);
    await afterCommand(home);
    return home;
  }

  /**
   * @description A pause length from a field, within the bounds.
   * @param {unknown} raw - The value.
   * @returns {number} Minutes.
   */
  const snoozeOf = (raw) => {
    const value = Number(raw);
    return Number.isFinite(value) && value >= SNOOZE.min && value <= SNOOZE.max
      ? Math.round(value)
      : config.snoozeMinutes;
  };

  /**
   * @description An Error to throw from a handler, with a readable message.
   * @param {Error} err - The error.
   * @returns {Error} The error, its message in English.
   */
  function asError(err) {
    if (err instanceof MinutError) {
      if (err.kind === 'rate_limit') {
        readFailed(err);
      }
      return new Error(errorText(err, 'en'));
    }
    return err;
  }

  gladys.onSetValue(async (device, feature, value) => {
    const parsed = parseExternalId(feature?.external_id);
    if (!parsed || parsed.kind !== KINDS.HOME) {
      throw new Error(`Feature ${feature?.external_id} cannot be set`);
    }
    const home = homeById(parsed.id);
    try {
      if (parsed.feature === WRITABLE.ALARM) {
        await commandAlarm(home, Number(value) ? 'on' : 'off');
      } else if (parsed.feature === WRITABLE.NOISE_MONITORING) {
        await commandNoise(home, Number(value) ? 'resume' : 'pause');
      } else {
        throw new Error(`Feature ${parsed.feature} cannot be set`);
      }
    } catch (err) {
      throw asError(err);
    }
  });

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description The common start of a home widget: configured, a home.
   * @param {object} settings - The widget settings.
   * @param {string} lang - The language.
   * @returns {{ home?: object, content?: object }} The home, or the content to show.
   */
  function widgetHome(settings, lang) {
    if (!configured()) {
      return { content: messageContent(t('errNoCredentials', lang)) };
    }
    if (authError) {
      return { content: messageContent(errorText(authError, lang)) };
    }
    const home = targetHome(settings?.home);
    if (!home) {
      return {
        content: messageContent(noOrganization ? t('errNoOrganization', lang) : t('noHome', lang)),
      };
    }
    return { home };
  }

  gladys.onWidgetGet(WIDGETS.HOME, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { home, content } = widgetHome(settings, lang);
    if (content) {
      return content;
    }
    return buildHomeWidget({
      home,
      sensors: sensorsOf(home),
      at: snapshot().at,
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetGet(WIDGETS.EVENTS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { home, content } = widgetHome(settings, lang);
    if (content) {
      return content;
    }
    const state = store.data.events[home.id];
    return buildEventsWidget({
      home,
      events: state?.recent ?? [],
      sensorName: (id) => sensorById(id)?.name ?? null,
      at: state?.cursor ?? null,
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetGet(WIDGETS.SOUND_HISTORY, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!configured()) {
      return messageContent(t('errNoCredentials', lang));
    }
    const parsed = parseExternalId(settings.device);
    const sensor =
      parsed?.kind === KINDS.SENSOR
        ? sensorById(parsed.id)
        : settings.device
          ? null
          : (sensors().find((item) => Number.isFinite(item.values?.sound)) ?? sensors()[0] ?? null);
    if (!sensor) {
      return messageContent(t('noSensor', lang));
    }
    const entry = (store.data.history[sensor.id] ??= {});
    entry.wanted = now();
    const stale = !entry.at || now() - entry.at >= HISTORY_EVERY_MS;
    const tried = historyTried.get(sensor.id) ?? 0;
    if (stale && !authError && !paused() && now() - tried >= HISTORY_RETRY_MS) {
      // Read in the background: the widget answers now and refreshes after.
      readHistory(sensor)
        .then((read) => {
          if (read) {
            refreshWidgets([WIDGETS.SOUND_HISTORY]);
          }
          return store.save();
        })
        .catch((err) => readFailed(err));
    }
    return buildSoundHistoryWidget({ sensor, history: entry, language: lang, timeZone });
  });

  gladys.onWidgetAction(WIDGETS.HOME, async (actionKey, params = {}) => {
    const home = targetHome(params.home);
    try {
      switch (actionKey) {
        case WIDGET_ACTIONS.ALARM_ON:
          await commandAlarm(home, 'on');
          return all('toastAlarmOn', { name: home.name });
        case WIDGET_ACTIONS.ALARM_OFF:
          await commandAlarm(home, 'off');
          return all('toastAlarmOff', { name: home.name });
        case WIDGET_ACTIONS.SILENCE:
          await commandSilence(home);
          return all('toastSilenced', { name: home.name });
        case WIDGET_ACTIONS.NOISE_PAUSE:
          await commandNoise(home, 'pause');
          return all('toastNoisePaused', { name: home.name, minutes: config.snoozeMinutes });
        case WIDGET_ACTIONS.NOISE_RESUME:
          await commandNoise(home, 'resume');
          return all('toastNoiseResumed', { name: home.name });
        default:
          throw new Error(`Unknown action ${actionKey}`);
      }
    } catch (err) {
      if (!(err instanceof MinutError)) {
        throw err;
      }
      if (err.kind === 'rate_limit') {
        readFailed(err);
      }
      return errorMessage(err);
    }
  });

  // --- Scene actions -----------------------------------------------------------------

  /**
   * @description The outputs describing the alarm and noise of a home.
   * @param {object} home - The home.
   * @returns {object} Outputs.
   */
  const homeOutputs = (home) => ({
    home_name: home.name,
    alarm_status: home.alarmStatus,
    alarm_on: alarmArmed(home.alarmStatus),
    noise_state: noiseStateOf(home),
    noise_monitoring: noiseWatching(home),
  });

  /**
   * @description Run a scene action, its Minut errors in plain words.
   * @param {Function} run - The action.
   * @returns {Promise<object>} Its outputs.
   */
  async function sceneAction(run) {
    try {
      return await run();
    } catch (err) {
      throw asError(err);
    }
  }

  gladys.onSceneAction(SCENE_ACTIONS.SET_ALARM, (fields = {}) =>
    sceneAction(async () => {
      const home = await commandAlarm(
        targetHome(fields.home),
        fields.state === 'off' ? 'off' : 'on',
      );
      return pick(homeOutputs(home), OUTPUTS.set_alarm);
    }),
  );

  gladys.onSceneAction(SCENE_ACTIONS.SILENCE_ALARM, (fields = {}) =>
    sceneAction(async () => {
      const home = await commandSilence(targetHome(fields.home));
      return pick(homeOutputs(home), OUTPUTS.silence_alarm);
    }),
  );

  gladys.onSceneAction(SCENE_ACTIONS.SET_NOISE_MONITORING, (fields = {}) =>
    sceneAction(async () => {
      const home = await commandNoise(
        targetHome(fields.home),
        fields.state === 'resume' ? 'resume' : 'pause',
        snoozeOf(fields.minutes),
      );
      return pick(homeOutputs(home), OUTPUTS.set_noise_monitoring);
    }),
  );

  gladys.onSceneAction(SCENE_ACTIONS.REFRESH_STATUS, (fields = {}) =>
    sceneAction(async () => {
      if (!configured()) {
        throw new MinutError('no_credentials', 'No client id or secret');
      }
      if (!snapshot().at || now() - snapshot().at > FRESH_MS) {
        await tick({ force: true, user: true, quiet: true });
      }
      const home = targetHome(fields.home);
      if (!home) {
        throw roundError
          ? new MinutError(roundError.kind, roundError.message)
          : new MinutError('not_found', 'No Minut home');
      }
      const lang = textLanguage();
      const list = sensorsOf(home);
      const values = (key) => list.map((sensor) => sensor.values?.[key]).filter(Number.isFinite);
      const mean = (items) =>
        items.length
          ? Math.round((items.reduce((sum, item) => sum + item, 0) / items.length) * 10) / 10
          : null;
      const temperature = mean(values('temperature'));
      const humidity = mean(values('humidity'));
      const sounds = values('sound');
      const batteries = list.map((sensor) => sensor.battery).filter(Number.isFinite);
      const offline = list.filter((sensor) => sensor.offline).length;
      const summary = [
        t('summaryHome', lang, {
          home: home.name,
          alarm: (alarmText(home.alarmStatus, lang) || '–').toLocaleLowerCase(lang),
          noise: (noiseText(noiseStateOf(home), lang) || '–').toLocaleLowerCase(lang),
        }),
        temperature !== null && humidity !== null
          ? t('summaryClimate', lang, {
              temperature: decimal(temperature, lang),
              humidity: decimal(humidity, lang, 0),
            })
          : '',
        offline ? t('summaryOffline', lang, { count: offline }) : '',
      ]
        .filter(Boolean)
        .join(' ');
      return pick(
        {
          ...homeOutputs(home),
          sensors_online: list.length - offline,
          sensors_offline: offline,
          temperature,
          humidity,
          sound_level: sounds.length ? Math.round(Math.max(...sounds)) : null,
          lowest_battery: batteries.length ? Math.round(Math.min(...batteries)) : null,
          summary,
        },
        OUTPUTS.refresh_status,
      );
    }),
  );

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!configured()) {
      return all('errNoCredentials');
    }
    authError = null;
    roundError = null;
    await tick({ force: true, user: true });
    if (authError) {
      return errorMessage(authError);
    }
    if (paused()) {
      return all('statusPaused', { minutes: pauseMinutes() });
    }
    if (roundError) {
      return errorMessage(roundError);
    }
    if (noOrganization) {
      return all('errNoOrganization');
    }
    await publishAllStates();
    return allOf((lang) =>
      t('testDone', lang, {
        organizations:
          snapshot()
            .organizations.map((item) => item.name)
            .join(', ') || '0',
        homes:
          homes()
            .map((home) => home.name)
            .join(', ') || '0',
        devices: sensors().length,
      }).slice(0, 1000),
    );
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      clientId: config.clientId ? `${config.clientId.slice(0, 4)}…` : 'missing',
      clientSecret: config.clientSecret ? 'set' : 'missing',
      language: config.language,
      snoozeMinutes: config.snoozeMinutes,
      requests,
      paused: paused() ? new Date(pause.until).toISOString() : null,
      authError: authError ? `${authError.kind}: ${authError.message}` : null,
      roundError: roundError ? `${roundError.kind}: ${roundError.message}` : null,
      readAt: snapshot().at ? new Date(snapshot().at).toISOString() : null,
      due: Object.fromEntries(
        Object.entries(due).map(([key, at]) => [key, at ? new Date(at).toISOString() : null]),
      ),
      organizations: snapshot().organizations.length,
      homes: homes().map((home) => ({
        id: home.id,
        alarm: home.alarmStatus,
        noiseActive: home.noiseActive,
        noise: home.noiseState,
        features: store.data.features[home.id] ?? [],
        created: createdDevices.has(idsOf(gladys, KINDS.HOME, home.id).device),
        events: store.data.events[home.id]?.recent?.length ?? 0,
      })),
      sensors: sensors().map((sensor) => ({
        id: sensor.id,
        home: sensor.homeId,
        offline: sensor.offline,
        values: Object.keys(sensor.values),
        valuesAt: sensor.valuesAt ? new Date(sensor.valuesAt).toISOString() : null,
        nextHeartbeat: sensor.nextHeartbeatAt
          ? new Date(sensor.nextHeartbeatAt).toISOString()
          : null,
        battery: sensor.battery,
        mount: sensor.mount,
        firmware: sensor.firmware,
        hardware: sensor.hardware,
        features: store.data.features[sensor.id] ?? [],
        created: createdDevices.has(idsOf(gladys, KINDS.SENSOR, sensor.id).device),
      })),
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Minut diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await tick({ force: true, user: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishAllStates();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const before = `${config.clientId}\n${config.clientSecret}`;
    await loadConfig(rawConfig);
    logger.info('Configuration updated');
    lastStatus = null;
    lastDiscovery = null;
    if (`${config.clientId}\n${config.clientSecret}` !== before) {
      // New credentials: a new token, and a pause lifted.
      api.reset();
      pause = { until: 0, ms: 0 };
    }
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(timer);
    await busy?.catch(() => {});
    await store.save();
  });

  return {
    store,
    api,
    tick,
    due,
    getHomes: homes,
    getSensors: sensors,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  OUTPUTS,
  TICK_MS,
  EVENTS_EVERY_MS,
  HOMES_EVERY_MS,
  DEVICES,
  DEVICES_DEFAULT_MS,
  HISTORY_EVERY_MS,
  EVENTS_MAX_AGE_MS,
  PAUSE_MS,
  PAUSE_MAX_MS,
  FRESH_MS,
};
