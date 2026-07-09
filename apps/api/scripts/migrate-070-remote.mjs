#!/usr/bin/env node
/**
 * 070 remote: competition_source discriminator on competitions
 *
 * أوامر SQL سطر واحد — wrangler --command يفشل مع \\n حرفي.
 *
 * Usage (from apps/api): node scripts/migrate-070-remote.mjs
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

console.log("\n>>> 070 competition_source (guarded)");

if (!columnExists("competitions", "competition_source")) {
  console.log("add column competition_source");
  runCommand(
    "ALTER TABLE competitions ADD COLUMN competition_source TEXT NOT NULL DEFAULT 'edu_dept' CHECK (competition_source IN ('edu_dept', 'teacher_circle'))",
  );
  console.log("backfill teacher_circle from rules_json");
  runCommand(
    "UPDATE competitions SET competition_source = 'teacher_circle' WHERE json_extract(rules_json, '$.ownership') = 'teacher_circle'",
  );
} else {
  console.log("skip column competition_source (exists)");
}

if (!indexExists("idx_competitions_complex_source")) {
  console.log("create index idx_competitions_complex_source");
  runCommand(
    "CREATE INDEX IF NOT EXISTS idx_competitions_complex_source ON competitions(complex_id, competition_source)",
  );
} else {
  console.log("skip index idx_competitions_complex_source (exists)");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('070_competition_source.sql')",
);

console.log("\nDone: 070 migration.");
