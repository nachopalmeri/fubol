#!/usr/bin/env node
/**
 * Validate the TorBox API key without printing it.
 *
 * Usage:
 *   node scripts/torbox-validate.mjs
 *   node scripts/torbox-validate.mjs --key-file <path>   # negative tests only
 *
 * Exit codes:
 *   0 valid key
 *   1 invalid/unauthorized key or API error
 *   2 key file missing or empty
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_KEY_PATH = path.join(ROOT, '.secrets', 'torbox.key');
const API_URL = 'https://api.torbox.app/v1/api/user/me';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readKey(file) {
  if (!fs.existsSync(file)) return { state: 'missing' };
  const raw = fs.readFileSync(file, 'utf8');
  const key = raw.trim();
  if (!key) return { state: 'empty' };
  if (/\s/.test(key)) return { state: 'multiline' };
  return { state: 'present', key };
}

function fail(message, code) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

const keyFile = path.resolve(argValue('--key-file') || DEFAULT_KEY_PATH);
const result = readKey(keyFile);

if (result.state === 'missing') {
  console.log('key_present=false');
  console.log('key_state=missing');
  console.log(`key_path=${keyFile}`);
  process.exit(2);
}
if (result.state === 'empty') {
  console.log('key_present=false');
  console.log('key_state=empty');
  console.log(`key_path=${keyFile}`);
  process.exit(2);
}
if (result.state === 'multiline') {
  console.log('key_present=true');
  console.log('key_state=multiline');
  fail('the key file must contain a single line with no whitespace', 2);
}

console.log('key_present=true');
console.log('key_state=present');

let response;
try {
  response = await fetch(API_URL, {
    headers: {
      authorization: `Bearer ${result.key}`,
      accept: 'application/json',
      'user-agent': 'fubol-setup/1.0',
    },
    signal: AbortSignal.timeout(20000),
  });
} catch (error) {
  console.log('authorized=false');
  fail(`TorBox request failed: ${error.name || 'network error'}`, 1);
}

console.log(`http=${response.status}`);
let body = null;
try {
  body = await response.json();
} catch {
  // Keep the output free of response bodies: they may contain account data.
}

if (response.status === 401 || response.status === 403) {
  console.log('authorized=false');
  console.log('reason=unauthorized');
  process.exit(1);
}
if (response.status !== 200) {
  console.log('authorized=false');
  console.log(`reason=http_${response.status}`);
  process.exit(1);
}
if (body && body.success === false) {
  console.log('authorized=false');
  console.log(`reason=${String(body.error || 'api_error').slice(0, 120)}`);
  process.exit(1);
}

console.log('authorized=true');
const data = body?.data || {};
if (typeof data.plan === 'string' || typeof data.plan === 'number') {
  console.log(`plan=${data.plan}`);
}
if (typeof data.is_subscribed === 'boolean') {
  console.log(`subscribed=${data.is_subscribed}`);
}
if (typeof data.premium_expires_at === 'string') {
  console.log(`premium_expires_at=${data.premium_expires_at}`);
}
