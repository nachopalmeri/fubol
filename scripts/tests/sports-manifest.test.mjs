import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSportsManifest } from '../lib/sports-manifest.mjs';

test('rejects a public template without the provider verification result', () => {
  assert.throws(() => validateSportsManifest('https://sports.highfly.to/manifest.json'), /verification/);
  const config = Buffer.from(JSON.stringify({ hideTip: true })).toString('base64url');
  assert.throws(() => validateSportsManifest(`https://sports.highfly.to/${config}/manifest.json`), /verification/);
});
test('validates origin and personal config shape without claiming the synthetic ID works', () => {
  const config = Buffer.from(JSON.stringify({ freeUserId: 'synthetic-test-only', hideTip: true })).toString('base64url');
  assert.equal(validateSportsManifest(`https://sports.highfly.to/${config}/manifest.json`).hostname, 'sports.highfly.to');
  assert.throws(() => validateSportsManifest(`https://sports.highfly.to.example.test/${config}/manifest.json`));
  assert.throws(() => validateSportsManifest(`http://sports.highfly.to/${config}/manifest.json`));
});
