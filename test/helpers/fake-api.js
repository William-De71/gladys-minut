// A fake Minut API for the tests, served through the `fetch` option of the
// integration. Its answers follow the OpenAPI reference of the Minut API v8
// and the examples of its guides (https://developer.minut.com):
//   - token.json: POST /oauth/token (client_credentials);
//   - organizations.json, homes.json, devices.json: the organization lists,
//     with the `latest_sensor_values` example of the "Sensor Data" guide;
//   - events: built after the example of the "Fetching Events" guide.
// Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-11-01 09:30 in Paris (CET).
const NOW = Date.parse('2026-11-01T08:30:00Z');
const TZ = 'Europe/Paris';
const CLIENT_ID = 'gladys-test-client';
const CLIENT_SECRET = 'top-secret-value';
const ORG = '5ffff20fb167b70039f806f0';
const CHALET = '5ffff22ab167b70039f806fe';
const STUDIO = '5ffff22ab167b70039f80701';
const LIVING = '647846155f4adc639addaa1b';
const BEDROOM = '647846155f4adc639addaa2c';
const GONE = '647846155f4adc639addaa3d';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const silent = { info() {}, warn() {}, error() {}, debug() {} };
const iso = (at) => new Date(at).toISOString();

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path.
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'minut-')), 'minut.json');

/**
 * @description A home event, after the example of the "Fetching Events" guide.
 * @param {object} options - `{ id, type, at, home, device, extra }`.
 * @returns {object} The event.
 */
function homeEvent({ id, type, at, home = CHALET, device, extra = {} }) {
  return {
    event_id: String(id),
    event_type: type,
    event_type_version: 2,
    home_id: home,
    organization_id: ORG,
    event_time: iso(at),
    user_representation: { title: `Minut says ${type}` },
    metadata: {
      timezone: 'Europe/Paris',
      home_name: 'Chalet',
      ...(device || Object.keys(extra).length
        ? { event_specific_data: { ...(device ? { device_id: device } : {}), ...extra } }
        : {}),
    },
  };
}

/**
 * @description The fake API: the routes of the integration.
 * @param {object} [options] - `{ now }`: `() => number`, for the instants it writes.
 * @returns {Function & object} A `fetch`, with its state and switches.
 */
function fakeMinut({ now = () => NOW } = {}) {
  const homes = clone(fixture('homes.json').homes);
  const devices = clone(fixture('devices.json').devices);
  const events = { [CHALET]: [], [STUDIO]: [] };
  const calls = [];
  let issued = 0;
  const valid = new Set();
  const json = (body, status = 200, headers = {}) =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  const page = (list, field, query) => {
    const limit = Number(query.get('limit') ?? 10);
    const offset = Number(query.get('offset') ?? 0);
    return json({
      [field]: list.slice(offset, offset + limit),
      paging: { offset, limit, total_count: list.length },
    });
  };
  const alarmOf = (home) => ({ ...home.alarm });

  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    const path = target.pathname.replace(/^\/v8/, '');
    const body = init.body ?? null;
    const headers = init.headers ?? {};
    calls.push({
      method: init.method ?? 'GET',
      path,
      query: Object.fromEntries(target.searchParams),
      body,
      authorization: headers.authorization ?? null,
    });
    if (fetch.offline) {
      throw Object.assign(new TypeError(`fetch failed for ${url}`), {
        cause: { code: 'ENOTFOUND' },
      });
    }
    if (fetch.rateLimited > 0) {
      fetch.rateLimited -= 1;
      return json({ message: 'Too many requests' }, 429, { 'retry-after': '120' });
    }
    if (fetch.status) {
      return json({ message: 'refused' }, fetch.status);
    }
    if (path === '/oauth/token') {
      const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
      const form = new URLSearchParams(body ?? '');
      if (
        init.method !== 'POST' ||
        headers['content-type'] !== 'application/x-www-form-urlencoded' ||
        form.get('grant_type') !== 'client_credentials'
      ) {
        return json({ message: 'Bad request' }, 400);
      }
      if (headers.authorization !== expected) {
        return json({ error: 'invalid_client' }, 401);
      }
      issued += 1;
      const token = `token-${issued}`;
      valid.add(token);
      return json({ ...fixture('token.json'), access_token: token });
    }
    const bearer = String(headers.authorization ?? '').replace(/^Bearer /, '');
    if (!valid.has(bearer)) {
      return json({ message: 'Unauthorized' }, 401);
    }
    const method = init.method ?? 'GET';
    const parsed = body ? JSON.parse(body) : {};
    let match;
    if (method === 'GET' && path === '/organizations') {
      return json(fetch.organizations);
    }
    if (method === 'GET' && (match = /^\/organizations\/([0-9a-f]{24})\/homes$/.exec(path))) {
      return page(
        homes.filter((home) => home.organization_id === match[1]),
        'homes',
        target.searchParams,
      );
    }
    if (method === 'GET' && (match = /^\/organizations\/([0-9a-f]{24})\/devices$/.exec(path))) {
      return page(match[1] === ORG ? devices : [], 'devices', target.searchParams);
    }
    if (method === 'GET' && (match = /^\/homes\/([0-9a-f]{24})\/events$/.exec(path))) {
      const start = Date.parse(target.searchParams.get('start_at') ?? '1970-01-01T00:00:00Z');
      const list = (events[match[1]] ?? []).filter(
        (event) => Date.parse(event.event_time) >= start,
      );
      return json({
        home_events: list.slice(
          Number(target.searchParams.get('offset') ?? 0),
          Number(target.searchParams.get('offset') ?? 0) +
            Number(target.searchParams.get('limit') ?? 10),
        ),
        paging: {
          offset: Number(target.searchParams.get('offset') ?? 0),
          limit: Number(target.searchParams.get('limit') ?? 10),
          total_count: list.length,
        },
      });
    }
    if (method === 'GET' && (match = /^\/devices\/([0-9a-f]{24})\/sound_level_dba$/.exec(path))) {
      const end = Date.parse(target.searchParams.get('end_at'));
      const hours = Array.from({ length: 24 }, (_, index) => end - (24 - index) * 3600000);
      // Quiet nights, busier days, one loud evening hour (a party).
      const level = (at) => {
        const hour = (new Date(at).getUTCHours() + 1) % 24;
        const day = hour >= 8 && hour < 23;
        return { value: (day ? 41 : 29) + (hour % 3) * 1.5 + (hour === 22 ? 21 : 0), day, hour };
      };
      return json({
        unit: '',
        time_resolution: 3600,
        values: hours.map((at) => {
          const { value, day, hour } = level(at);
          return {
            datetime: iso(Math.floor(at / 3600000) * 3600000),
            value,
            min: day ? 33 : 24,
            max: value + (day ? 12 : 4) + (hour === 22 ? 16 : 0),
          };
        }),
      });
    }
    const homeId = /^\/homes\/([0-9a-f]{24})\//.exec(path)?.[1];
    const home = homeId ? homes.find((item) => item.home_id === homeId) : null;
    if (/^\/homes\/[0-9a-f]{24}\/alarm$/.test(path) && method === 'PATCH') {
      if (!home) {
        return json({ message: 'not found' }, 404);
      }
      if (!home.alarm) {
        return json(
          {
            error: 'forbidden',
            message: 'motion disabled',
            error_key: 'motion_disabled_for_organization',
          },
          403,
        );
      }
      home.alarm.alarm_status = parsed.alarm_status;
      return json(alarmOf(home));
    }
    if (/^\/homes\/[0-9a-f]{24}\/alarm\/silence$/.test(path) && method === 'PUT') {
      home.alarm.alarm_status = 'off';
      return json(alarmOf(home));
    }
    if (/^\/homes\/[0-9a-f]{24}\/disturbance$/.test(path) && method === 'PUT') {
      if (!home?.disturbance_monitoring?.disturbance_monitoring_active) {
        return json({ message: 'not enabled', error_key: 'noise_monitoring_not_enabled' }, 400);
      }
      if (parsed.action === 'snooze' && !Number.isFinite(parsed.duration)) {
        return json({ message: 'snooze_and_duration' }, 400);
      }
      home.disturbance_monitoring.state = parsed.action === 'snooze' ? 'snoozed' : 'idle';
      home.disturbance_monitoring.current_state_update_at = iso(now());
      return json(home.disturbance_monitoring);
    }
    return json({ message: 'Not found' }, 404);
  };
  fetch.calls = calls;
  fetch.homes = homes;
  fetch.devices = devices;
  fetch.events = events;
  fetch.organizations = clone(fixture('organizations.json'));
  fetch.offline = false;
  fetch.status = null;
  fetch.rateLimited = 0;
  /** @description Revoke every token issued so far (an expired token). */
  fetch.revokeTokens = () => valid.clear();
  fetch.tokensIssued = () => issued;
  /**
   * @description The calls of a method and a path pattern.
   * @param {string} method - The method.
   * @param {RegExp} pattern - The path pattern.
   * @returns {object[]} The calls.
   */
  fetch.callsTo = (method, pattern) =>
    calls.filter((call) => call.method === method && pattern.test(call.path));
  return fetch;
}

export {
  NOW,
  TZ,
  CLIENT_ID,
  CLIENT_SECRET,
  ORG,
  CHALET,
  STUDIO,
  LIVING,
  BEDROOM,
  GONE,
  silent,
  storePath,
  fixture,
  clone,
  iso,
  homeEvent,
  fakeMinut,
};
