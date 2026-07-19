#!/usr/bin/env node
/**
 * 071 remote: users.deleted_at — تمييز الحذف عن التعليق
 *
 * Usage (from apps/api): node scripts/migrate-071-remote.mjs
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

console.log("\n>>> 071 users.deleted_at (guarded)");

if (!columnExists("users", "deleted_at")) {
  console.log("add column users.deleted_at");
  runCommand("ALTER TABLE users ADD COLUMN deleted_at TEXT");
} else {
  console.log("skip column users.deleted_at (exists)");
}

if (!indexExists("idx_users_staff_deleted_at")) {
  console.log("create index idx_users_staff_deleted_at");
  runCommand(
    "CREATE INDEX IF NOT EXISTS idx_users_staff_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL",
  );
} else {
  console.log("skip index idx_users_staff_deleted_at (exists)");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('071_users_staff_deleted_at.sql')",
);

console.log("\nDone: 071 migration.");
