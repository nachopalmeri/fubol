import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShareLink, linkIsActive } from "@/lib/links";
import { attachLinkSession, baseUrl, SESSION_COOKIE, validateLinkAccess } from "@/lib/auth";
import { verifyToken } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;
  // Redirect against the host the visitor used, not the container bind address.
  const origin = baseUrl(request);
  const link = getShareLink(code);
  if (!link || !linkIsActive(link)) {
    return NextResponse.redirect(new URL("/entrar?motivo=invalido", origin));
  }

  const store = await cookies();
  const existing = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (existing) {
    return NextResponse.redirect(new URL("/", origin));
  }

  if (link.pinHash) {
    const check = validateLinkAccess(code, new URL(request.url).searchParams.get("pin"));
    if (!check.ok) {
      return NextResponse.redirect(new URL(`/entrar?codigo=${encodeURIComponent(code)}`, origin));
    }
  }

  const response = NextResponse.redirect(new URL("/", origin));
  attachLinkSession(response, code, request);
  return response;
}
