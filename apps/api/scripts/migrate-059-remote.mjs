#!/usr/bin/env node
/**
 * 059 remote: complex_settings.whatsapp_absence_template_ar
 *
 * Usage (from apps/api): npm run db:remote:059
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql}" --json`,
    { cwd: apiRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

if (!columnExists("complex_settings", "whatsapp_absence_template_ar")) {
  console.log("\n>>> 059 whatsapp_absence_template_ar");
  execSync(
    `npx wrangler d1 execute basateen ${remote} --file="${path.join(schemaDir, "059_whatsapp_absence_template.sql")}"`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
} else {
  console.log("\n>>> skip 059 (whatsapp_absence_template_ar already present)");
}

console.log("\nDone: 059 migration.");
