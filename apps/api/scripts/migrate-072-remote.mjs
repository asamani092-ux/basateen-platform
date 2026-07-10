#!/usr/bin/env node
/**
 * 072 remote: display slide types + per-slide duration + indicators toggle
 *
 * Usage (from apps/api): node scripts/migrate-072-remote.mjs
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

console.log("\n>>> 072 display slide types (guarded)");

if (!columnExists("display_media", "slide_type")) {
  console.log("add column display_media.slide_type");
  runCommand(
    "ALTER TABLE display_media ADD COLUMN slide_type TEXT NOT NULL DEFAULT 'media'",
  );
} else {
  console.log("skip column display_media.slide_type (exists)");
}

if (!columnExists("display_media", "competition_id")) {
  console.log("add column display_media.competition_id");
  runCommand("ALTER TABLE display_media ADD COLUMN competition_id INTEGER");
} else {
  console.log("skip column display_media.competition_id (exists)");
}

if (!columnExists("display_media", "duration_seconds")) {
  console.log("add column display_media.duration_seconds");
  runCommand(
    "ALTER TABLE display_media ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 12",
  );
} else {
  console.log("skip column display_media.duration_seconds (exists)");
}

if (!columnExists("complex_settings", "display_indicators_enabled")) {
  console.log("add column complex_settings.display_indicators_enabled");
  runCommand(
    "ALTER TABLE complex_settings ADD COLUMN display_indicators_enabled INTEGER NOT NULL DEFAULT 1",
  );
} else {
  console.log("skip column complex_settings.display_indicators_enabled (exists)");
}

if (!indexExists("idx_display_media_slide_type")) {
  console.log("create index idx_display_media_slide_type");
  runCommand(
    "CREATE INDEX IF NOT EXISTS idx_display_media_slide_type ON display_media(complex_id, slide_type, is_active, display_order)",
  );
} else {
  console.log("skip index idx_display_media_slide_type (exists)");
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('072_display_slide_types.sql')",
);

console.log("\nDone: 072 migration.");
