#!/usr/bin/env node
/**
 * Catalogo de addons de Fubol.
 *
 * Uso:
 *   node scripts/addons.mjs status        # verifica manifests/configs en vivo
 *   node scripts/addons.mjs page          # genera public/addons/index.html
 *   node scripts/addons.mjs json          # imprime el catalogo
 *
 * No imprime secretos ni URLs privadas. El manifest de AIOStreams se resuelve
 * desde .secrets/aiostreams-user.env y solo se muestra como "self-hosted".
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'config', 'addons', 'catalog.json');
const PAGE_DIR = path.join(ROOT, 'public', 'addons');
const PAGE_PATH = path.join(PAGE_DIR, 'index.html');
const TIMEOUT_MS = 12000;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) fail(`missing catalog: ${CATALOG_PATH}`);
  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    if (!Array.isArray(catalog.addons)) fail('catalog.addons must be an array');
    return catalog;
  } catch (error) {
    fail(`invalid catalog JSON: ${error.message}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, body };
}

async function check(entry) {
  if (entry.kind === 'web' || entry.kind === 'self-hosted') {
    return { state: 'manual', detail: entry.kind };
  }
  if (!entry.manifest) {
    return { state: 'manual', detail: 'sin manifest' };
  }
  try {
    const { response, body } = await fetchJson(entry.manifest);
    if (!response.ok || !body) {
      return { state: 'down', detail: `HTTP ${response.status}` };
    }
    const resources = Array.isArray(body.resources)
      ? body.resources.map((r) => (typeof r === 'string' ? r : r.name)).filter(Boolean)
      : [];
    const configurable = Boolean(body.behaviorHints?.configurable);
    return {
      state: 'ok',
      detail: `${body.name || entry.name} ${body.version || ''}`.trim(),
      resources,
      configurable,
    };
  } catch (error) {
    return { state: 'down', detail: error.name || 'fetch error' };
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function status() {
  const catalog = readCatalog();
  const checks = await mapLimit(catalog.addons, 5, check);
  const rows = catalog.addons.map((entry, i) => ({ entry, check: checks[i] }));
  const label = { ok: 'OK', down: 'SIN RESPUESTA', manual: 'MANUAL' };
  console.log(`catalog=${catalog.addons.length} updated=${catalog.updated}`);
  for (const { entry, check: result } of rows) {
    const detail = result.detail ? ` (${result.detail})` : '';
    console.log(
      `${label[result.state] || result.state}\t${entry.category}\t${entry.name}${detail}`
    );
  }
  const ok = rows.filter(({ check: r }) => r.state === 'ok').length;
  const down = rows.filter(({ check: r }) => r.state === 'down').length;
  console.log(`summary ok=${ok} down=${down} manual=${rows.length - ok - down}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function installHref(entry) {
  if (entry.kind === 'remote' && entry.manifest && !entry.config) {
    return entry.manifest.replace(/^https?:\/\//, 'stremio://');
  }
  return entry.config || entry.install || '';
}

function card(entry, result) {
  const stateLabel = { ok: 'activo', down: 'sin respuesta', manual: 'manual' }[result.state] || result.state;
  const stateClass = result.state === 'ok' ? 'ok' : result.state === 'down' ? 'down' : 'manual';
  const riskLabel = { official: 'oficial', gray: 'P2P', open: 'open source' }[entry.risk] || entry.risk;
  const href = installHref(entry);
  const action = entry.kind === 'remote' && entry.config ? 'Configurar' : entry.kind === 'web' ? 'Abrir' : 'Instalar';
  const manifestLink = entry.manifest
    ? `<a class="ghost" href="${escapeHtml(entry.manifest)}" target="_blank" rel="noreferrer">Manifest</a>`
    : '';
  return `<article class="card">
  <header><h3>${escapeHtml(entry.name)}</h3><span class="badge ${stateClass}">${stateLabel}</span></header>
  <p>${escapeHtml(entry.note)}</p>
  <p class="meta"><span class="risk ${escapeHtml(entry.risk)}">${escapeHtml(riskLabel)}</span> ${escapeHtml(entry.license)}</p>
  <div class="actions">
    <a class="primary" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${action}</a>
    ${manifestLink}
  </div>
</article>`;
}

function buildPage(catalog, checks) {
  const groups = [
    ['streams', 'Streams y scrapers'],
    ['metadata', 'Metadata y posters'],
    ['subtitles', 'Subtitulos'],
    ['official-live', 'Vivo oficial'],
  ];
  const sections = groups
    .map(([id, title]) => {
      const rows = catalog.addons
        .map((entry, i) => ({ entry, result: checks[i] }))
        .filter(({ entry }) => entry.category === id);
      if (rows.length === 0) return '';
      return `<section><h2>${title}</h2><div class="grid">${rows
        .map(({ entry, result }) => card(entry, result))
        .join('\n')}</div></section>`;
    })
    .join('\n');
  const generated = new Date().toISOString();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#101820"><title>Fubol - Addons</title>
<style>
:root{color-scheme:dark;font:16px system-ui,sans-serif;background:#0c141b;color:#f4f6f7}
*{box-sizing:border-box}body{margin:0;padding:32px 20px 64px;line-height:1.5}
main{max-width:1080px;margin:0 auto}h1{font-size:2rem;margin:0 0 .2em}h2{font-size:1.15rem;margin:2.2em 0 .8em;color:#b7f36b}
p{color:#c6d0d7;margin:.4em 0}.lede{max-width:70ch}.note{border-left:3px solid #b7f36b;padding-left:12px;color:#c6d0d7}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{background:#121e27;border:1px solid #22323e;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px}
.card header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.card h3{font-size:1.05rem;margin:0}.card p{font-size:.9rem;flex:1}
.meta{color:#9baab4;font-size:.78rem;display:flex;align-items:center;gap:8px}
.badge{font-size:.7rem;padding:3px 8px;border-radius:999px;white-space:nowrap}
.badge.ok{background:#1f3d22;color:#b7f36b}.badge.down{background:#3d1f1f;color:#ff9b9b}.badge.manual{background:#2a3340;color:#c6d0d7}
.risk{font-size:.7rem;padding:2px 7px;border-radius:999px;background:#2a3340;color:#c6d0d7}
.risk.official{background:#1f3d22;color:#b7f36b}.risk.gray{background:#3d321f;color:#ffd28a}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.actions a{text-decoration:none;font-size:.85rem;font-weight:600;padding:9px 12px;border-radius:9px}
.primary{background:#b7f36b;color:#101820}.ghost{border:1px solid #334552;color:#c6d0d7}
footer{margin-top:36px;color:#7f8f9b;font-size:.8rem}
</style></head><body><main>
<h1>Addons de Fubol</h1>
<p class="lede">Catalogo curado de addons oficiales, open source y configurables para Stremio/Nuvio. Los scrapers P2P estan marcados: su codigo puede ser abierto, pero el contenido que indexan puede no estar licenciado.</p>
<p class="note">Regla P2P: si usas el debrid nativo de Nuvio (TorBox/Premiumize), configura los scrapers sin API key y en modo P2P. Si el addon resuelve debrid, Nuvio nunca ve el hash.</p>
${sections}
<footer>Generado ${escapeHtml(generated)} desde config/addons/catalog.json. Estado verificado al generar la pagina; puede cambiar.</footer>
</main></body></html>`;
}

async function page() {
  const catalog = readCatalog();
  const checks = await mapLimit(catalog.addons, 5, check);
  fs.mkdirSync(PAGE_DIR, { recursive: true });
  fs.writeFileSync(PAGE_PATH, buildPage(catalog, checks), 'utf8');
  console.log(`page=${path.relative(ROOT, PAGE_PATH)}`);
  console.log(`addons=${catalog.addons.length}`);
  const down = checks.filter((c) => c.state === 'down').length;
  console.log(`down=${down}`);
}

const action = process.argv[2] || 'status';
if (action === 'status') {
  await status();
} else if (action === 'page') {
  await page();
} else if (action === 'json') {
  console.log(JSON.stringify(readCatalog(), null, 2));
} else {
  fail(`unknown action: ${action}`);
}
