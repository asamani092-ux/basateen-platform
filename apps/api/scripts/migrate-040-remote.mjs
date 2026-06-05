#!/usr/bin/env node
/**
 * 040 remote: rebind circle FK tables that still point to circles_legacy_035.
 * Usage (from apps/api): npm run db:remote:040
 */
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote";

function run(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
}

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql}" --json`,
    { cwd: apiRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function tableExists(table) {
  const rows = queryJson(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1`,
  );
  return rows.length > 0;
}

function columnExists(table, column) {
  const rows = queryJson(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

function columnDef(name) {
  if (name === "id") return "id INTEGER PRIMARY KEY AUTOINCREMENT";
  if (name === "current_circle_id") {
    return "current_circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL";
  }
  if (name === "current_track_id") {
    return "current_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL";
  }
  if (name === "complex_id") {
    return "complex_id INTEGER NOT NULL DEFAULT 1 REFERENCES complexes(id)";
  }
  if (name === "student_id") {
    return "student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE";
  }
  return `${name} TEXT`;
}

if (tableExists("student_circle_history")) {
  if (columnExists("student_circle_history", "new_circle_id")) {
    run(
      `--file="${path.join(schemaDir, "040_rebind_student_circle_history_v25.sql")}"`,
      "040 rebind student_circle_history (v25)",
    );
  } else if (columnExists("student_circle_history", "circle_id")) {
    run(
      `--file="${path.join(schemaDir, "040_rebind_student_circle_history_legacy.sql")}"`,
      "040 rebind student_circle_history (legacy)",
    );
  } else {
    console.log("\n>>> skip student_circle_history (unknown schema)");
  }
} else {
  console.log("\n>>> skip student_circle_history (missing)");
}

if (tableExists("students") && columnExists("students", "current_circle_id")) {
  const cols = queryJson("PRAGMA table_info(students)").map((r) => r.name);
  const colDefs = cols.map((name) => columnDef(name)).join(",\n  ");
  const colList = cols.join(", ");
  const indexSql =
    cols.includes("account_status") &&
    cols.includes("current_circle_id") &&
    cols.includes("current_track_id")
      ? `CREATE INDEX IF NOT EXISTS idx_students_placement
  ON students(current_circle_id, current_track_id, account_status);`
      : "";
  const sql = `PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS students_fix_040;
CREATE TABLE students_fix_040 (
  ${colDefs}
);
INSERT INTO students_fix_040 (${colList}) SELECT ${colList} FROM students;
DROP TABLE IF EXISTS students;
ALTER TABLE students_fix_040 RENAME TO students;
${indexSql}
PRAGMA foreign_keys = ON;
`;
  const tmp = path.join(apiRoot, ".tmp-040-students.sql");
  writeFileSync(tmp, sql);
  try {
    run(`--file="${tmp}"`, "040 rebind students (dynamic columns)");
  } finally {
    unlinkSync(tmp);
  }
} else {
  console.log("\n>>> skip students rebind");
}

console.log("\nDone: 040 migration.");
