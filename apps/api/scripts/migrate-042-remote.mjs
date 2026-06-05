#!/usr/bin/env node
/**
 * 042 remote: rebind circle FKs — ON DELETE SET NULL / CASCADE.
 * Fixes asymmetric relations blocking DELETE FROM circles via API.
 *
 * Usage (from apps/api): npm run db:remote:042
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
  return queryJson(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1`,
  ).length > 0;
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

const staticRebinds = [
  ["track_circles", "042_rebind_track_circles.sql"],
  ["teacher_assignments", "042_rebind_teacher_assignments.sql"],
  ["supervisor_scopes", "042_rebind_supervisor_scopes.sql"],
  ["student_attendance", "042_rebind_student_attendance.sql"],
  ["task_assignments", "042_rebind_task_assignments.sql"],
];

for (const [table, file] of staticRebinds) {
  if (tableExists(table)) {
    run(`--file="${path.join(schemaDir, file)}"`, `042 rebind ${table}`);
  } else {
    console.log(`\n>>> skip ${table} (table not present on remote D1)`);
  }
}

if (tableExists("student_circle_history")) {
  if (columnExists("student_circle_history", "new_circle_id")) {
    run(
      `--file="${path.join(schemaDir, "042_rebind_student_circle_history_v25.sql")}"`,
      "042 rebind student_circle_history (v25)",
    );
  } else if (columnExists("student_circle_history", "circle_id")) {
    run(
      `--file="${path.join(schemaDir, "042_rebind_student_circle_history_legacy.sql")}"`,
      "042 rebind student_circle_history (legacy)",
    );
  } else {
    console.log("\n>>> skip student_circle_history (unknown schema)");
  }
} else {
  console.log("\n>>> skip student_circle_history (missing)");
}

if (tableExists("edu_daily_recitation") && columnExists("edu_daily_recitation", "circle_id")) {
  const cols = queryJson("PRAGMA table_info(edu_daily_recitation)");
  const colNames = cols.map((r) => r.name);

  function eduColDef(name, notnull, dflt) {
    if (name === "id") return "id INTEGER PRIMARY KEY AUTOINCREMENT";
    if (name === "circle_id") {
      return "circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL";
    }
    if (name === "student_id") return "student_id INTEGER NOT NULL";
    if (name === "teacher_user_id") return "teacher_user_id INTEGER NOT NULL";
    if (name === "recitation_date") return "recitation_date TEXT NOT NULL";
    if (name === "listened") return "listened INTEGER NOT NULL DEFAULT 0";
    if (name === "repeated") return "repeated INTEGER NOT NULL DEFAULT 0";
    if (name === "revised") return "revised INTEGER NOT NULL DEFAULT 0";
    if (name === "error_count") return "error_count INTEGER NOT NULL DEFAULT 0";
    if (name === "tune_errors") return "tune_errors INTEGER NOT NULL DEFAULT 0";
    if (name === "face_count") return "face_count INTEGER NOT NULL DEFAULT 0";
    if (name === "created_at") {
      return "created_at TEXT NOT NULL DEFAULT (datetime('now'))";
    }
    if (name === "updated_at") {
      return "updated_at TEXT NOT NULL DEFAULT (datetime('now'))";
    }
    const nn = notnull ? " NOT NULL" : "";
    const df = dflt != null && dflt !== "" ? ` DEFAULT ${dflt}` : "";
    return `${name} TEXT${nn}${df}`;
  }

  const colDefs = cols
    .map((r) => eduColDef(r.name, r.notnull, r.dflt_value))
    .join(",\n  ");
  const colList = colNames.join(", ");
  const sql = `PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS edu_daily_recitation_fix_042;
CREATE TABLE edu_daily_recitation_fix_042 (
  ${colDefs},
  UNIQUE(student_id, recitation_date)
);
INSERT INTO edu_daily_recitation_fix_042 (${colList})
SELECT ${colList} FROM edu_daily_recitation;
DROP TABLE IF EXISTS edu_daily_recitation;
ALTER TABLE edu_daily_recitation_fix_042 RENAME TO edu_daily_recitation;
CREATE INDEX IF NOT EXISTS idx_edu_daily_recitation_circle_date
  ON edu_daily_recitation(circle_id, recitation_date);
PRAGMA foreign_keys = ON;
`;
  const tmp = path.join(apiRoot, ".tmp-042-edu-daily-recitation.sql");
  writeFileSync(tmp, sql);
  try {
    run(`--file="${tmp}"`, "042 rebind edu_daily_recitation (dynamic columns)");
  } finally {
    unlinkSync(tmp);
  }
} else {
  console.log("\n>>> skip edu_daily_recitation");
}

console.log("\nDone: 042 migration.");
