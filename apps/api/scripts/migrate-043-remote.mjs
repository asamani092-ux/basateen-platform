#!/usr/bin/env node
/**
 * 043 remote: add track_id to student_attendance for dual circle/track attendance.
 * Usage (from apps/api): npm run db:remote:043
 */
import { execSync } from "node:child_process";
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

if (!tableExists("student_attendance")) {
  console.log("\n>>> skip student_attendance (table missing)");
  process.exit(0);
}

if (columnExists("student_attendance", "track_id")) {
  console.log("\n>>> track_id already present on student_attendance — skip");
  process.exit(0);
}

run(
  `--file="${path.join(schemaDir, "043_student_attendance_track_id.sql")}"`,
  "043 add student_attendance.track_id",
);

console.log("\n>>> 043 complete");
