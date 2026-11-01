// Scene triggers: the event types of the API (the enumeration of the home
// events in the reference), deduplication, the payload limits of Gladys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EVENT_TYPES,
  TRIGGERS,
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
} from '../src/events.js';
import { homeEvent, CHALET, LIVING, NOW } from './helpers/fake-api.js';

// The `HomeEventType` enumeration of the Minut API v8 (OpenAPI reference).
const HOME_EVENT_TYPES = readFileSync(
  new URL('./fixtures/home-event-types.txt', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter(Boolean);
const context = {
  home: { deviceId: 'ext:minut:home:h', name: 'Chalet' },
  sensor: { deviceId: 'ext:minut:sensor:s', name: 'Living room' },
  language: 'fr',
  timeZone: 'Europe/Paris',
};

test('every event type the integration knows is a home event type of the API', () => {
  for (const type of Object.keys(EVENT_TYPES).filter((key) => !key.startsWith('alarm_turned_'))) {
    assert.ok(HOME_EVENT_TYPES.includes(type), type);
  }
  assert.deepEqual(
    [...new Set(Object.values(EVENT_TYPES).map((entry) => entry.trigger))].sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(TRIGGER_STATES.noise_disturbance, ['started', 'ended']);
});

test('an event of the API: its id, type, instant, sensor and noise data', () => {
  const record = parseEvent(
    homeEvent({
      id: '1234567890',
      type: 'noise_detected',
      at: NOW,
      extra: {
        noise_event_device_id: LIVING,
        sound_level: 85,
        sound_threshold: 70,
        noise_count: 2,
      },
    }),
    CHALET,
  );
  assert.deepEqual(record, {
    id: '1234567890',
    type: 'noise_detected',
    at: NOW,
    homeId: CHALET,
    deviceId: LIVING,
    title: 'Minut says noise_detected',
    soundLevel: 85,
    soundThreshold: 70,
    noiseCount: 2,
  });
  assert.equal(parseEvent({ event_type: 'x', event_time: 'never' }, CHALET), null);
  assert.equal(parseEvent(homeEvent({ id: '', type: 'tamper', at: NOW }), CHALET), null);
});

test('fresh events: unseen and recent enough, oldest first, the seen ids bounded', () => {
  const records = [3, 1, 2].map((n) =>
    parseEvent(homeEvent({ id: n, type: 'battery_low', at: NOW + n * 1000 }), CHALET),
  );
  const old = parseEvent(homeEvent({ id: 9, type: 'battery_low', at: NOW - 1000 }), CHALET);
  const first = freshEvents([...records, old], { since: NOW, seen: ['1'] });
  assert.deepEqual(
    first.fresh.map((record) => record.id),
    ['2', '3'],
  );
  assert.deepEqual(first.seen.sort(), ['1', '2', '3', '9']);
  assert.deepEqual(freshEvents(records, { since: NOW, seen: first.seen }).fresh, []);
  const many = Array.from({ length: SEEN_MAX + 10 }, (_, n) => String(n));
  assert.equal(freshEvents([], { seen: many }).seen.length, SEEN_MAX);
  const kept = keepRecent(
    [],
    Array.from({ length: 30 }, (_, n) => ({ id: String(n), at: n })),
  );
  assert.equal(kept.length, RECENT_MAX);
  assert.equal(kept[0].id, '29');
});

test('payloads: flat scalars, 30 keys at most, the sensor only for sensor triggers', () => {
  for (const [type, entry] of Object.entries(EVENT_TYPES)) {
    const record = parseEvent(
      homeEvent({ id: type, type, at: NOW, device: LIVING, extra: { sound_level: 80 } }),
      CHALET,
    );
    const { key, data } = sceneEventOf(record, context);
    assert.equal(key, entry.trigger);
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `${type}: ${value}`,
      );
      assert.ok(typeof value !== 'string' || value.length <= 1000);
    }
    assert.equal('device' in data, !HOME_TRIGGERS.includes(entry.trigger), type);
    assert.equal(data.state, entry.state, type);
    assert.equal(data.title, eventTitle(record, 'fr'));
  }
  const unknown = parseEvent(homeEvent({ id: 'u', type: 'flash_and_sound', at: NOW }), CHALET);
  assert.equal(sceneEventOf(unknown, context), null);
  assert.equal(eventTitle(unknown, 'en'), 'Minut says flash_and_sound');
  assert.equal(eventTitle({ ...unknown, title: '' }, 'de'), 'Minut-Ereignis');
});

test('pick keeps the declared outputs only', () => {
  assert.deepEqual(pick({ a: 1, b: 2 }, ['a', 'c']), { a: 1, c: null });
});
