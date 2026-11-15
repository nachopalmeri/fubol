#!/usr/bin/env node
/**
 * Revisa Fubol de punta a punta y dice qué anda y qué no.
 *
 * Un manifest que responde 200 no significa que el addon sirva: varios
 * devuelven manifest y después 404 en cada pedido. Este chequeo le pide a la
 * app lo mismo que le pide el reproductor (fuentes y subtítulos de un título
 * real, la lista de canales) y cuenta qué devolvió cada addon.
 *
 *   node scripts/doctor.mjs            # informe legible
 *   node scripts/doctor.mjs --json     # lo mismo, para otra herramienta
 *   node scripts/doctor.mjs --title tt0133093
 *
 * Sale con código 1 si algo que debería andar no anda.
 */
import { adminSession, APP_URL } from "./lib/admin.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const AS_JSON = process.argv.includes("--json");
const TITLE = arg("title", "tt0111161");
const EPISODE = arg("episode", "tt0903747:1:1");

async function get(cookie, pathname, timeoutMs = 120_000) {
  const started = Date.now();
  try {
    const res = await fetch(`${APP_URL}${pathname}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body, ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : "error",
    };
  }
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items ?? []) {
    const name = key(item);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** "Español · SubDL (forzados)" → "SubDL" */
function subtitleAddon(label) {
  const [, rest = label] = /^[^·]*·\s*(.*)$/.exec(label ?? "") ?? [];
  return rest.replace(/\s*\(forzados\)\s*$/, "").trim() || "desconocido";
}

const { cookie } = await adminSession();

const [health, diagnostics, movie, episode, channels] = await Promise.all([
  get(cookie, "/api/admin/health"),
  get(cookie, "/api/admin/addons/diagnostics"),
  get(cookie, `/api/vod/streams?type=movie&id=${encodeURIComponent(TITLE)}`, 280_000),
  get(cookie, `/api/vod/streams?type=series&id=${encodeURIComponent(EPISODE)}`, 280_000),
  get(cookie, "/api/live/channels"),
]);

/** "Torrentio (P2P; requiere resolver para web)" → "Torrentio", as the app shows it. */
const shortName = (name) => String(name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();

const sourcesByAddon = countBy(movie.body?.sources, (source) => shortName(source.addonName));
const episodeByAddon = countBy(episode.body?.sources, (source) => shortName(source.addonName));
// The provider comes in its own field now; older deploys put it in the label.
const subsByAddon = countBy(movie.body?.subtitles, (track) => shortName(track.provider ?? subtitleAddon(track.label)));

const rows = (diagnostics.body?.addons ?? []).map((addon) => {
  // What the title page ended up offering from this addon...
  let offered = null;
  const name = shortName(addon.name);
  if (addon.kind === "vod") offered = (sourcesByAddon.get(name) ?? 0) + (episodeByAddon.get(name) ?? 0);
  if (addon.kind === "subs") offered = subsByAddon.get(name) ?? 0;
  // ...and what the addon itself answered when asked directly. An older
  // deploy does not report it: what was offered is then the only evidence.
  const served = typeof addon.served === "number" ? addon.served : offered;
  let state = "ok";
  if (!addon.manifestOk) state = "caído";
  else if (addon.needsConfiguration) state = "falta configurar";
  else if (served === 0) state = "responde pero no entrega";
  else if (offered === 0) state = "entrega pero la app no lo ofrece";
  return {
    name: addon.name,
    kind: addon.kind,
    state,
    served,
    offered,
    detail: addon.error ?? addon.serveError ?? "",
    configureUrl: addon.needsConfiguration ? addon.configureUrl : null,
  };
});

const resolver = health.body?.resolver ?? null;
const subsync = health.body?.subsync ?? null;
const report = {
  app: APP_URL,
  title: TITLE,
  episode: EPISODE,
  endpoints: {
    health: health.status,
    diagnostics: diagnostics.status,
    movie: movie.status,
    episode: episode.status,
    channels: channels.status,
  },
  addons: rows,
  staleDiagnostics: diagnostics.body?.stale === true,
  movie: {
    sources: movie.body?.sources?.length ?? 0,
    subtitles: movie.body?.subtitles?.length ?? 0,
    spanish: (movie.body?.subtitles ?? []).filter((track) => /^(es|spa)/i.test(track.lang ?? "")).length,
    p2pOnly: movie.body?.p2pOnly ?? 0,
    reason: movie.body?.reason ?? null,
    ms: movie.ms,
  },
  series: { sources: episode.body?.sources?.length ?? 0, reason: episode.body?.reason ?? null, ms: episode.ms },
  live: {
    channels: health.body?.totalChannels ?? channels.body?.channels?.length ?? 0,
    sources: (health.body?.sources ?? []).map((source) => ({
      name: source.name,
      enabled: source.enabled,
      channels: source.channels,
    })),
  },
  resolver,
  subsync,
  storage: health.body?.storage ?? null,
};

const problems = [];
for (const [name, status] of Object.entries(report.endpoints)) {
  if (status !== 200) problems.push(`el endpoint ${name} respondió ${status || "sin respuesta"}`);
}
for (const row of rows) {
  if (row.state !== "ok") problems.push(`${row.name}: ${row.state}${row.detail ? ` (${row.detail})` : ""}`);
}
if (resolver && resolver.configured && !resolver.reachable) problems.push("el resolver de torrents no responde");
if (resolver && !resolver.configured) problems.push("no hay resolver de torrents configurado");
if (subsync && subsync.configured && !subsync.reachable) problems.push("el sincronizador por audio no responde");
if (report.movie.sources === 0) problems.push(`la película de prueba no tiene fuentes: ${report.movie.reason ?? "sin motivo"}`);
if (report.series.sources === 0) problems.push(`el episodio de prueba no tiene fuentes: ${report.series.reason ?? "sin motivo"}`);
if (report.live.channels === 0) problems.push("no hay canales en vivo");
// A sport with nothing on today has an empty catalog: worth knowing, not a fault.
const notes = report.live.sources
  .filter((source) => source.enabled && source.channels === 0)
  .map((source) => `sin canales ahora: ${source.name}`);
report.problems = problems;
report.notes = notes;

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = (state) => (state === "ok" ? "OK  " : "MAL ");
  console.log(`Fubol · ${APP_URL}`);
  console.log("");
  console.log("Addons");
  for (const row of rows) {
    const served = row.served === null ? "" : ` · entregó ${row.served}${row.offered === null ? "" : `, la app ofrece ${row.offered}`}`;
    console.log(`  ${mark(row.state)} ${row.kind.padEnd(5)} ${row.name}${served}${row.state === "ok" ? "" : ` · ${row.state}`}`);
    if (row.configureUrl) console.log(`         configurar en ${row.configureUrl}`);
    if (row.state !== "ok" && row.detail) console.log(`         ${row.detail}`);
  }
  if (report.staleDiagnostics) console.log("  (lectura anterior: la tanda actual de manifests falló entera)");
  console.log("");
  console.log(`Película ${TITLE}: ${report.movie.sources} fuentes, ${report.movie.subtitles} subtítulos (${report.movie.spanish} en español) · ${Math.round(report.movie.ms / 1000)} s`);
  console.log(`Episodio ${EPISODE}: ${report.series.sources} fuentes · ${Math.round(report.series.ms / 1000)} s`);
  console.log(`Vivo: ${report.live.channels} canales en ${report.live.sources.filter((source) => source.enabled).length} fuentes`);
  const yesNo = (status) => (!status ? "sin dato" : !status.configured ? "sin configurar" : status.reachable ? "responde" : "NO responde");
  console.log(`Resolver de torrents: ${yesNo(resolver)}`);
  console.log(`Sincronizador por audio: ${yesNo(subsync)}`);
  console.log("");
  for (const note of notes) console.log(`  (${note})`);
  if (problems.length === 0) console.log("Todo anda.");
  else {
    console.log(`${problems.length} cosa(s) para mirar:`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}
process.exit(problems.length === 0 ? 0 : 1);
