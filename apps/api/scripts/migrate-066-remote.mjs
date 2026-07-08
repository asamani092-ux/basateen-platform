#!/usr/bin/env node
/**
 * 066 remote: student_semester_plans lifecycle columns (starts_at, ends_at, is_active, created_by_user_id)
 *
 * Usage (from apps/api): node scripts/migrate-066-remote.mjs
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const remote = "--remote --yes";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql}" --json`,
    { cwd: apiRoot, encoding: "utf8", env: process.env },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

function runAlter(sql) {
  execSync(`npx wrangler d1 execute basateen ${remote} --command "${sql}"`, {
    cwd: apiRoot,
    stdio: "inherit",
    env: process.env,
  });
}

const table = "student_semester_plans";
const columns = [
  { name: "starts_at", ddl: "ALTER TABLE student_semester_plans ADD COLUMN starts_at TEXT" },
  { name: "ends_at", ddl: "ALTER TABLE student_semester_plans ADD COLUMN ends_at TEXT" },
  {
    name: "is_active",
    ddl: "ALTER TABLE student_semester_plans ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
  },
  {
    name: "created_by_user_id",
    ddl: "ALTER TABLE student_semester_plans ADD COLUMN created_by_user_id INTEGER",
  },
];

console.log("\n>>> 066 semester_plans_columns (guarded)");
for (const col of columns) {
  if (columnExists(table, col.name)) {
    console.log(`skip column ${col.name} (exists)`);
  } else {
    console.log(`add column ${col.name}`);
    runAlter(col.ddl);
  }
}

if (columnExists(table, "starts_at")) {
  runAlter(
    "UPDATE student_semester_plans SET starts_at = date('now') WHERE starts_at IS NULL",
  );
}
if (columnExists(table, "is_active")) {
  runAlter("UPDATE student_semester_plans SET is_active = 1 WHERE is_active IS NULL");
}

runAlter(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_student_semester_plan_active ON student_semester_plans(student_id) WHERE is_active = 1",
);

execSync(
  `npx wrangler d1 execute basateen ${remote} --command "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('066_semester_plans_columns.sql');"`,
  { cwd: apiRoot, stdio: "inherit", env: process.env },
);

console.log("\nDone: 066 migration.");
