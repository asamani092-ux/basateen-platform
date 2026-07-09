#!/usr/bin/env node
/**
 * 062 remote: stage_id backfill artifacts (guarded re-apply)
 *
 * السبب الجذري: الملف التاريخي 062 يتضمّن UPDATE يعتمد track_stages غير موجود في الإنتاج.
 * نُطبّق فقط الأثر الناقص: stage_id_review_queue + idx_students_stage_complex.
 * أوامر SQL سطر واحد — wrangler --command يفشل مع \\n حرفي.
 *
 * Usage (from apps/api): node scripts/migrate-062-remote.mjs
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

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

function runCommand(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(oneLine)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

console.log("\n>>> 062 stage_id_backfill (guarded — schema artifacts only)");

if (!tableExists("stage_id_review_queue")) {
  console.log("create table stage_id_review_queue");
  runCommand(
    "CREATE TABLE IF NOT EXISTS stage_id_review_queue (entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'circle', 'track')), entity_id INTEGER NOT NULL, reason TEXT NOT NULL, flagged_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (entity_type, entity_id))",
  );
} else {
  console.log("skip table stage_id_review_queue (exists)");
}

if (tableExists("students") && columnExists("students", "stage_id")) {
  console.log("seed review queue — students missing stage_id");
  runCommand(
    "INSERT OR IGNORE INTO stage_id_review_queue (entity_type, entity_id, reason) SELECT 'student', id, 'missing stage_id after backfill' FROM students WHERE stage_id IS NULL",
  );
} else {
  console.log("skip student review queue seed (table/column missing)");
}

if (tableExists("circles") && columnExists("circles", "stage_id")) {
  console.log("seed review queue — circles missing stage_id");
  runCommand(
    "INSERT OR IGNORE INTO stage_id_review_queue (entity_type, entity_id, reason) SELECT 'circle', id, 'missing stage_id after backfill' FROM circles WHERE stage_id IS NULL",
  );
} else {
  console.log("skip circle review queue seed (table/column missing)");
}

if (!indexExists("idx_students_stage_complex")) {
  console.log("create index idx_students_stage_complex");
  runCommand(
    "CREATE INDEX IF NOT EXISTS idx_students_stage_complex ON students(stage_id, complex_id) WHERE stage_id IS NOT NULL",
  );
} else {
  console.log("skip index idx_students_stage_complex (exists)");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('062_stage_id_backfill.sql')",
);

console.log("\nDone: 062 migration.");
