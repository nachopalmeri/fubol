#!/usr/bin/env node
/**
 * Comprueba los partidos argentinos del catálogo de Sports Streams.
 * Uso:
 *   node scripts/check-argentine-football.mjs
 *   node scripts/check-argentine-football.mjs River Boca Racing
 *
 * No imprime URLs firmadas ni credenciales. No inventa fuentes: si el addon
 * devuelve 0 streams, lo reporta como 0.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, '.secrets', 'aiostreams-user.env');
if (!fs.existsSync(ENV_PATH)) {
  console.error('Falta .secrets/aiostreams-user.env; ejecutá prepare primero.');
  process.exit(2);
}
const env = Object.fromEntries(
  fs
    .readFileSync(ENV_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
);
const manifest = env.AIOSTREAMS_MANIFEST_URL_LOCAL;
if (!manifest) {
  console.error('Falta AIOSTREAMS_MANIFEST_URL_LOCAL.');
  process.exit(2);
}
const base = manifest.replace(/\/manifest\.json$/, '');
const catalog = 'sports-streamse3b0.sports_football';
const argentineTeams = [
  'River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo',
  'Vélez Sarsfield', 'Estudiantes', 'Gimnasia', 'Rosario Central', 'Newell',
  'Talleres', 'Belgrano', 'Huracán', 'Lanús', 'Banfield', 'Defensa y Justicia',
  'Tigre', 'Argentinos Juniors', 'Barracas Central', 'Central Córdoba',
  'Sarmiento', 'Deportivo Riestra', 'Unión',
];
const terms =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : argentineTeams;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url, timeout = 30000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return body;
}

async function collect() {
  const found = new Map();
  for (const term of terms) {
    const url = `${base}/catalog/sport/${encodeURIComponent(catalog)}/search=${encodeURIComponent(term)}.json`;
    try {
      const body = await json(url);
      for (const meta of body?.metas || []) {
        if (!found.has(meta.id)) found.set(meta.id, meta);
      }
    } catch (error) {
      console.log(`search ${term}: ${error.message}`);
    }
    await sleep(1200);
  }
  const argentine = [...found.values()].filter((meta) =>
    argentineTeams.some((team) => meta.name?.toLocaleLowerCase('es').includes(team.toLocaleLowerCase('es')))
  );
  return argentine;
}

function latencyFromPlaylist(text) {
  const matches = [...text.matchAll(/#EXT-X-PROGRAM-DATE-TIME:(.*)/g)];
  if (matches.length === 0) return null;
  const last = Date.parse(matches.at(-1)[1]);
  if (!Number.isFinite(last)) return null;
  return Math.max(0, Date.now() - last);
}

async function inspect(meta) {
  const streamUrl = `${base}/stream/sport/${encodeURIComponent(meta.id)}.json`;
  let body;
  try {
    body = await json(streamUrl);
  } catch (error) {
    console.log(`${meta.name}\tstreams=error (${error.message})`);
    return;
  }
  const streams = body?.streams || [];
  const real = streams.filter(
    (stream) =>
      stream.url &&
      !/sports\.highfly\.to\/health|google\.com|127\.0\.0\.1/.test(stream.url)
  );
  if (real.length === 0) {
    console.log(`${meta.name}\tstreams=${streams.length}\treal=0`);
    return;
  }
  let media = 'sin respuesta';
  let latency = null;
  try {
    const response = await fetch(real[0].url, {
      headers: { range: 'bytes=0-4095', 'user-agent': 'VLC/3.0.21 LibVLC/3.0.21' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    if (contentType.includes('mpegurl')) {
      const text = await response.text();
      latency = latencyFromPlaylist(text);
      media = `hls ${response.status}`;
    } else {
      media = `${contentType || 'desconocido'} ${response.status}`;
    }
  } catch (error) {
    media = `fetch ${error.name}`;
  }
  const latencyText = latency === null ? '' : `\tlatency_ms=${latency}`;
  console.log(
    `${meta.name}\tstreams=${streams.length}\treal=${real.length}\t${media}${latencyText}`
  );
}

const events = await collect();
if (events.length === 0) {
  console.log('No se encontraron partidos argentinos en el catálogo ahora.');
  process.exit(0);
}
console.log(`partidos=${events.length}`);
for (const meta of events) {
  await inspect(meta);
  await sleep(2000);
}
