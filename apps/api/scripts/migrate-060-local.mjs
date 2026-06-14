#!/usr/bin/env node
/**
 * 060 local: semester_historical_snapshots + edu_daily_recitation.complex_id
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const target = "--local";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${target} --command "${sql}" --json`,
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

if (!tableExists("semester_historical_snapshots")) {
  console.log("\n>>> 060 semester_historical_snapshots table");
  execSync(
    `npx wrangler d1 execute basateen ${target} --file="${path.join(schemaDir, "060_semester_historical_snapshots.sql")}"`,
    { cwd: apiRoot, stdio: "inherit" },
  );
} else {
  console.log("\n>>> skip 060 table (semester_historical_snapshots already present)");
  if (
    tableExists("edu_daily_recitation") &&
    !columnExists("edu_daily_recitation", "complex_id")
  ) {
    console.log("\n>>> 060 edu_daily_recitation.complex_id column only");
    execSync(
      `npx wrangler d1 execute basateen ${target} --command "ALTER TABLE edu_daily_recitation ADD COLUMN complex_id INTEGER REFERENCES complexes(id);"`,
      { cwd: apiRoot, stdio: "inherit" },
    );
    execSync(
      `npx wrangler d1 execute basateen ${target} --command "UPDATE edu_daily_recitation SET complex_id = (SELECT s.complex_id FROM students s WHERE s.id = edu_daily_recitation.student_id) WHERE complex_id IS NULL;"`,
      { cwd: apiRoot, stdio: "inherit" },
    );
  }
}

console.log("\nDone: 060 local migration.");
