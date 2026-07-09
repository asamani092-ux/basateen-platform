#!/usr/bin/env node
/**
 * 062 remote: stage_id backfill artifacts (guarded re-apply)
 *
 * Usage (from apps/api): node scripts/migrate-062-remote.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaRoot = path.resolve(apiRoot, "../../packages/database/schema");
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

function runCommand(sql) {
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

function runFile(sqlText) {
  const tmp = path.join(os.tmpdir(), `migrate-062-${Date.now()}.sql`);
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

console.log("\n>>> 062 stage_id_backfill (guarded)");

const fullSql = fs.readFileSync(
  path.join(schemaRoot, "062_stage_id_backfill.sql"),
  "utf8",
);

if (!tableExists("stage_id_review_queue")) {
  console.log("apply 062 SQL (review queue + index missing)");
  runFile(fullSql);
} else if (!indexExists("idx_students_stage_complex")) {
  console.log("apply 062 SQL (index missing)");
  runFile(fullSql);
} else {
  console.log("skip 062 body — artifacts present");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('062_stage_id_backfill.sql')",
);

console.log("\nDone: 062 migration.");
