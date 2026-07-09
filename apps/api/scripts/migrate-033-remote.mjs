#!/usr/bin/env node
/**
 * 033 remote: edu_settings central event weight columns (guarded re-apply)
 *
 * Usage (from apps/api): node scripts/migrate-033-remote.mjs
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

function runCommand(sql) {
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

const columns = [
  { name: "himma_defaults_json", ddl: "ALTER TABLE edu_settings ADD COLUMN himma_defaults_json TEXT" },
  {
    name: "competition_defaults_json",
    ddl: "ALTER TABLE edu_settings ADD COLUMN competition_defaults_json TEXT",
  },
];

console.log("\n>>> 033 edu_central_event_weights (guarded)");
for (const col of columns) {
  if (columnExists("edu_settings", col.name)) {
    console.log(`skip column ${col.name} (exists)`);
  } else {
    console.log(`add column ${col.name}`);
    runCommand(col.ddl);
  }
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('033_edu_central_event_weights.sql')",
);

console.log("\nDone: 033 migration.");
