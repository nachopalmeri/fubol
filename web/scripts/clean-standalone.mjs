/**
 * Turbopack traces the `fs` reads in instrumentation and copies the runtime
 * `./data` directory (SQLite + secrets) into `.next/standalone` at build time.
 * `outputFileTracingExcludes` does not filter the instrumentation entry, so the
 * build removes that copy explicitly. The app creates the data dir on boot.
 */
import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), ".next", "standalone", "data");
fs.rmSync(target, { recursive: true, force: true });
