#!/usr/bin/env node
/** Create a PIN-protected family link. Write it locally; never print credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const index = process.argv.indexOf('--origin');
if (index < 0 || !process.argv[index + 1]) throw new Error('Specify --origin with the LAN or configured HTTPS origin reachable by the family');
const origin = new URL(process.argv[index + 1]);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Expected an http(s) origin without credentials/path/query');
const destination = path.join(root, 'data/fubol/family-access.txt');
if (fs.existsSync(destination)) throw new Error('Family access file already exists; manage the existing link in the admin instead of overwriting it');
const base = 'http://127.0.0.1:3001';
const password = fs.readFileSync(path.join(root, 'data/fubol/admin-password.txt'), 'utf8').trim();
const login = await fetch(`${base}/api/auth/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }), redirect: 'error', signal: AbortSignal.timeout(10000) });
if (!login.ok) throw new Error('Local admin authentication failed');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Missing local admin session');
const pin = String(crypto.randomInt(100000, 1000000));
const created = await fetch(`${base}/api/admin/links`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ label: 'Familia · LAN', permissions: ['live', 'vod'], expiresInDays: 30, pin }), redirect: 'error', signal: AbortSignal.timeout(10000) });
if (!created.ok) throw new Error('Family link creation failed');
const data = await created.json();
try {
  fs.writeFileSync(destination, `Private family access — do not commit or publish this file.\n\nURL: ${origin.origin}/f/${encodeURIComponent(data.link.code)}\nPIN: ${pin}\nExpires: ${new Date(data.link.expiresAt).toISOString()}\n\nLAN access is not public internet access. Revoke this link from /admin if needed.\n`, { flag: 'wx', mode: 0o600 });
} catch (error) {
  await fetch(`${base}/api/admin/links/${data.link.id}`, { method: 'DELETE', headers: { cookie }, redirect: 'error' });
  throw error;
}
console.log('Family link and random PIN saved to data/fubol/family-access.txt. Values withheld.');
