#!/usr/bin/env node
/**
 * 060 remote: semester_historical_snapshots + edu_daily_recitation.complex_id
 *
 * Usage (from apps/api): npm run db:remote:060
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
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

function tableExists(table) {
  return queryJson(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1`,
  ).length > 0;
}

function columnExists(table, column) {
  return queryJson(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

if (!tableExists("semester_historical_snapshots")) {
  console.log("\n>>> 060 semester_historical_snapshots");
  execSync(
    `npx wrangler d1 execute basateen ${remote} --file="${path.join(schemaDir, "060_semester_historical_snapshots.sql")}"`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
} else {
  console.log("\n>>> skip 060 table (semester_historical_snapshots already present)");
  if (
    tableExists("edu_daily_recitation") &&
    !columnExists("edu_daily_recitation", "complex_id")
  ) {
    console.log("\n>>> 060 edu_daily_recitation.complex_id column only");
    execSync(
      `npx wrangler d1 execute basateen ${remote} --command "ALTER TABLE edu_daily_recitation ADD COLUMN complex_id INTEGER REFERENCES complexes(id);"`,
      { cwd: apiRoot, stdio: "inherit", env: process.env },
    );
    execSync(
      `npx wrangler d1 execute basateen ${remote} --command "UPDATE edu_daily_recitation SET complex_id = (SELECT s.complex_id FROM students s WHERE s.id = edu_daily_recitation.student_id) WHERE complex_id IS NULL;"`,
      { cwd: apiRoot, stdio: "inherit", env: process.env },
    );
  }
}

console.log("\nDone: 060 migration.");
