import type { NextConfig } from "next";

// Vercel builds its own function bundle, so `standalone` there only produced a
// duplicate artifact (and a `postbuild` step pointing at a directory that never
// existed). The container build still needs it.
const standalone = !process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // Keep runtime state out of server traces. Turbopack's instrumentation entry
  // ignores this filter, so `postbuild` also removes .next/standalone/data.
  outputFileTracingExcludes: {
    "*": ["./data/**/*"],
  },
  async headers() {
    // Channel logos and poster art come from whatever host the configured
    // source points at, so img-src stays open; everything that can execute is
    // restricted to this origin. `unsafe-inline` for styles is required by
    // Next's inlined critical CSS and by the inline style attributes the
    // player uses for progress; `blob:` covers the generated WebVTT tracks and
    // the hls.js worker.
    //
    // `unsafe-eval` only in development: React rebuilds callstacks with eval()
    // in dev mode, and without it hydration silently never happens — the page
    // looks right and no button works. Production keeps script-src strict.
    const scriptSrc =
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"
        : "script-src 'self' 'unsafe-inline' blob:";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      scriptSrc,
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' blob: data:",
      "connect-src 'self' blob: data:",
      "font-src 'self' data:",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
