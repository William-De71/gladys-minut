// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and the fake Minut API of the tests. A made-up home ("Chalet", two
// sensors): its alarm on, a noise disturbance at level 1, a morning of events
// read through the events endpoint. Never real data.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { LANGUAGES } = await load('src/i18n.js');
const { fakeMinut, homeEvent, silent, NOW, CLIENT_ID, CLIENT_SECRET, CHALET, LIVING, BEDROOM } =
  await load('test/helpers/fake-api.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const MINUTE = 60 * 1000;

const clock = { now: NOW - 90 * MINUTE };
const api = fakeMinut({ now: () => clock.now });
const chalet = api.homes.find((home) => home.home_id === CHALET);
chalet.alarm.alarm_status = 'on';
const gladys = createFakeGladys({
  config: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, language: 'en' },
});
const app = createApp(gladys, {
  fetch: api,
  storePath: join(mkdtempSync(join(tmpdir(), 'minut-illustration-')), 'minut.json'),
  now: () => clock.now,
  timeZone: 'Europe/Paris',
  timers: false,
  limits: { minIntervalMs: 0, perMinute: 1e6 },
  logger: silent,
});
await gladys.connect();
await app.whenReady();

// A morning in the home, oldest first: each event read a minute after it.
const MORNING = [
  { minutes: -80, type: 'device_offline', device: BEDROOM },
  { minutes: -72, type: 'battery_low', device: BEDROOM },
  { minutes: -55, type: 'humidity_high', device: LIVING },
  { minutes: -41, type: 'tamper_removed', device: LIVING },
  { minutes: -40, type: 'tamper_mounted', device: LIVING },
  { minutes: -26, type: 'humidity_dropped_normal', device: LIVING },
  {
    minutes: -9,
    type: 'noise_detected',
    extra: { device_id: LIVING, sound_level: 78, sound_threshold: 70, noise_count: 1 },
  },
];
for (const [index, event] of MORNING.entries()) {
  const at = NOW + event.minutes * MINUTE;
  api.events[CHALET].push(homeEvent({ id: 9000 + index, at, ...event }));
  clock.now = at + MINUTE;
}
for (const event of MORNING) {
  clock.now = NOW + (event.minutes + 1) * MINUTE;
  await app.tick();
}
chalet.disturbance_monitoring.state = 'level_1';
clock.now = NOW;
await app.tick({ force: true, user: true });

const home = gladys.fake.discoveredDevices.find((device) => device.name === 'Minut home Chalet');
const living = gladys.fake.discoveredDevices.find((device) => device.name === 'Minut Living room');
const CARDS = {
  home: ['home', { home: home.external_id }],
  events: ['events', { home: home.external_id }],
  sound_history: ['sound_history', { device: living.external_id }],
};
// The sound history is read in the background on the first request.
await gladys.fake.widgetGet('sound_history', { settings: CARDS.sound_history[1], language: 'en' });
await new Promise((resolve) => setTimeout(resolve, 50));

const all = {};
for (const language of LANGUAGES) {
  all[language] = {};
  for (const [card, [key, settings]] of Object.entries(CARDS)) {
    const ack = await gladys.fake.widgetGet(key, { settings, language });
    all[language][card] = ack.data.content;
  }
}
await gladys.fake.shutdown();

writeFileSync(
  out,
  JSON.stringify({
    now: clock.now,
    contents: all,
    images: {},
    cards: Object.fromEntries(
      Object.entries(CARDS).map(([card, [key]]) => {
        const widget = manifest.widgets.find((item) => item.key === key);
        return [card, { icon: widget.icon, label: widget.label }];
      }),
    ),
  }),
);
