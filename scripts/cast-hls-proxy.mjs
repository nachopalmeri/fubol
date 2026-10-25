#!/usr/bin/env node
/**
 * Proxy HLS para Chromecast 3 (prueba de concepto).
 *
 * El Chromecast no puede instalar la CA interna ni reproducir MKV/HEVC.
 * Este proxy sirve playlists y segmentos por HTTP en la LAN, reescribe las
 * URLs y agrega CORS. No imprime ni registra tokens de TorBox/AIOStreams.
 *
 * Uso: node scripts/cast-hls-proxy.mjs [port]
 */
import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.argv[2] || 8091);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ALLOWED_HOSTS = [
  'papacito.cfd',
  'devstreaming-cdn.apple.com',
  'test-streams.mux.dev',
  'stream.mux.com',
  'demo.unified-streaming.com',
];

function b64u(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}
function unb64u(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}
function allowed(u) {
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}
function upstream(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  if (!allowed(u)) throw new Error('host not allowed');
  return u;
}
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
}
function rewritePlaylist(text, base) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#')) {
      let next = line;
      next = next.replace(/URI="([^"]+)"/g, (_, uri) => {
        try {
          const abs = new URL(uri, base).toString();
          return `URI="${abs.endsWith('.m3u8') || abs.includes('.m3u8?') ? 'hls' : 'seg'}?u=${b64u(abs)}"`;
        } catch { return _; }
      });
      out.push(next);
      continue;
    }
    try {
      const abs = new URL(line, base).toString();
      const isPlaylist = /\.m3u8($|\?)/i.test(abs);
      out.push(`${isPlaylist ? 'hls' : 'seg'}?u=${b64u(abs)}`);
    } catch {
      out.push(line);
    }
  }
  return out.join('\n') + '\n';
}
async function fetchUpstream(u, req) {
  const headers = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
  };
  if (req.headers.range) headers.Range = req.headers.range;
  return fetch(u, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) });
}
const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  let url;
  try {
    const reqUrl = new URL(req.url, 'http://localhost');
    if (reqUrl.pathname !== '/hls' && reqUrl.pathname !== '/seg') throw new Error('path');
    const raw = reqUrl.searchParams.get('u');
    if (!raw) throw new Error('missing u');
    url = upstream(unb64u(raw));
    const r = await fetchUpstream(url, req);
    const ct = r.headers.get('content-type') || '';
    const isPlaylist = reqUrl.pathname === '/hls' || /mpegurl/i.test(ct) || /\.m3u8($|\?)/i.test(url.pathname + url.search);
    if (isPlaylist) {
      const text = await r.text();
      const body = rewritePlaylist(text, url.toString());
      res.writeHead(r.status === 200 ? 200 : r.status, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': Buffer.byteLength(body),
      });
      if (req.method === 'HEAD') res.end(); else res.end(body);
      return;
    }
    res.writeHead(r.status, {
      'Content-Type': ct || 'application/octet-stream',
      'Cache-Control': 'public, max-age=30',
      ...(r.headers.get('content-range') ? { 'Content-Range': r.headers.get('content-range') } : {}),
      ...(r.headers.get('accept-ranges') ? { 'Accept-Ranges': r.headers.get('accept-ranges') } : {}),
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) {
    const msg = String(e.message || e);
    console.error(`[cast-proxy] ${req.method} ${req.url?.slice(0, 80)} error=${msg}`);
    res.writeHead(msg === 'host not allowed' || msg === 'protocol' ? 403 : 502, { 'Content-Type': 'text/plain' });
    res.end('cast proxy error');
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cast-proxy] listening on http://0.0.0.0:${PORT}`);
});
