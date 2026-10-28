import { NextResponse } from "next/server";
import { UpstreamError } from "./http";
import { logger } from "./logger";
import type { Session } from "./auth";
import { getSession } from "./auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(data: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...init.headers },
  });
}

export function errorResponse(error: unknown, route: string): NextResponse {
  const status =
    error instanceof ApiError || error instanceof UpstreamError ? error.status : 500;
  const message =
    status >= 500 && !(error instanceof UpstreamError)
      ? "Error interno"
      : error instanceof Error
        ? error.message
        : "Error";
  if (status >= 500) {
    logger.error("api_error", { route, status, error });
  } else {
    logger.warn("api_rejected", { route, status, message });
  }
  return json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("Se esperaba JSON", 415);
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("JSON inválido", 400);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function requireSession(permission?: "live" | "vod"): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError("No autorizado", 401);
  if (permission && session.role === "link" && !session.permissions.includes(permission)) {
    throw new ApiError("Este link no tiene permiso para esto", 403);
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new ApiError("Solo administrador", 403);
  return session;
}

/** Wraps a route handler with structured logging and uniform errors. */
export function route<T>(
  name: string,
  handler: (request: Request, context: T) => Promise<Response>,
): (request: Request, context: T) => Promise<Response> {
  return async (request: Request, context: T) => {
    const started = Date.now();
    try {
      const response = await handler(request, context);
      logger.info("request", {
        route: name,
        method: request.method,
        status: response.status,
        ms: Date.now() - started,
      });
      return response;
    } catch (error) {
      const response = errorResponse(error, name);
      logger.info("request", {
        route: name,
        method: request.method,
        status: response.status,
        ms: Date.now() - started,
      });
      return response;
    }
  };
}
