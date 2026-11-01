# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Minut home sensors (noise,
temperature, humidity, security alarm): a Node.js service (Node 22+, ESM, no
build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official Minut API v8
(`https://api.minut.com/v8`, reference https://api.minut.com/latest/docs,
guides https://developer.minut.com) with OAuth2 `client_credentials` (the API
client the user creates in the Minut web app, Settings → Developer tools; API
access needs the Minut Enterprise plan). Transport: cloud only. Never tested
with a real Minut account: everything follows the OpenAPI reference.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
UPDATE_BASELINE=1 node --test test/structure.test.js   # ONLY with a documented migration
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer and the reading plan
src/minut-api.js        HTTP client: token (Basic, renewed, once on a 401), queue under the rate limit, pages
src/model.js            API answers -> flat sensors and homes; alarm and noise states; sound levels
src/devices.js          the devices (Minut ids), their features (they only grow) and states
src/events.js           home event types -> scene triggers, deduplication, payloads
src/widgets.js          home, events and sound history dashboard widgets
src/store.js            /data/minut.json: snapshot, features, events seen, alarm state, history
src/time.js             instants, formats in the timezone of Gladys
src/config.js           configuration (client id and secret, noise pause, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          answers built after the API reference; home-event-types.txt (the enum)
test/helpers/fake-api.js            the fake Minut API behind the `fetch` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`sensor:<Minut device id>`, `home:<Minut home id>`,
  never a name nor a position), the feature keys, feature `category` / `type`
  / `unit` / `min` / `max` / `step`, the keys of `config_schema`, `actions`,
  the widgets and their settings, scene triggers (fields, `state` options,
  variables) and scene actions (fields, outputs). `test/structure.test.js`
  compares them to `test/fixtures/discovery.baseline.json`: never update the
  baseline to make a test pass without a documented migration.
- **Only what the API documents.** Every endpoint, field and event type comes
  from the OpenAPI reference (v8). The reference documents no `GET /homes` nor
  `GET /devices` at the root: homes and sensors are read through
  `GET /organizations` and `/organizations/{id}/homes|devices`. Event types
  are the "home event" names (`HomeEventType`, kept in
  `test/fixtures/home-event-types.txt`), not the webhook names.
- **Category / type pairs.** Temperature, humidity, pressure (hPa) `decimal`;
  sound `noise-sensor` / `integer`, `decibel`; battery `battery` / `integer`;
  "removed from its plate" `tamper` / `binary`; alarm and noise monitoring
  `switch` / `binary` (the only writable ones, `has_feedback: true`); alarm
  status and noise disturbance `text` / `text`. No "online" feature (no
  category in Gladys) and no motion (not in the home events).
- **Features never flap.** A device is offered once it gave a value; its
  features are the ones it ever gave, kept in /data, never removed. A value
  Minut did not give is not published.
- **Do not poll the sensors.** Minut sensors report about once an hour (or at
  once on an event) and Minut blocks clients that poll: sensors are read at
  `next_heartbeat_at` + 2 minutes, bounded to 5-60 minutes; homes every 5
  minutes; events every minute (a minute more per 50 homes); organizations
  every 6 hours. One queue: 250 ms apart, 100 requests a minute at most
  (Minut allows 120). A 429 pauses everything (1 minute, doubled up to 30, or
  the Retry-After); refused credentials stop until the configuration changes.
- **`should_poll` stays false**: the integration has its own timer.
- **Events once, never the past.** `events` (in /data) keeps, per home, the
  instant events started to count, the last poll and the event ids seen. The
  first round of a home only sets the start; on a restart, an event older than
  15 minutes is never fired. A scene action, a widget or a command never fires
  an event, and the alarm trigger ignores the changes Gladys asked for.
- **Secrets.** The client secret and the token never reach a log, an error
  message nor /data; the diagnostic shows the first 4 characters of the id.
- **The container rootfs is read-only.** Write only under `/data`.
- **Trademark.** The Minut wordmark on the cover is the official logo of Minut,
  a trademark of its owner; README, docs and NOTICE say the integration is not
  affiliated with Minut.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. German uses "du", Spanish "usted",
  like the Gladys interface. Names from the Minut app stay as they are.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. Transport: `["cloud"]`. No permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake API of
  `test/helpers/fake-api.js`).
