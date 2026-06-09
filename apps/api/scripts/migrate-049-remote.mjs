#!/usr/bin/env node
/**
 * 049 remote: performance indexes — schema-aware (v25 vs legacy history).
 *
 * Usage (from apps/api):
 *   export CLOUDFLARE_API_TOKEN='...'
 *   export CLOUDFLARE_ACCOUNT_ID='...'
 *   npm run db:remote:049
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (!token) {
  console.error("❌ CLOUDFLARE_API_TOKEN غير مضبوط");
  process.exit(1);
}
process.env.CLOUDFLARE_API_TOKEN = token;

if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
  console.error("❌ CLOUDFLARE_ACCOUNT_ID غير مضبوط");
  process.exit(1);
}

function run(args, label, { allowFail = false } = {}) {
  console.log(`\n>>> ${label}`);
  try {
    execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env,
    });
    return true;
  } catch {
    if (allowFail) {
      console.log(`>>> skipped: ${label}`);
      return false;
    }
    throw new Error(`failed: ${label}`);
  }
}

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql.replace(/"/g, '\\"')}" --json`,
    { cwd: apiRoot, encoding: "utf8", env: process.env },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function columnExists(table, column) {
  try {
    return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
  } catch {
    return false;
  }
}

console.log(">>> verifying token…");
execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });

run(
  `--file="${path.join(schemaDir, "049_competition_perf_indexes.sql")}"`,
  "049 base performance indexes",
  { allowFail: true },
);

if (columnExists("student_circle_history", "circle_id")) {
  run(
    `--command "CREATE INDEX IF NOT EXISTS idx_sch_active_circle ON student_circle_history(circle_id, student_id) WHERE to_at IS NULL AND frozen_at IS NULL"`,
    "legacy idx_sch_active_circle",
    { allowFail: true },
  );
}

if (columnExists("student_circle_history", "track_id")) {
  run(
    `--command "CREATE INDEX IF NOT EXISTS idx_sch_active_track ON student_circle_history(track_id, student_id) WHERE to_at IS NULL AND frozen_at IS NULL"`,
    "legacy idx_sch_active_track",
    { allowFail: true },
  );
}

console.log("\nDone: 049 migration.");
