// -----------------------------------------------------------------------------
// Entry point of the Minut external integration.
//
// Brings Minut home sensors into Gladys through the official Minut API (an
// OAuth2 client per user, created in the Minut web app):
//   - devices: one per sensor (temperature, humidity, sound level, pressure,
//     battery, mounting plate) and one per home (alarm, noise monitoring);
//   - scene triggers: noise disturbance, smoke or CO alarm heard, security
//     alarm, tamper, sensor offline, battery, temperature, humidity, mould,
//     button, smoking, crowd, alarm switched outside Gladys;
//   - scene actions: alarm on or off, silence, noise monitoring, read a home;
//   - dashboard widgets: a home at a glance, last events, sound over 24 h.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Minut integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
