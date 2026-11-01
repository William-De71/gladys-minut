import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readSnooze, readLanguage, SNOOZE, AUTO_LANGUAGE } from '../src/config.js';

test('the client id and secret, trimmed; empty when absent', () => {
  assert.deepEqual(normalizeConfig({ client_id: ' id ', client_secret: ' s3cret\n' }), {
    clientId: 'id',
    clientSecret: 's3cret',
    snoozeMinutes: SNOOZE.default,
    language: AUTO_LANGUAGE,
  });
  assert.deepEqual(normalizeConfig(null), {
    clientId: '',
    clientSecret: '',
    snoozeMinutes: 60,
    language: 'auto',
  });
});

test('the noise pause within 5 minutes and a day, the default otherwise', () => {
  assert.equal(readSnooze(90), 90);
  assert.equal(readSnooze('30.4'), 30);
  assert.equal(readSnooze(2), 60);
  assert.equal(readSnooze(5000), 60);
  assert.equal(readSnooze('soon'), 60);
});

test('the language: one of the four, or automatic; the stored one of the widgets', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'en'), 'en');
});
