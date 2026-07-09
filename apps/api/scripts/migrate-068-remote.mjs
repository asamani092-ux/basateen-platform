#!/usr/bin/env node
/**
 * 068 remote: multiple concurrent active semester plans per student
 *
 * Usage (from apps/api): node scripts/migrate-068-remote.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

function runCommand(sql) {
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

function runFile(sqlText) {
  const tmp = path.join(os.tmpdir(), `migrate-068-${Date.now()}.sql`);
  fs.writeFileSync(tmp, sqlText, "utf8");
  try {
    execSync(`npx wrangler d1 execute basateen ${remote} --file=${tmp}`, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env,
    });
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function tableExists(name) {
  return (
    queryJson(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
    ).length > 0
  );
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

function indexExists(name) {
  return (
    queryJson(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='${name}'`,
    ).length > 0
  );
}

function studentIdIsUnique() {
  const indexes = queryJson(`PRAGMA index_list(student_semester_plans)`);
  for (const idx of indexes) {
    if (!Number(idx.unique)) continue;
    const cols = queryJson(`PRAGMA index_info('${String(idx.name)}')`);
    if (cols.length === 1 && cols[0]?.name === "student_id") return true;
  }
  return false;
}

console.log("\n>>> 068 student_semester_plans_multi (guarded)");

if (!tableExists("student_semester_plans")) {
  console.log("skip — table missing");
  process.exit(0);
}

if (indexExists("idx_student_semester_plan_active")) {
  console.log("drop unique index idx_student_semester_plan_active");
  runCommand("DROP INDEX IF EXISTS idx_student_semester_plan_active");
} else {
  console.log("skip drop idx_student_semester_plan_active (absent)");
}

if (studentIdIsUnique()) {
  console.log("rebuild table — remove UNIQUE(student_id)");
  const cols = queryJson(`PRAGMA table_info(student_semester_plans)`).map((c) =>
    String(c.name),
  );
  const copyCols = [
    "id",
    "complex_id",
    "student_id",
    "plan_kind",
    "daily_hifz_pages",
    "daily_muraja_pages",
    "daily_rabt_faces",
    "repeat_target",
    "starts_at",
    "ends_at",
    "wizard_json",
    "created_by_user_id",
    "is_active",
    "created_at",
    "updated_at",
  ].filter((c) => cols.includes(c));

  runFile(`
CREATE TABLE student_semester_plans_068 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  student_id INTEGER NOT NULL,
  plan_kind TEXT NOT NULL DEFAULT 'combined'
    CHECK (plan_kind IN ('hifz_new', 'muraja', 'tilawa', 'combined')),
  daily_hifz_pages REAL NOT NULL DEFAULT 0,
  daily_muraja_pages REAL NOT NULL DEFAULT 0,
  daily_rabt_faces INTEGER NOT NULL DEFAULT 0,
  repeat_target INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  wizard_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  duration_weeks INTEGER,
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
INSERT INTO student_semester_plans_068 (${copyCols.join(", ")})
SELECT ${copyCols.join(", ")} FROM student_semester_plans;
DROP TABLE student_semester_plans;
ALTER TABLE student_semester_plans_068 RENAME TO student_semester_plans;
`);
} else {
  console.log("skip rebuild — student_id not uniquely constrained");
}

if (!columnExists("student_semester_plans", "duration_weeks")) {
  console.log("add column duration_weeks");
  runCommand("ALTER TABLE student_semester_plans ADD COLUMN duration_weeks INTEGER");
} else {
  console.log("skip column duration_weeks (exists)");
}

runCommand(
  "CREATE INDEX IF NOT EXISTS idx_student_semester_plans_student_active ON student_semester_plans(student_id, is_active)",
);
runCommand(
  "CREATE INDEX IF NOT EXISTS idx_student_plans_student ON student_semester_plans(student_id)",
);

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('068_student_semester_plans_multi.sql')",
);

console.log("\nDone: 068 migration.");
