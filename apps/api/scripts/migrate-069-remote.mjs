#!/usr/bin/env node
/**
 * 069 remote: student_plan_days + rest_days on student_semester_plans
 *
 * أوامر SQL سطر واحد — wrangler --command يفشل مع \\n حرفي.
 *
 * Usage (from apps/api): node scripts/migrate-069-remote.mjs
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const remote = "--remote --yes";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)} --json`,
    { cwd: apiRoot, encoding: "utf8", env: process.env },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

function tableExists(name) {
  return (
    queryJson(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
    ).length > 0
  );
}

function indexExists(name) {
  return (
    queryJson(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${name}'`,
    ).length > 0
  );
}

function runCommand(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(oneLine)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

console.log("\n>>> 069 plan_daily_followup (guarded)");

if (tableExists("student_semester_plans") && !columnExists("student_semester_plans", "rest_days")) {
  console.log("add column rest_days");
  runCommand(
    "ALTER TABLE student_semester_plans ADD COLUMN rest_days TEXT NOT NULL DEFAULT 'friday_saturday' CHECK (rest_days IN ('friday', 'saturday', 'friday_saturday'))",
  );
} else {
  console.log("skip column rest_days (exists or table missing)");
}

if (!tableExists("student_plan_days")) {
  console.log("create table student_plan_days");
  runCommand(
    "CREATE TABLE student_plan_days (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, day_date TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, recorded_by_user_id INTEGER, updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (plan_id) REFERENCES student_semester_plans(id) ON DELETE CASCADE, UNIQUE(plan_id, day_date))",
  );
} else {
  console.log("skip table student_plan_days (exists)");
}

if (!indexExists("idx_student_plan_days_plan")) {
  console.log("create index idx_student_plan_days_plan");
  runCommand(
    "CREATE INDEX IF NOT EXISTS idx_student_plan_days_plan ON student_plan_days(plan_id)",
  );
} else {
  console.log("skip index idx_student_plan_days_plan (exists)");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('069_plan_daily_followup.sql')",
);

console.log("\nDone: 069 migration.");
