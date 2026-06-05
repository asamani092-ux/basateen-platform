#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const flag = "--local";

function run(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${flag} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
}

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${flag} --command "${sql}" --json`,
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
  }
}

if (tableExists("students") && columnExists("students", "current_circle_id")) {
  run(
    `--file="${path.join(schemaDir, "040_rebind_students_v25.sql")}"`,
    "040 rebind students",
  );
}

console.log("\nDone: 040 migration (local).");
