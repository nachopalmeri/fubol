import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { safeEqualStr, signToken, verifyToken, verifyPin } from "./crypto";
import { getAdminPassword } from "./env";
import { getShareLink, linkIsActive, touchShareLink, type Permission } from "./links";

export const SESSION_COOKIE = "fubol_session";
const ADMIN_TTL = 12 * 3600_000;
const LINK_TTL = 30 * 86_400_000;

export type Session =
  | { role: "admin" }
  | { role: "link"; code: string; linkId: number; label: string; permissions: Permission[] };

interface AdminPayload extends Record<string, unknown> {
  r: "a";
}

interface LinkPayload extends Record<string, unknown> {
  r: "l";
  c: string;
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const payload = verifyToken<AdminPayload | LinkPayload>(raw);
  if (!payload) return null;

  if (payload.r === "a") return { role: "admin" };
  if (payload.r === "l") {
    const link = getShareLink(payload.c);
    if (!link || !linkIsActive(link)) return null;
    return {
      role: "link",
      code: link.code,
      linkId: link.id,
      label: link.label,
      permissions: link.permissions,
    };
  }
  return null;
}

export async function requirePageSession(permission?: Permission): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (permission && session.role === "link" && !session.permissions.includes(permission)) {
    redirect(`/?denegado=${permission}`);
  }
  return session;
}

export function checkAdminPassword(candidate: string): boolean {
  return safeEqualStr(candidate, getAdminPassword());
}

export function isSecureRequest(request: Request): boolean {
  if (process.env.FUBOL_INSECURE_COOKIES === "1") return false;
  if (new URL(request.url).protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  return forwarded?.split(",")[0]?.trim() === "https";
}

export function attachAdminSession(response: NextResponse, request: Request): void {
  response.cookies.set(SESSION_COOKIE, signToken({ r: "a" }, ADMIN_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: Math.floor(ADMIN_TTL / 1000),
  });
}

export function attachLinkSession(response: NextResponse, code: string, request: Request): void {
  response.cookies.set(SESSION_COOKIE, signToken({ r: "l", c: code }, LINK_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: Math.floor(LINK_TTL / 1000),
  });
  touchShareLink(code);
}

export function clearSession(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function baseUrl(request: Request): string {
  const configured = process.env.FUBOL_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function validateLinkAccess(
  code: string,
  pin: string | null,
): { ok: true } | { ok: false; reason: "invalid" | "pin"; status: number } {
  const link = getShareLink(code);
  if (!link || !linkIsActive(link)) return { ok: false, reason: "invalid", status: 404 };
  if (link.pinHash && !verifyPin(pin ?? "", link.pinHash)) {
    return { ok: false, reason: "pin", status: 401 };
  }
  return { ok: true };
}
