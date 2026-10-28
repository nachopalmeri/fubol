import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getShareLink, linkIsActive } from "@/lib/links";
import { attachLinkSession, SESSION_COOKIE, validateLinkAccess } from "@/lib/auth";
import { verifyToken } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;
  const link = getShareLink(code);
  if (!link || !linkIsActive(link)) {
    return NextResponse.redirect(new URL("/entrar?motivo=invalido", request.url));
  }

  const store = await cookies();
  const existing = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (existing) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (link.pinHash) {
    const check = validateLinkAccess(code, new URL(request.url).searchParams.get("pin"));
    if (!check.ok) {
      return NextResponse.redirect(new URL(`/entrar?codigo=${encodeURIComponent(code)}`, request.url));
    }
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  attachLinkSession(response, code, request);
  return response;
}
