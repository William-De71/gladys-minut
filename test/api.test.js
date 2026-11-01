// The HTTP client of the Minut API: the token, its renewal, the queue under
// the rate limits, the errors (never a secret in them).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMinutClient,
  createLimiter,
  MinutError,
  kindOf,
  retryAfterOf,
  checkId,
  BASE_URL,
} from '../src/minut-api.js';
import {
  fakeMinut,
  CLIENT_ID,
  CLIENT_SECRET,
  CHALET,
  ORG,
  LIVING,
  NOW,
} from './helpers/fake-api.js';

const credentials = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
const client = (api, options = {}) =>
  createMinutClient({
    getCredentials: () => credentials,
    fetch: api,
    limits: { minIntervalMs: 0, perMinute: 1e6 },
    ...options,
  });

test('the documented base URL, version 8', () => {
  assert.equal(BASE_URL, 'https://api.minut.com/v8');
});

test('one token for many requests, renewed a minute before it expires', async () => {
  const api = fakeMinut();
  const clock = { now: NOW };
  const minut = client(api, { now: () => clock.now });
  await minut.organizations();
  await minut.homes(ORG);
  assert.equal(api.tokensIssued(), 1);
  clock.now += 3600 * 1000 - 61 * 1000;
  await minut.devices(ORG);
  assert.equal(api.tokensIssued(), 1);
  clock.now += 2000;
  await minut.devices(ORG);
  assert.equal(api.tokensIssued(), 2);
});

test('a 401 renews the token once and tries again; a second 401 is an auth error', async () => {
  const api = fakeMinut();
  const minut = client(api);
  await minut.organizations();
  api.revokeTokens();
  assert.equal((await minut.organizations()).length, 1);
  assert.equal(api.tokensIssued(), 2);
  const broken = fakeMinut();
  const always = async (url, init) => {
    const answer = await broken(url, init);
    return String(url).endsWith('/oauth/token')
      ? answer
      : new Response('{"message":"Unauthorized"}', { status: 401 });
  };
  await assert.rejects(client(always).organizations(), { kind: 'auth' });
});

test('wrong credentials: an auth error, never the secret in it', async () => {
  const api = fakeMinut();
  const minut = createMinutClient({
    getCredentials: () => ({ clientId: CLIENT_ID, clientSecret: 'nope-secret' }),
    fetch: api,
    limits: { minIntervalMs: 0 },
  });
  const error = await minut.organizations().catch((err) => err);
  assert.equal(error.kind, 'auth');
  assert.doesNotMatch(String(error.message), /nope-secret|Basic/);
  await assert.rejects(
    createMinutClient({ getCredentials: () => ({}), fetch: api }).organizations(),
    { kind: 'no_credentials' },
  );
});

test('errors: kinds, the error key of the API, Retry-After, the network cause only', async () => {
  assert.deepEqual([401, 403, 404, 429, 400, 500].map(kindOf), [
    'auth',
    'forbidden',
    'not_found',
    'rate_limit',
    'invalid',
    'failed',
  ]);
  assert.equal(retryAfterOf('120', NOW), 120000);
  assert.equal(retryAfterOf(new Date(NOW + 5000).toUTCString(), NOW), 5000);
  assert.equal(retryAfterOf(null, NOW), undefined);
  const api = fakeMinut();
  const minut = client(api);
  api.rateLimited = 1;
  const limited = await minut.organizations().catch((err) => err);
  assert.equal(limited.kind, 'rate_limit');
  assert.equal(limited.retryAfterMs, 120000);
  const noise = await minut.disturbance('5ffff22ab167b70039f80701', 'end_snooze').catch((e) => e);
  assert.equal(noise.errorKey, 'noise_monitoring_not_enabled');
  api.offline = true;
  const offline = await minut.organizations().catch((err) => err);
  assert.ok(offline instanceof MinutError);
  assert.equal(offline.kind, 'unreachable');
  assert.equal(offline.message, 'ENOTFOUND');
});

test('paths: ids checked before they reach a URL; the documented bodies', async () => {
  assert.throws(() => checkId('../../users'), { kind: 'invalid' });
  assert.equal(checkId(CHALET), CHALET);
  const api = fakeMinut();
  const minut = client(api);
  await minut.setAlarm(CHALET, 'on');
  await minut.silenceAlarm(CHALET);
  await minut.disturbance(CHALET, 'snooze', 600);
  await minut.homeEvents(CHALET, { startAt: '2026-11-01T08:00:00Z' });
  await minut.soundLevels(LIVING, {
    startAt: '2026-10-31T08:30:00Z',
    endAt: '2026-11-01T08:30:00Z',
  });
  const calls = api.calls.filter((call) => call.path !== '/oauth/token');
  assert.deepEqual(
    calls.map((call) => [call.method, call.path, call.body]),
    [
      ['PATCH', `/homes/${CHALET}/alarm`, '{"alarm_status":"on"}'],
      ['PUT', `/homes/${CHALET}/alarm/silence`, null],
      ['PUT', `/homes/${CHALET}/disturbance`, '{"action":"snooze","duration":600}'],
      ['GET', `/homes/${CHALET}/events`, null],
      ['GET', `/devices/${LIVING}/sound_level_dba`, null],
    ],
  );
  assert.deepEqual(calls[3].query, { start_at: '2026-11-01T08:00:00Z', limit: '50', offset: '0' });
  assert.deepEqual(calls[4].query, {
    start_at: '2026-10-31T08:30:00Z',
    end_at: '2026-11-01T08:30:00Z',
    time_resolution: '3600',
    include_min_max: 'true',
  });
});

test('pages: limit and offset until a short page', async () => {
  const api = fakeMinut();
  for (let index = 0; index < 70; index += 1) {
    api.devices.push({
      ...api.devices[0],
      device_id: `aaaaaaaaaaaaaaaaaaaa${String(index).padStart(4, '0')}`,
    });
  }
  const devices = await client(api).devices(ORG);
  assert.equal(devices.length, 73);
  assert.deepEqual(
    api.calls.filter((call) => call.path.endsWith('/devices')).map((call) => call.query.offset),
    ['0', '60'],
  );
});

test('the queue: 250 ms apart and 100 a minute at most', async () => {
  const clock = { now: 0 };
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
    clock.now += ms;
  };
  const schedule = createLimiter({
    now: () => clock.now,
    sleep,
    minIntervalMs: 250,
    perMinute: 100,
    windowMs: 60000,
  });
  const starts = [];
  await Promise.all(
    Array.from({ length: 102 }, () => schedule(async () => starts.push(clock.now))),
  );
  assert.equal(starts[1] - starts[0], 250);
  assert.equal(starts[99], 99 * 250);
  // The 101st waits for the first to leave the minute window.
  assert.equal(starts[100], 60000);
  assert.ok(starts.every((at, index) => index === 0 || at - starts[index - 1] >= 250));
});
