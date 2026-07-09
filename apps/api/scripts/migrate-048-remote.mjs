#!/usr/bin/env node
/**
 * 048 remote: platform competition engine.
 * Preflight: rename legacy teacher competition_tasks, archive old competition_targets,
 * add competitions.created_by_user_id — then apply 048_competition_engine.sql.
 *
 * Usage (from apps/api):
 *   export CLOUDFLARE_API_TOKEN='...'
 *   export CLOUDFLARE_ACCOUNT_ID='...'
 *   npm run db:remote:048
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

function wrangler(args, label, { allowFail = false } = {}) {
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

function runSqlCommand(sql, label) {
  const escaped = sql.replace(/"/g, '\\"');
  return wrangler(`--command "${escaped}"`, label, { allowFail: true });
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

function tableExists(table) {
  try {
    return queryJson(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
    ).length > 0;
  } catch {
    return false;
  }
}

function columnExists(table, column) {
  try {
    return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
  } catch {
    return false;
  }
}

console.log(">>> verifying token + account…");
execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });

// Legacy teacher sandbox tasks (027): title_ar + no type → rename before platform 048 table.
if (
  tableExists("competition_tasks") &&
  columnExists("competition_tasks", "title_ar") &&
  !columnExists("competition_tasks", "type") &&
  !tableExists("teacher_competition_tasks")
) {
  runSqlCommand(
    "ALTER TABLE competition_tasks RENAME TO teacher_competition_tasks",
    "rename legacy competition_tasks → teacher_competition_tasks",
  );
}

// v16 competition_targets (016) blocks CREATE IF NOT EXISTS in 048.
if (
  tableExists("competition_targets") &&
  !columnExists("competition_targets", "current_memorization") &&
  !tableExists("competition_targets_legacy_v16")
) {
  runSqlCommand(
    "ALTER TABLE competition_targets RENAME TO competition_targets_legacy_v16",
    "archive legacy competition_targets → competition_targets_legacy_v16",
  );
}

if (tableExists("competitions") && !columnExists("competitions", "created_by_user_id")) {
  runSqlCommand(
    "ALTER TABLE competitions ADD COLUMN created_by_user_id INTEGER",
    "add competitions.created_by_user_id for teacher ownership",
  );
  runSqlCommand(
    "CREATE INDEX IF NOT EXISTS idx_competitions_created_by ON competitions(created_by_user_id)",
    "index competitions.created_by_user_id",
  );
}

const sqlPath = path.join(schemaDir, "048_competition_engine.sql");
const statements = readFileSync(sqlPath, "utf8")
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);

console.log(`\n>>> applying 048 (${statements.length} statements)…`);
for (const stmt of statements) {
  const preview = stmt.split("\n")[0].slice(0, 72);
  runSqlCommand(stmt, preview);
}

console.log("\nDone: 048 migration.");
