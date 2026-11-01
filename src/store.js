// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/minut.json (the only
// writable place of the container):
//   - `snapshot`   the last organizations, homes and sensors read, so the
//                  widgets and the states come back before the first read;
//   - `features`   by Minut id, the features a sensor or a home ever gave
//                  (they only grow: a feature never flaps);
//   - `events`     by home: `since` (the instant events started to count:
//                  older ones are never fired), `cursor` (the last poll),
//                  `seen` (the last event ids, never fired twice), `recent`
//                  (the last events, for the widget);
//   - `alarm`      by home, the alarm on or off at the last read (the
//                  `alarm_status_changed` trigger compares to it);
//   - `history`    by sensor, the hourly sound levels of the last 24 hours
//                  and when they were read; `wanted` when a widget last asked.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/minut.json';
const PARTS = ['features', 'events', 'alarm', 'history'];
const EMPTY = () => ({
  snapshot: { at: null, organizations: [], homes: [], devices: [] },
  ...Object.fromEntries(PARTS.map((key) => [key, {}])),
});

const part = (node) => (node && typeof node === 'object' && !Array.isArray(node) ? node : {});
const list = (node) => (Array.isArray(node) ? node : []);

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const value = part(JSON.parse(await readFile(path, 'utf8')));
        const snapshot = part(value.snapshot);
        store.data = {
          snapshot: {
            at: Number.isFinite(snapshot.at) ? snapshot.at : null,
            organizations: list(snapshot.organizations),
            homes: list(snapshot.homes),
            devices: list(snapshot.devices),
          },
          ...Object.fromEntries(PARTS.map((key) => [key, { ...part(value[key]) }])),
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
