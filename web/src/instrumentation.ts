/**
 * Runs once when the server starts. It materializes the data directory and the
 * secrets that must exist before the first request (session HMAC and admin
 * password). Generated secrets are written with restrictive permissions and
 * are never logged.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ ensureDataDir, getAdminPassword, getSecret, dataDir }, { logger }] =
    await Promise.all([import("./lib/env"), import("./lib/logger")]);

  ensureDataDir();
  getSecret();
  getAdminPassword();
  logger.info("fubol_boot", { dataDir });
}
