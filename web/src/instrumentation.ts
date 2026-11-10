/**
 * Runs once when the server starts. It materializes the data directory and the
 * secrets that must exist before the first request (session HMAC and admin
 * password). Generated secrets are written with restrictive permissions and
 * are never logged.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ ensureDataDir, getAdminPassword, getSecret, dataDir, serverless }, { logger }] =
    await Promise.all([import("./lib/env"), import("./lib/logger")]);

  ensureDataDir();
  if (serverless && !process.env.FUBOL_SECRET) {
    // Sessions are signed per instance: without a fixed secret every cold
    // start logs the family out.
    logger.warn("fubol_secret_missing", { hint: "set FUBOL_SECRET" });
  } else {
    getSecret();
  }
  if (serverless && !process.env.FUBOL_ADMIN_PASSWORD) {
    logger.warn("fubol_admin_password_missing", { hint: "set FUBOL_ADMIN_PASSWORD" });
  } else {
    getAdminPassword();
  }
  logger.info("fubol_boot", { dataDir, serverless });

  // Warm the catalog behind the boot so the first visitor does not pay for it.
  // Building the home rows validates availability across every VOD provider
  // and takes about six seconds on an empty cache; afterwards it is served
  // from SQLite in tens of milliseconds. Failures here are not fatal: the page
  // computes the same data on demand.
  void (async () => {
    try {
      const { getHomeRows } = await import("./lib/vod/service");
      const started = Date.now();
      const rows = await getHomeRows(12);
      logger.info("catalog_warm", { rows: rows.length, ms: Date.now() - started });
    } catch (error) {
      logger.warn("catalog_warm_failed", { error });
    }
  })();
}
