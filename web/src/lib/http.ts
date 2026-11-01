import dns from "node:dns/promises";
import net from "node:net";
import { env } from "./env";

const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Fubol/0.1";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("ff")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return ipv4IsPrivate(mapped[1]);
  return false;
}

function hostIsPrivate(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (net.isIP(host) === 4) return ipv4IsPrivate(host);
  if (net.isIP(host) === 6) return ipv6IsPrivate(host);
  return false;
}

const dnsCache = new Map<string, { at: number; addresses: string[] }>();

async function resolveHost(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.at < 60_000) return cached.addresses;
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = results.map((r) => r.address);
  if (dnsCache.size > 500) dnsCache.clear();
  dnsCache.set(hostname, { at: Date.now(), addresses });
  return addresses;
}

/**
 * Blocks SSRF: only http(s), no loopback/link-local/metadata/private ranges
 * unless the operator explicitly opts in (LAN IPTV).
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamError("URL inválida", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UpstreamError("Solo se permiten URLs http/https", 400);
  }
  if (hostIsPrivate(url.hostname)) {
    if (env.allowPrivateSources) return url;
    throw new UpstreamError("Destino privado bloqueado (FUBOL_ALLOW_PRIVATE_SOURCES=1 para LAN)", 403);
  }
  if (net.isIP(url.hostname) === 0) {
    let addresses: string[] = [];
    try {
      addresses = await resolveHost(url.hostname);
    } catch {
      throw new UpstreamError("No se pudo resolver el host", 502);
    }
    if (addresses.length === 0) throw new UpstreamError("Host sin direcciones", 502);
    if (!env.allowPrivateSources && addresses.some(hostIsPrivate)) {
      throw new UpstreamError("El host resuelve a una dirección privada", 403);
    }
  }
  return url;
}

export interface UpstreamOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  range?: string;
  method?: string;
  body?: BodyInit;
  maxRedirects?: number;
}

export interface UpstreamResponse {
  res: Response;
  finalUrl: string;
  ms: number;
}

export async function fetchUpstream(
  rawUrl: string,
  options: UpstreamOptions = {},
): Promise<UpstreamResponse> {
  const url = await assertSafeUrl(rawUrl);
  const timeoutMs = options.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const started = Date.now();
  try {
    const headers = new Headers({
      "user-agent": DEFAULT_UA,
      accept: "*/*",
      ...options.headers,
    });
    if (options.range) headers.set("range", options.range);
    let target = url;
    let method = options.method ?? "GET";
    let body = options.body;
    for (let redirects = 0; ; redirects++) {
      const res = await fetch(target, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
      const location = res.headers.get("location");
      if (![301, 302, 303, 307, 308].includes(res.status) || !location) {
        return { res, finalUrl: res.url || target.toString(), ms: Date.now() - started };
      }
      await res.body?.cancel();
      if (redirects >= (options.maxRedirects ?? 5)) throw new UpstreamError("Demasiadas redirecciones", 502);
      const next = await assertSafeUrl(new URL(location, target).toString());
      if (target.origin !== next.origin) {
        headers.delete("authorization");
        headers.delete("cookie");
      }
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      target = next;
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted) throw new UpstreamError("Timeout del origen", 504);
    throw new UpstreamError(
      `No se pudo conectar con el origen: ${error instanceof Error ? error.message : "error"}`,
      502,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function readTextLimited(res: Response, maxBytes = 2_000_000): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
      total += Math.min(value.byteLength, remaining);
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export async function fetchText(
  url: string,
  options: UpstreamOptions & { maxBytes?: number } = {},
): Promise<{ text: string; res: Response; finalUrl: string; ms: number }> {
  const { res, finalUrl, ms } = await fetchUpstream(url, options);
  if (!res.ok) {
    throw new UpstreamError(`El origen respondió ${res.status}`, res.status >= 500 ? 502 : res.status);
  }
  const text = await readTextLimited(res, options.maxBytes);
  return { text, res, finalUrl, ms };
}

export async function fetchJson<T>(
  url: string,
  options: UpstreamOptions = {},
): Promise<{ data: T; res: Response; ms: number }> {
  const { res, ms } = await fetchUpstream(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  if (!res.ok) {
    throw new UpstreamError(`El origen respondió ${res.status}`, res.status >= 500 ? 502 : res.status);
  }
  const text = await readTextLimited(res, 4_000_000);
  try {
    return { data: JSON.parse(text) as T, res, ms };
  } catch {
    throw new UpstreamError("El origen no devolvió JSON", 502);
  }
}

export type GateKind = "login" | "captcha" | "html" | "drm" | "unknown";

/** Detects interstitials that mean "this source is not a playable stream". */
export function detectGate(text: string): GateKind | null {
  if (text.includes("#EXTM3U")) return null;
  const head = text.slice(0, 4000).toLowerCase();
  if (head.includes("captcha") || head.includes("cf-chl") || head.includes("just a moment")) {
    return "captcha";
  }
  if (head.includes("login") || head.includes("iniciar sesión") || head.includes("sign in")) {
    return "login";
  }
  if (head.includes("widevine") || head.includes("playready") || head.includes("drm")) {
    return "drm";
  }
  if (head.includes("<!doctype") || head.includes("<html")) return "html";
  return null;
}

export function looksLikePlaylist(text: string): boolean {
  return text.trimStart().startsWith("#EXTM3U");
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UpstreamError(label, 504)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs tasks with a concurrency cap and per-task failure isolation. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}
