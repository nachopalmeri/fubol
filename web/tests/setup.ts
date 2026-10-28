import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fubol-tests-"));
process.env.FUBOL_DATA_DIR = dir;
process.env.TZ = "America/Argentina/Buenos_Aires";
process.env.FUBOL_NO_DEFAULT_ADDONS = "1";
process.env.FUBOL_ADMIN_PASSWORD = "test-admin-password";
process.env.FUBOL_SECRET = "test-secret-key-with-at-least-32-characters!!";
