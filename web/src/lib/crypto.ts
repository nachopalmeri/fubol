import crypto from "node:crypto";
import { getSecret } from "./env";

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

/** Compact signed envelope: base64url(json).base64url(hmac). */
export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlMs };
  const encoded = b64url(JSON.stringify(body));
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyToken<T extends Record<string, unknown>>(
  token: string | undefined | null,
): (T & { iat: number; exp: number }) | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = hmac(encoded);
  if (!safeEqualStr(signature, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(encoded).toString("utf8")) as T & {
      iat: number;
      exp: number;
    };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function shortHash(value: string, length = 16): string {
  return sha256(value).slice(0, length);
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** scrypt password hash for optional share-link PINs. */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const derived = crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  return safeEqualStr(derived.toString("hex"), hashHex);
}

/** Removes credentials and query strings before logging a URL. */
export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}
