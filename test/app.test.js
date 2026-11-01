// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Minut API answering after its reference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, OUTPUTS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  fakeMinut,
  storePath,
  silent,
  homeEvent,
  NOW,
  TZ,
  CLIENT_ID,
  CLIENT_SECRET,
  CHALET,
  STUDIO,
  LIVING,
  BEDROOM,
  GONE,
} from './helpers/fake-api.js';

const CONFIG = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, language: 'en' };
const PREFIX = 'ext:test-integration';
const HOME_ID = `${PREFIX}:home:${CHALET}`;
const LIVING_ID = `${PREFIX}:sensor:${LIVING}`;
const BEDROOM_ID = `${PREFIX}:sensor:${BEDROOM}`;
const MINUTE = 60 * 1000;
const LIMITS = { minIntervalMs: 0, perMinute: 1e6 };

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, path, now }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({ config = CONFIG, path = storePath(), now = NOW, api } = {}) {
  const clock = { now };
  const minut = api ?? fakeMinut({ now: () => clock.now });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: minut,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    limits: LIMITS,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api: minut, clock, path };
}

const offered = (gladys, id) => gladys.fake.discoveredDevices.find((d) => d.external_id === id);
const created = async (gladys, id) => {
  const device = offered(gladys, id);
  assert.ok(device, `${id} is offered`);
  await gladys.fake.deviceCreated(structuredClone(device));
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const later = async (app, clock, ms) => {
  clock.now += ms;
  await app.tick();
};

test('startup: a token, the organizations, homes and sensors; one device each', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const token = api.calls[0];
  assert.equal(token.path, '/oauth/token');
  assert.equal(
    token.authorization,
    `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
  );
  assert.equal(token.body, 'grant_type=client_credentials&response_type=token');
  assert.deepEqual(
    api.calls.slice(1).map((call) => call.path),
    [
      '/organizations',
      '/organizations/5ffff20fb167b70039f806f0/homes',
      '/organizations/5ffff20fb167b70039f806f0/devices',
    ],
  );
  assert.equal(api.calls[2].query.limit, '300');
  assert.equal(api.calls[3].query.limit, '60');
  assert.ok(api.calls.slice(1).every((call) => call.authorization === 'Bearer token-1'));
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [
      device.name,
      device.features.map((f) => f.external_id.split(':').pop()),
    ]),
    [
      ['Minut home Chalet', ['alarm', 'alarm_status', 'noise_monitoring', 'disturbance']],
      ['Minut Living room', ['temperature', 'humidity', 'sound', 'pressure', 'battery', 'tamper']],
      ['Minut Bedroom', ['temperature', 'humidity', 'sound', 'battery']],
    ],
  );
  assert.ok(!JSON.stringify(gladys.fake.discoveredDevices).includes(GONE), 'inactive sensor');
  assert.ok(!JSON.stringify(gladys.fake.discoveredDevices).includes(STUDIO), 'nothing to show');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'Connected to Minut. Homes: 2. Sensors: 2.',
  );
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Connecté à Minut. Maisons : 2. Capteurs : 2.',
  );
});

test('the states of a created device, sent again on creation; nothing before', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:temperature`), undefined);
  await created(gladys, LIVING_ID);
  await created(gladys, HOME_ID);
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:temperature`), 21.815673828125);
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:sound`), 44);
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:pressure`), 1013.4);
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:battery`), 74);
  assert.equal(gladys.fake.lastState(`${LIVING_ID}:tamper`), 0);
  assert.equal(gladys.fake.lastState(`${HOME_ID}:alarm`), 0);
  assert.equal(gladys.fake.lastState(`${HOME_ID}:alarm_status`), 'Off');
  assert.equal(gladys.fake.lastState(`${HOME_ID}:noise_monitoring`), 1);
  assert.equal(gladys.fake.lastState(`${HOME_ID}:disturbance`), 'Quiet');
});

test('sensors are read at their next heartbeat (+2 min, 5 to 60 min), homes every 5 minutes', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  // next_heartbeat_at 09:23:06 UTC + 2 minutes.
  assert.equal(app.due.devicesAt, Date.parse('2026-11-01T09:25:06Z'));
  assert.equal(app.due.homesAt, NOW + 5 * MINUTE);
  const devices = () => api.callsTo('GET', /\/devices$/).length;
  const homes = () => api.callsTo('GET', /\/homes$/).length;
  await later(app, clock, 4 * MINUTE);
  assert.deepEqual([homes(), devices()], [1, 1]);
  await later(app, clock, MINUTE);
  assert.deepEqual([homes(), devices()], [2, 1]);
  await later(app, clock, 51 * MINUTE);
  assert.deepEqual([homes(), devices()], [3, 2]);
  // A heartbeat long gone: 5 minutes at least; none at all: 30 minutes.
  for (const device of api.devices) {
    device.next_heartbeat_at = '2026-11-01T08:00:00.000Z';
  }
  await app.tick({ force: true, user: true });
  assert.equal(app.due.devicesAt, clock.now + 30 * MINUTE);
  api.devices[0].next_heartbeat_at = new Date(clock.now + MINUTE).toISOString();
  await app.tick({ force: true, user: true });
  assert.equal(app.due.devicesAt, clock.now + 5 * MINUTE);
  api.devices[0].next_heartbeat_at = new Date(clock.now + 5 * 60 * MINUTE).toISOString();
  await app.tick({ force: true, user: true });
  assert.equal(app.due.devicesAt, clock.now + 60 * MINUTE);
});

test('events: none before the first start, each once, with the sensor and the noise data', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.events[CHALET].push(
    homeEvent({ id: '100', type: 'noise_detected', at: NOW - 30 * MINUTE, device: LIVING }),
  );
  // The first round (startup) only sets the start: nothing read; then
  // nothing older than it is fired.
  assert.equal(api.callsTo('GET', /\/events$/).length, 0);
  await later(app, clock, MINUTE);
  assert.equal(api.callsTo('GET', /\/events$/).length, 2);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  api.events[CHALET].push(
    homeEvent({
      id: '101',
      type: 'noise_detected',
      at: clock.now + 10 * 1000,
      extra: {
        noise_count: 1,
        sound_level: 85,
        sound_threshold: 70,
        noise_event_device_id: LIVING,
        device_id: LIVING,
      },
    }),
    homeEvent({ id: '102', type: 'device_offline', at: clock.now + 20 * 1000, device: BEDROOM }),
    homeEvent({ id: '103', type: 'something_new', at: clock.now + 25 * 1000 }),
  );
  await later(app, clock, MINUTE);
  const calls = api.callsTo('GET', /\/homes\/5ffff22ab167b70039f806fe\/events$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].query.limit, '50');
  const [noise] = eventsOf(gladys, TRIGGERS.NOISE_DISTURBANCE);
  assert.deepEqual(noise.data, {
    home: HOME_ID,
    home_name: 'Chalet',
    event_type: 'noise_detected',
    event_time: new Date(NOW + MINUTE + 10 * 1000).toISOString(),
    time: '9:31 AM',
    title: 'Noise detected',
    device: LIVING_ID,
    device_name: 'Living room',
    state: 'started',
    sound_level: 85,
    sound_threshold: 70,
    noise_count: 1,
  });
  const [offline] = eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED);
  assert.equal(offline.data.state, 'offline');
  assert.equal(offline.data.device, BEDROOM_ID);
  assert.equal(gladys.fake.sceneEvents.length, 2, 'an unknown type fires nothing');
  // The noise brings the homes forward; the sensor event, the sensors (not
  // before 2 minutes after their last read).
  assert.equal(app.due.homesAt, clock.now);
  assert.equal(app.due.devicesAt, NOW + 2 * MINUTE + 30 * 1000);
  // Read again (overlap): never twice.
  await later(app, clock, MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a restart neither replays the past nor fires an event twice', async (t) => {
  const path = storePath();
  const first = await startApp({ path });
  await later(first.app, first.clock, MINUTE);
  first.api.events[CHALET].push(
    homeEvent({ id: '200', type: 'tamper_removed', at: first.clock.now + 1000, device: LIVING }),
  );
  await later(first.app, first.clock, MINUTE);
  assert.equal(eventsOf(first.gladys, TRIGGERS.TAMPER).length, 1);
  await first.gladys.fake.shutdown();

  const api = first.api;
  api.events[CHALET].push(
    homeEvent({
      id: '201',
      type: 'tamper_mounted',
      at: first.clock.now + 2 * MINUTE,
      device: LIVING,
    }),
  );
  const second = await startApp({ path, now: first.clock.now + 3 * MINUTE, api });
  t.after(() => second.gladys.fake.shutdown());
  await second.app.tick();
  const tamper = eventsOf(second.gladys, TRIGGERS.TAMPER);
  assert.deepEqual(
    tamper.map((event) => event.data.state),
    ['mounted'],
    'the one of the stop, not the one already fired',
  );
});

test('the alarm switch: a PATCH, the state, and no trigger for a command of Gladys', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const home = await created(gladys, HOME_ID);
  const alarm = home.features.find((f) => f.external_id.endsWith(':alarm'));
  const ack = await gladys.fake.setValue(home, alarm, 1);
  assert.equal(ack.success, true);
  const patch = api.callsTo('PATCH', /\/alarm$/);
  assert.equal(patch[0].path, `/homes/${CHALET}/alarm`);
  assert.deepEqual(JSON.parse(patch[0].body), { alarm_status: 'on' });
  assert.equal(gladys.fake.lastState(`${HOME_ID}:alarm`), 1);
  assert.equal(gladys.fake.lastState(`${HOME_ID}:alarm_status`), 'On');
  await later(app, clock, MINUTE);
  await app.tick({ force: true, user: true });
  assert.equal(eventsOf(gladys, TRIGGERS.ALARM_STATUS_CHANGED).length, 0);
  // Turned off in the Minut app: a trigger.
  api.homes[0].alarm.alarm_status = 'off';
  await later(app, clock, 5 * MINUTE);
  const [changed] = eventsOf(gladys, TRIGGERS.ALARM_STATUS_CHANGED);
  assert.equal(changed.data.state, 'off');
  assert.equal(changed.data.alarm_status, 'off');
  assert.equal(changed.data.device, undefined, 'a home event');
  assert.equal(gladys.fake.lastState(`${HOME_ID}:alarm`), 0);
});

test('the noise monitoring switch: a snooze of the configured length, then the end of it', async (t) => {
  const { gladys, api } = await startApp({ config: { ...CONFIG, snooze_minutes: 90 } });
  t.after(() => gladys.fake.shutdown());
  const home = await created(gladys, HOME_ID);
  const feature = home.features.find((f) => f.external_id.endsWith(':noise_monitoring'));
  await gladys.fake.setValue(home, feature, 0);
  await gladys.fake.setValue(home, feature, 1);
  assert.deepEqual(
    api.callsTo('PUT', /\/disturbance$/).map((call) => JSON.parse(call.body)),
    [{ action: 'snooze', duration: 5400 }, { action: 'end_snooze' }],
  );
  assert.equal(gladys.fake.lastState(`${HOME_ID}:noise_monitoring`), 1);
  assert.equal(gladys.fake.lastState(`${HOME_ID}:disturbance`), 'Quiet');
});

test('an expired token is renewed once, then the request is tried again', async (t) => {
  const { gladys, app, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.revokeTokens();
  await app.tick({ force: true, user: true });
  assert.equal(api.tokensIssued(), 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('refused credentials stop the reads until the configuration changes', async (t) => {
  const { gladys, app, api, clock } = await startApp({
    config: { ...CONFIG, client_secret: 'wrong' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the client id or secret/);
  const count = api.calls.length;
  await later(app, clock, 10 * MINUTE);
  assert.equal(api.calls.length, count);
  assert.doesNotMatch(JSON.stringify(gladys.fake.connectionStatus), /wrong|secret-value/);
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a 429 pauses every read, then they start again', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.rateLimited = 1;
  await app.tick({ force: true, user: true });
  assert.match(gladys.fake.connectionStatus.message.en, /slow down.*2 min/);
  const count = api.calls.length;
  await later(app, clock, MINUTE);
  assert.equal(api.calls.length, count, 'paused');
  await later(app, clock, 2 * MINUTE);
  assert.ok(api.calls.length > count);
  assert.match(gladys.fake.connectionStatus.message.en, /^Connected/);
});

test('no organization: the status says API access may be missing', async (t) => {
  const api = fakeMinut();
  api.organizations = { organizations: [], paging: { total_count: 0 } };
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /no organization/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en ?? ack.data.message, /no organization/);
});

test('scene actions: the declared outputs only, no trigger, readable errors', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  let ack = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_ALARM, {
    home: HOME_ID,
    state: 'on',
  });
  assert.deepEqual(ack.data.outputs, { home_name: 'Chalet', alarm_status: 'on', alarm_on: true });
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.SILENCE_ALARM, { home: HOME_ID });
  assert.deepEqual(ack.data.outputs, { home_name: 'Chalet', alarm_status: 'off', alarm_on: false });
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_NOISE_MONITORING, {
    home: LIVING_ID,
    state: 'pause',
    minutes: 15,
  });
  assert.deepEqual(ack.data.outputs, {
    home_name: 'Chalet',
    noise_state: 'snoozed',
    noise_monitoring: false,
  });
  assert.equal(JSON.parse(api.callsTo('PUT', /\/disturbance$/)[0].body).duration, 900);
  clock.now += 3 * MINUTE;
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.REFRESH_STATUS, {});
  assert.deepEqual(Object.keys(ack.data.outputs), OUTPUTS.refresh_status);
  assert.equal(ack.data.outputs.sensors_online, 1);
  assert.equal(ack.data.outputs.sensors_offline, 1);
  assert.equal(ack.data.outputs.temperature, 20.5);
  assert.equal(ack.data.outputs.sound_level, 44);
  assert.equal(ack.data.outputs.lowest_battery, 12);
  assert.equal(
    ack.data.outputs.summary,
    'Chalet: alarm off, noise paused. 20.5 °C, 44 % humidity. Sensors offline: 1.',
  );
  await app.tick();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'never a trigger from a scene action');
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_ALARM, {
    home: `${PREFIX}:home:${STUDIO}`,
    state: 'on',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /no security alarm/);
});

test('widgets: valid contents, buttons that act, a sound chart read in the background', async (t) => {
  const { gladys, app, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { settings: {}, language });
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key}.${language}`);
    }
  }
  let ack = await gladys.fake.widgetGet(WIDGETS.HOME, {
    settings: { home: HOME_ID },
    language: 'en',
  });
  const buttons = ack.data.content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((button) => button.action.key),
    [WIDGET_ACTIONS.ALARM_ON, WIDGET_ACTIONS.NOISE_PAUSE],
  );
  const toast = await gladys.fake.widgetAction(
    WIDGETS.HOME,
    WIDGET_ACTIONS.ALARM_ON,
    buttons[0].action.params,
    { settings: {} },
  );
  assert.equal(toast.data.message.fr ?? toast.data.message, 'Alarme de Chalet activée.');
  assert.equal(api.callsTo('PATCH', /\/alarm$/).length, 1);
  // The sound history: asked once, read once in the background.
  assert.equal(api.callsTo('GET', /sound_level_dba$/).length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  ack = await gladys.fake.widgetGet(WIDGETS.SOUND_HISTORY, {
    settings: { device: LIVING_ID },
    language: 'en',
  });
  const chart = ack.data.content.components.find((c) => c.type === 'chart');
  assert.equal(chart.series.length, 2);
  assert.equal(chart.series[0].points.length, 24);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  await app.tick();
});
