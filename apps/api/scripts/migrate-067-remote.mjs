#!/usr/bin/env node
/**
 * 067 remote: teacher circle competition_tasks — type + input_type
 *
 * Usage (from apps/api): node scripts/migrate-067-remote.mjs
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

function tableExists(name) {
  const rows = queryJson(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
  );
  return rows.length > 0;
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

function resolveTeacherTasksTable() {
  if (tableExists("teacher_competition_tasks")) {
    return "teacher_competition_tasks";
  }
  if (tableExists("competition_tasks") && columnExists("competition_tasks", "title_ar")) {
    return "competition_tasks";
  }
  return null;
}

const table = resolveTeacherTasksTable();
if (!table) {
  console.log("skip 067 — no teacher competition_tasks table");
  process.exit(0);
}

const columns = [
  {
    name: "type",
    ddl: `ALTER TABLE ${table} ADD COLUMN type TEXT NOT NULL DEFAULT 'addition' CHECK (type IN ('addition', 'deduction'))`,
  },
  {
    name: "input_type",
    ddl: `ALTER TABLE ${table} ADD COLUMN input_type TEXT NOT NULL DEFAULT 'boolean' CHECK (input_type IN ('boolean', 'numeric', 'counter'))`,
  },
];

console.log(`\n>>> 067 teacher_competition_task_types on ${table} (guarded)`);
for (const col of columns) {
  if (columnExists(table, col.name)) {
    console.log(`skip column ${col.name} (exists)`);
  } else {
    console.log(`add column ${col.name}`);
    runAlter(col.ddl);
  }
}

if (columnExists(table, "type") && columnExists(table, "input_type")) {
  runAlter(
    `UPDATE ${table} SET input_type = 'boolean' WHERE type = 'addition' AND input_type IS NULL`,
  );
  runAlter(
    `UPDATE ${table} SET input_type = 'counter' WHERE type = 'deduction'`,
  );
}

execSync(
  `npx wrangler d1 execute basateen ${remote} --command "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('067_teacher_competition_task_types.sql');"`,
  { cwd: apiRoot, stdio: "inherit", env: process.env },
);

console.log("\nDone: 067 migration.");
