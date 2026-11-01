#!/usr/bin/env node
/** Additive local config copy. Never copies app sessions, app keys, history or share links.
 * Provider URLs/config MAY contain credentials; applying requires explicit opt-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = new URL(value('--to', 'http://127.0.0.1:3002'));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') {
  throw new Error('Transfer only supports an explicitly local HTTP target');
}
const sourceFile = path.resolve(root, value('--from', 'web/data/fubol.sqlite'));
const passwordFile = path.resolve(root, value('--password-file', 'data/fubol/admin-password.txt'));
const db = new DatabaseSync(sourceFile, { readOnly: true });
const addons = db.prepare('SELECT url, name, kind, enabled FROM addons').all();
const sources = db.prepare('SELECT id, kind, name, url, config, enabled, priority FROM live_sources').all();
db.close();
console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', addons: addons.length, sources: sources.length, shareLinksCopied: 0, appSecretsCopied: 0, providerCredentialsMayBeCopied: true }));
if (!args.includes('--apply')) process.exit(0);
if (!args.includes('--include-provider-secrets')) {
  console.error('Provider URLs and source config may contain credentials. Apply requires --include-provider-secrets for this local-only transfer. No records were copied.');
  process.exit(1);
}

let cookie = '';
async function request(route, method = 'GET', data) {
  const response = await fetch(new URL(route, base), {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(30000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Local configuration operation failed: HTTP ${response.status}`);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return response.json();
}
try {
  await request('/api/auth/admin', 'POST', { password: fs.readFileSync(passwordFile, 'utf8').trim() });
  let added = 0;
  for (const addon of addons) {
    const saved = await request('/api/admin/addons', 'POST', { url: addon.url, name: addon.name, kind: addon.kind });
    if (!addon.enabled) await request('/api/admin/addons', 'PATCH', { id: saved.addon.id, enabled: false });
    added++;
  }
  const existing = await request('/api/admin/sources');
  let imported = 0;
  for (const source of sources) {
    if (existing.sources.some((item) => item.id === source.id)) continue;
    await request('/api/admin/sources', 'POST', { ...source, config: JSON.parse(source.config), enabled: Boolean(source.enabled) });
    imported++;
  }
  console.log(JSON.stringify({ ok: true, addonsProcessed: added, sourcesAdded: imported, shareLinksCopied: 0 }));
} catch {
  console.error('Transfer stopped. Existing target records preserved; credentials and provider URLs withheld. Check target health and local admin-password path.');
  process.exitCode = 1;
}
