# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-01

### Added

- **devices:** Minut sensors through the official Minut API v8 (OAuth2 client credentials of the user's API client): one device per sensor with temperature, humidity, sound level, pressure, battery and "removed from its plate", and one device per home with the security alarm and the noise alerts (both writable) and their states in words
- **scenes:** triggers on the events of the homes (noise disturbance started or ended, smoke or CO alarm heard, security alarm, alarm turned on or off outside Gladys, sensor taken off its plate, sensor offline or back, battery low, temperature and humidity alerts, risk of mould, sensor button, smoking, crowd), deduplicated and never replayed; actions to turn the alarm on or off, silence it, pause or resume the noise alerts and read the status of a home
- **widgets:** a home at a glance with the alarm and noise buttons, the last events of a home, and the sound level of a sensor over 24 hours
- **polling:** events every minute, homes every 5 minutes, sensors at their next expected report (5 to 60 minutes), one queue under the rate limit of the API with a back-off on 429
- **configuration:** client id and secret with a guide, length of the noise alerts pause, language, "Connect and search" and "Diagnostic" buttons
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-minut/releases/tag/v0.1.0
