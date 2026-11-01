// -----------------------------------------------------------------------------
// HTTP client of the Minut API v8 (https://api.minut.com/v8, reference:
// https://api.minut.com/latest/docs and https://developer.minut.com).
//
// Authentication: OAuth2 `client_credentials`. The user creates a client in
// the Minut web app (Settings -> Developer tools); the token comes from
//   POST /oauth/token   Basic base64(client_id:client_secret),
//                       grant_type=client_credentials&response_type=token
// and lives `expires_in` seconds (3600). It is renewed a minute before it
// expires, and once on a 401 (then the request is tried again, once).
//
// Endpoints used (all of them documented in the OpenAPI file of the API):
//   GET   /organizations                              the organizations of the user
//   GET   /organizations/{organization_id}/homes      homes (alarm, noise monitoring)
//   GET   /organizations/{organization_id}/devices    sensors (latest values, battery…)
//   GET   /homes/{home_id}/events                     events of a home (start_at, paging)
//   GET   /devices/{device_id}/sound_level_dba        sound level history
//   PATCH /homes/{home_id}/alarm                      `{ alarm_status: on | off }`
//   PUT   /homes/{home_id}/alarm/silence              silence an ongoing alarm
//   PUT   /homes/{home_id}/disturbance                `{ action: snooze, duration } | { action: end_snooze }`
// The public reference documents no GET /homes nor GET /devices at the root:
// homes and devices are read through the organizations.
//
// Rate limits of the API: 5 requests a second (bursts of 50), 120 a minute,
// a 429 beyond. Every request goes through one queue: at least 250 ms apart
// and at most 100 in any 60 seconds, leaving room under the documented 120.
// A 429 throws a `rate_limit` error: the app pauses (exponential back-off).
//
// Secrets: the client secret and the token never reach a log nor an error
// message.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://api.minut.com/v8';
const TIMEOUT_MS = 20000;
const ID_PATTERN = /^[0-9a-f]{24}$/;
const TOKEN_MARGIN_MS = 60 * 1000;
const LIMITS = { minIntervalMs: 250, perMinute: 100, windowMs: 60 * 1000 };
const PAGE = { homes: 300, devices: 60, events: 50 };
const MAX_PAGES = 20;

/**
 * @description An error of the Minut API, with a kind the messages can tell apart.
 */
class MinutError extends Error {
  /**
   * @param {string} kind - `no_credentials`, `auth`, `forbidden`, `not_found`,
   * `rate_limit`, `unreachable`, `invalid`, `failed`.
   * @param {string} message - The message (never a secret).
   * @param {object} [extra] - `{ status, retryAfterMs, errorKey }`.
   */
  constructor(kind, message, { status, retryAfterMs, errorKey } = {}) {
    super(message);
    this.name = 'MinutError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.errorKey = errorKey;
  }
}

/**
 * @description The kind of an HTTP status.
 * @param {number} status - The status.
 * @returns {string} The kind.
 */
function kindOf(status) {
  if (status === 401) {
    return 'auth';
  }
  if (status === 403) {
    return 'forbidden';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status >= 400 && status < 500) {
    return 'invalid';
  }
  return 'failed';
}

/**
 * @description The detail of an error answer: `{ message, error_key }` or `{ error }`.
 * @param {string} body - The body.
 * @returns {{ detail: string, errorKey: string|undefined }} The detail, '' when none.
 */
function detailOf(body) {
  try {
    const parsed = JSON.parse(body);
    return {
      detail: String(parsed?.message ?? parsed?.error_description ?? parsed?.error ?? ''),
      errorKey: typeof parsed?.error_key === 'string' ? parsed.error_key : undefined,
    };
  } catch {
    return { detail: '', errorKey: undefined };
  }
}

/**
 * @description The delay of a Retry-After header.
 * @param {string|null} value - Seconds, or an HTTP date.
 * @param {number} now - Now (ms).
 * @returns {number|undefined} Milliseconds.
 */
function retryAfterOf(value, now) {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/**
 * @description Check a Minut id before it goes into a path.
 * @param {unknown} id - The id.
 * @returns {string} The id.
 * @throws {MinutError} When it is not a 24-digit hexadecimal id.
 */
function checkId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new MinutError('invalid', 'Invalid Minut id');
  }
  return id;
}

/**
 * @description A queue that spaces the requests and caps them per minute.
 * @param {object} options - `{ now, sleep, minIntervalMs, perMinute, windowMs }`.
 * @returns {Function} `(task) => Promise`: runs the task when allowed.
 */
function createLimiter({ now, sleep, minIntervalMs, perMinute, windowMs }) {
  let tail = Promise.resolve();
  const sent = [];
  return (task) => {
    const run = tail.then(async () => {
      for (;;) {
        const at = now();
        while (sent.length && at - sent[0] >= windowMs) {
          sent.shift();
        }
        const last = sent.at(-1) ?? -Infinity;
        const wait = Math.max(
          last + minIntervalMs - at,
          sent.length >= perMinute ? sent[0] + windowMs - at : 0,
        );
        if (wait <= 0) {
          break;
        }
        await sleep(wait);
      }
      sent.push(now());
    });
    tail = run.catch(() => {});
    return run.then(task);
  };
}

/**
 * @description The Minut client.
 * @param {object} options - Options.
 * @param {Function} options.getCredentials - `() => { clientId, clientSecret }`.
 * @param {Function} [options.onRequest] - `(method, path) => void`, before each request.
 * @param {Function} [options.fetch] - The fetch implementation (tests).
 * @param {string} [options.baseUrl] - The API root.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise`.
 * @param {object} [options.limits] - `{ minIntervalMs, perMinute, windowMs }`.
 * @returns {object} The client.
 */
function createMinutClient({
  getCredentials,
  onRequest = () => {},
  fetch: fetchFn = globalThis.fetch,
  baseUrl = BASE_URL,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  limits = {},
}) {
  const root = baseUrl.replace(/\/$/, '');
  const schedule = createLimiter({ now, sleep, ...LIMITS, ...limits });
  let token = null;
  let tokenOf = '';
  let pendingToken = null;

  /**
   * @description One HTTP exchange, through the queue.
   * @param {string} method - The method.
   * @param {string} path - The path, from the API root.
   * @param {object} init - `{ headers, body }`.
   * @returns {Promise<{ status: number, text: string, headers: Headers }>}
   */
  function exchange(method, path, { headers = {}, body } = {}) {
    return schedule(async () => {
      onRequest(method, path.replace(/\?.*$/, ''));
      let response;
      try {
        response = await fetchFn(`${root}${path}`, {
          method,
          headers: { accept: 'application/json', ...headers },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // The cause only: the request carries a secret.
        throw new MinutError(
          'unreachable',
          String(err?.cause?.code ?? err?.name ?? 'fetch failed'),
        );
      }
      return { status: response.status, text: await response.text(), headers: response.headers };
    });
  }

  /**
   * @description The error of a failed answer.
   * @param {object} answer - `{ status, text, headers }`.
   * @returns {MinutError} The error.
   */
  function errorOf({ status, text, headers }) {
    const { detail, errorKey } = detailOf(text);
    return new MinutError(
      kindOf(status),
      `HTTP ${status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
      { status, errorKey, retryAfterMs: retryAfterOf(headers?.get?.('retry-after'), now()) },
    );
  }

  /**
   * @description Ask a new access token.
   * @returns {Promise<string>} The token.
   */
  async function requestToken() {
    const { clientId, clientSecret } = getCredentials();
    if (!clientId || !clientSecret) {
      throw new MinutError('no_credentials', 'No client id or secret');
    }
    const answer = await exchange('POST', '/oauth/token', {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        response_type: 'token',
      }).toString(),
    });
    if (answer.status < 200 || answer.status >= 300) {
      const error = errorOf(answer);
      // A refused client is a 400 or a 401 here: both mean wrong credentials.
      if (answer.status === 400 || answer.status === 401) {
        throw new MinutError('auth', error.message, { status: answer.status });
      }
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(answer.text);
    } catch {
      throw new MinutError('failed', 'Unreadable token answer', { status: answer.status });
    }
    if (typeof parsed?.access_token !== 'string' || !parsed.access_token) {
      throw new MinutError('failed', 'No access token in the answer', { status: answer.status });
    }
    const lifetime = Number(parsed.expires_in);
    token = {
      value: parsed.access_token,
      expiresAt: now() + (Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600) * 1000,
    };
    tokenOf = `${clientId}\n${clientSecret}`;
    return token.value;
  }

  /**
   * @description A valid access token: the current one, or a new one.
   * @param {boolean} [renew] - Ask a new one whatever.
   * @returns {Promise<string>} The token.
   */
  async function accessToken(renew = false) {
    const { clientId, clientSecret } = getCredentials();
    const fresh =
      token &&
      tokenOf === `${clientId}\n${clientSecret}` &&
      now() < token.expiresAt - TOKEN_MARGIN_MS;
    if (fresh && !renew) {
      return token.value;
    }
    pendingToken ??= requestToken().finally(() => {
      pendingToken = null;
    });
    return pendingToken;
  }

  /**
   * @description A JSON request with the access token, renewed once on a 401.
   * @param {string} method - The method.
   * @param {string} path - The path.
   * @param {object} [options] - `{ query, body }`.
   * @returns {Promise<object>} The parsed answer (`{}` when empty).
   */
  async function request(method, path, { query, body } = {}) {
    const search = query
      ? new URLSearchParams(
          Object.entries(query).filter(([, value]) => value !== undefined && value !== null),
        ).toString()
      : '';
    const target = `${path}${search ? `?${search}` : ''}`;
    let answer;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bearer = await accessToken(attempt > 0);
      answer = await exchange(method, target, {
        headers: {
          authorization: `Bearer ${bearer}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (answer.status !== 401) {
        break;
      }
      token = null;
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw errorOf(answer);
    }
    if (!answer.text) {
      return {};
    }
    try {
      return JSON.parse(answer.text);
    } catch {
      throw new MinutError('failed', 'Unreadable answer', { status: answer.status });
    }
  }

  /**
   * @description Every item of a paged list (limit / offset).
   * @param {string} path - The path.
   * @param {string} field - The array field of the answer.
   * @param {number} limit - The page size.
   * @returns {Promise<object[]>} The items.
   */
  async function pages(path, field, limit) {
    const items = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await request('GET', path, { query: { limit, offset: page * limit } });
      const list = Array.isArray(answer?.[field]) ? answer[field] : [];
      items.push(...list);
      const total = Number(answer?.paging?.total_count);
      if (list.length < limit || (Number.isFinite(total) && items.length >= total)) {
        break;
      }
    }
    return items;
  }

  return {
    request,
    /** @description Forget the token (new credentials). */
    reset() {
      token = null;
      tokenOf = '';
    },
    /**
     * @description Check the credentials: ask a new token.
     * @returns {Promise<void>}
     */
    async checkCredentials() {
      await accessToken(true);
    },
    /**
     * @description The organizations of the user.
     * @returns {Promise<Array<{ id: string, name: string }>>} The organizations.
     */
    async organizations() {
      const answer = await request('GET', '/organizations');
      return (Array.isArray(answer?.organizations) ? answer.organizations : []).filter(
        (organization) => ID_PATTERN.test(String(organization?.id ?? '')),
      );
    },
    /**
     * @description The homes of an organization.
     * @param {string} organizationId - The organization.
     * @returns {Promise<object[]>} The homes.
     */
    homes: (organizationId) =>
      pages(`/organizations/${checkId(organizationId)}/homes`, 'homes', PAGE.homes),
    /**
     * @description The devices of an organization.
     * @param {string} organizationId - The organization.
     * @returns {Promise<object[]>} The devices.
     */
    devices: (organizationId) =>
      pages(`/organizations/${checkId(organizationId)}/devices`, 'devices', PAGE.devices),
    /**
     * @description A page of the events of a home since an instant.
     * @param {string} homeId - The home.
     * @param {object} options - `{ startAt, offset }`: an ISO instant.
     * @returns {Promise<{ events: object[], total: number|null, limit: number }>} The page.
     */
    async homeEvents(homeId, { startAt, offset = 0 }) {
      const answer = await request('GET', `/homes/${checkId(homeId)}/events`, {
        query: { start_at: startAt, limit: PAGE.events, offset },
      });
      const total = Number(answer?.paging?.total_count);
      return {
        events: Array.isArray(answer?.home_events) ? answer.home_events : [],
        total: Number.isFinite(total) ? total : null,
        limit: PAGE.events,
      };
    },
    /**
     * @description Hourly sound levels (dBA) of a device over a period.
     * @param {string} deviceId - The device.
     * @param {object} options - `{ startAt, endAt }`: ISO instants.
     * @returns {Promise<object[]>} `{ datetime, value, min?, max? }` per hour.
     */
    async soundLevels(deviceId, { startAt, endAt }) {
      const answer = await request('GET', `/devices/${checkId(deviceId)}/sound_level_dba`, {
        query: {
          start_at: startAt,
          end_at: endAt,
          time_resolution: 3600,
          include_min_max: true,
        },
      });
      return Array.isArray(answer?.values) ? answer.values : [];
    },
    /**
     * @description Turn the security alarm of a home on or off.
     * @param {string} homeId - The home.
     * @param {string} status - `on` or `off`.
     * @returns {Promise<object>} The alarm.
     */
    setAlarm: (homeId, status) =>
      request('PATCH', `/homes/${checkId(homeId)}/alarm`, { body: { alarm_status: status } }),
    /**
     * @description Silence the ongoing alarm of a home.
     * @param {string} homeId - The home.
     * @returns {Promise<object>} The alarm.
     */
    silenceAlarm: (homeId) => request('PUT', `/homes/${checkId(homeId)}/alarm/silence`),
    /**
     * @description Pause (snooze) or resume the noise monitoring of a home.
     * @param {string} homeId - The home.
     * @param {string} action - `snooze` or `end_snooze`.
     * @param {number} [durationSeconds] - The pause, for `snooze`.
     * @returns {Promise<object>} The disturbance monitoring.
     */
    disturbance: (homeId, action, durationSeconds) =>
      request('PUT', `/homes/${checkId(homeId)}/disturbance`, {
        body: action === 'snooze' ? { action, duration: durationSeconds } : { action },
      }),
  };
}

export {
  BASE_URL,
  ID_PATTERN,
  LIMITS,
  PAGE,
  MinutError,
  kindOf,
  detailOf,
  retryAfterOf,
  checkId,
  createLimiter,
  createMinutClient,
};
