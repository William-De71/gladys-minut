// Widget contents: valid for the core (validateWidgetContent), within the
// budget of a card, in every language and every state they can show.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildHomeWidget,
  buildEventsWidget,
  buildSoundHistoryWidget,
  messageContent,
  WIDGET_ACTIONS,
} from '../src/widgets.js';
import {
  parseDevice,
  parseHome,
  parseSoundLevels,
  ALARM_STATUSES,
  NOISE_STATES,
} from '../src/model.js';
import { parseEvent, EVENT_TYPES } from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { fixture, homeEvent, ORG, CHALET, LIVING, NOW, TZ } from './helpers/fake-api.js';

const sensors = fixture('devices.json')
  .devices.map(parseDevice)
  .filter((sensor) => sensor.active);
const [chalet, studio] = fixture('homes.json').homes.map((raw) => parseHome(raw, ORG));
const valid = (content, label) => {
  assert.deepEqual(validateWidgetContent(content), [], label);
  assert.ok(content.components.length <= 8, label);
  assert.ok(content.components.filter((c) => c.type === 'button').length <= 4, label);
  assert.ok(content.components.filter((c) => ['value', 'gauge'].includes(c.type)).length <= 6);
};

test('home: every alarm and noise state, in every language, within the budget', () => {
  for (const language of LANGUAGES) {
    for (const alarmStatus of [...ALARM_STATUSES, null]) {
      for (const noiseState of NOISE_STATES) {
        const home = {
          ...chalet,
          alarmStatus,
          noiseState,
          name: 'A very long name for a home'.repeat(3),
        };
        valid(
          buildHomeWidget({ home, sensors, at: NOW, language, timeZone: TZ }),
          `${alarmStatus}/${noiseState}`,
        );
      }
    }
    valid(buildHomeWidget({ home: studio, sensors: [], at: null, language }), 'empty home');
  }
});

test('home: the right buttons for the state', () => {
  const keys = (home) =>
    buildHomeWidget({ home, sensors, at: NOW, language: 'en', timeZone: TZ })
      .components.filter((c) => c.type === 'button')
      .map((c) => c.action.key);
  assert.deepEqual(keys(chalet), [WIDGET_ACTIONS.ALARM_ON, WIDGET_ACTIONS.NOISE_PAUSE]);
  assert.deepEqual(keys({ ...chalet, alarmStatus: 'critical_event', noiseState: 'snoozed' }), [
    WIDGET_ACTIONS.ALARM_OFF,
    WIDGET_ACTIONS.SILENCE,
    WIDGET_ACTIONS.NOISE_RESUME,
  ]);
  assert.deepEqual(keys({ ...chalet, noiseActive: false }), [WIDGET_ACTIONS.ALARM_ON]);
  assert.deepEqual(keys(studio), []);
  const content = buildHomeWidget({ home: chalet, sensors, at: NOW, language: 'fr', timeZone: TZ });
  assert.equal(content.components[0].text, 'Chalet · à 09:30 · Minut');
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.color]),
    [
      ['Alarme', 'Désactivée', 'neutral'],
      ['Bruit', 'Calme', 'success'],
      ['Capteurs', '1 en ligne, 1 hors ligne', 'danger'],
      ['Pile la plus faible', '12 %', 'warning'],
    ],
  );
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.value, tile.unit]),
    [
      ['20,5', '°C'],
      ['44', '%'],
      ['44', 'dBA'],
    ],
  );
});

test('events: every known type and an unknown one, newest first, 8 cards', () => {
  const records = Object.keys(EVENT_TYPES).map((type, index) =>
    parseEvent(homeEvent({ id: index, type, at: NOW - index * 60000, device: LIVING }), CHALET),
  );
  records.push(parseEvent(homeEvent({ id: 'x', type: 'flash_and_sound', at: NOW }), CHALET));
  for (const language of LANGUAGES) {
    for (let start = 0; start < records.length; start += 8) {
      const content = buildEventsWidget({
        home: chalet,
        events: records.slice(start, start + 8),
        sensorName: () => 'Living room',
        at: NOW,
        language,
        timeZone: TZ,
      });
      valid(content, `${language} ${start}`);
    }
    valid(buildEventsWidget({ home: chalet, events: [], at: null, language }), 'none');
  }
  const content = buildEventsWidget({
    home: chalet,
    events: records,
    sensorName: () => 'Living room',
    at: NOW,
    language: 'en',
    timeZone: TZ,
  });
  const list = content.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 8);
  assert.equal(list.items[0].title, 'Noise detected · Living room');
  assert.deepEqual(list.items[0].badge, { text: 'Noise', color: 'warning' });
});

test('sound history: chart, rows; without points a message', () => {
  const values = Array.from({ length: 24 }, (_, index) => ({
    datetime: new Date(NOW - (24 - index) * 3600000).toISOString(),
    value: 35 + index,
    min: 30,
    max: 50 + index,
  }));
  const history = { at: NOW, points: parseSoundLevels(values) };
  for (const language of LANGUAGES) {
    const content = buildSoundHistoryWidget({
      sensor: sensors[0],
      history,
      language,
      timeZone: TZ,
    });
    valid(content, language);
    valid(buildSoundHistoryWidget({ sensor: sensors[0], history: null, language }), 'empty');
  }
  const rows = buildSoundHistoryWidget({
    sensor: sensors[0],
    history,
    language: 'en',
    timeZone: TZ,
  }).components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.value),
    ['58 dBA', '47 dBA', '73 dBA · 8:30 AM'],
  );
  assert.deepEqual(
    parseSoundLevels([[1761984000, 40], { time: 1761987600, value: 41 }, { value: 2 }]),
    [
      { at: 1761984000000, value: 40, max: null },
      { at: 1761987600000, value: 41, max: null },
    ],
  );
  valid(messageContent('x'.repeat(400)), 'message');
});
