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

function tableExists(table) {
  try {
    const out = execSync(
      `npx wrangler d1 execute basateen ${flag} --command "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1" --json`,
      { cwd: apiRoot, encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    const block = Array.isArray(parsed) ? parsed[0] : parsed;
    return (block?.results ?? []).length > 0;
  } catch {
    return false;
  }
}

run(
  `--file="${path.join(schemaDir, "039_core_tracks_triggers.sql")}"`,
  "039 core (triggers + tracks)",
);

const optional = [
  ["teacher_assignments", "039_rebind_teacher_assignments.sql"],
  ["track_circles", "039_rebind_track_circles.sql"],
  ["supervisor_scopes", "039_rebind_supervisor_scopes.sql"],
];

for (const [table, file] of optional) {
  if (tableExists(table)) {
    run(`--file="${path.join(schemaDir, file)}"`, `039 rebind ${table}`);
  } else {
    console.log(`\n>>> skip ${table} (table not present on local D1)`);
  }
}

console.log("\nDone: 039 migration (local).");
