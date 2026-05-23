/**
 * حذف حالة D1 المحلية لإعادة migrate من الصفر
 * O(1) — مجلد واحد تحت .wrangler
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  path.join(root, "apps", "api", ".wrangler", "state"),
  path.join(root, "apps", "api", ".wrangler"),
];

for (const dir of candidates) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Removed: ${dir}`);
  }
}

console.log("Local D1 state cleared. Run: npm run db:local:all");
