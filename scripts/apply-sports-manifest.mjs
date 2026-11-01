#!/usr/bin/env node
/** Import an operator-generated manifest; never bypasses provider verification. */
import fs from 'node:fs';
import path from 'node:path';
import { validateSportsManifest } from './lib/sports-manifest.mjs';
const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, '.secrets/sports-manifest.txt');
if (!fs.existsSync(file)) {
  console.error('Sports Streams needs the provider verification at https://sports.highfly.to/configure. Save the generated manifest locally in .secrets/sports-manifest.txt, then rerun. No source changed.');
  process.exit(2);
}
try {
  const manifest = fs.readFileSync(file, 'utf8').trim();
  const url = validateSportsManifest(manifest);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) throw new Error('Manifest unavailable');
  const m = await response.json();
  if (m.id !== 'community.sports.fly' || !m.catalogs?.some((catalog) => catalog.id === 'sports_live')) throw new Error('Unexpected manifest');
  const base = 'http://127.0.0.1:3001';
  const login = await fetch(`${base}/api/auth/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: fs.readFileSync(path.join(root, 'data/fubol/admin-password.txt'), 'utf8').trim() }), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!login.ok) throw new Error('Local authentication failed');
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const list = await fetch(`${base}/api/admin/sources`, { headers: { cookie }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!list.ok) throw new Error('Cannot list local config');
  const sources = (await list.json()).sources;
  let updated = 0;
  for (const catalogId of ['sports_live', 'sports_football']) {
    if (!m.catalogs.some((catalog) => catalog.id === catalogId)) continue;
    const existing = sources.find((source) => source.kind === 'addon' && source.config.catalogId === catalogId && /sports\.highfly\.(dev|to)/.test(source.url));
    const payload = { id: existing?.id, kind: 'addon', name: catalogId === 'sports_live' ? 'Sports Streams · En vivo' : 'Sports Streams · Fútbol', url: manifest, config: { catalogId, catalogType: 'sport' }, enabled: true, priority: catalogId === 'sports_live' ? 20 : 10 };
    const saved = await fetch(`${base}/api/admin/sources`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!saved.ok) throw new Error('Local source update failed');
    updated++;
  }
  console.log(JSON.stringify({ manifest: 'validated', sourcesUpdated: updated, credentialsPrinted: false, videoPlaybackVerified: false }));
} catch {
  console.error('Sports manifest import stopped. Check the provider-generated manifest and local runtime. Private URL and credentials withheld.');
  process.exitCode = 1;
}
