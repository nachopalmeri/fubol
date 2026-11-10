import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShareLink, linkIsActive } from "@/lib/links";
import { attachLinkSession, baseUrl, SESSION_COOKIE, validateLinkAccess } from "@/lib/auth";
import { normalizeCode, verifyToken } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;
  // Redirect against the host the visitor used, not the container bind address.
  const origin = baseUrl(request);
  const link = await getShareLink(code);
  if (!link || !linkIsActive(link)) {
    return NextResponse.redirect(new URL("/entrar?motivo=invalido", origin));
  }

  // A valid cookie used to short-circuit the whole route, so handing someone a
  // replacement link after revoking their old one left them stuck: they were
  // sent to "/", their revoked session failed there, and they bounced to
  // /entrar forever unless they cleared cookies. An explicit link wins over
  // whatever session the browser already holds, unless it is the same one.
  const store = await cookies();
  const existing = verifyToken<{ r?: string; c?: string }>(store.get(SESSION_COOKIE)?.value);
  if (existing && existing.r === "l" && existing.c && normalizeCode(existing.c) === normalizeCode(code)) {
    return NextResponse.redirect(new URL("/", origin));
  }
  if (existing && existing.r === "a") {
    // An admin following a family link keeps the stronger session.
    return NextResponse.redirect(new URL("/", origin));
  }

  if (link.pinHash) {
    const check = await validateLinkAccess(code, new URL(request.url).searchParams.get("pin"));
    if (!check.ok) {
      return NextResponse.redirect(new URL(`/entrar?codigo=${encodeURIComponent(code)}`, origin));
    }
  }

  const response = NextResponse.redirect(new URL("/", origin));
  attachLinkSession(response, code, request);
  return response;
}
