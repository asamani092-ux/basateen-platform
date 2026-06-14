#!/usr/bin/env node
/**
 * 058 remote: circles/tracks assignee FK ON DELETE SET NULL (staff soft-delete safe).
 *
 * Usage (from apps/api):
 *   npm run db:remote:058
 */
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

function run(args, label, { allowFail = false } = {}) {
  console.log(`\n>>> ${label}`);
  try {
    execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env,
    });
    return true;
  } catch {
    if (allowFail) {
      console.log(`>>> skipped: ${label}`);
      return false;
    }
    throw new Error(`failed: ${label}`);
  }
}

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql}" --json`,
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

function rebuildAssigneeFkTable(table, assigneeColumn) {
  const cols = queryJson(`PRAGMA table_info(${table})`);
  const colNames = cols.map((r) => r.name);

  function colDef(name, notnull, dflt) {
    if (name === "id") return "id INTEGER PRIMARY KEY AUTOINCREMENT";
    if (name === assigneeColumn) {
      return `${assigneeColumn} INTEGER REFERENCES users(id) ON DELETE SET NULL`;
    }
    if (name === "complex_id") {
      return "complex_id INTEGER NOT NULL DEFAULT 1 REFERENCES complexes(id)";
    }
    const row = cols.find((c) => c.name === name);
    const type = row?.type ?? "TEXT";
    const nn = notnull ? " NOT NULL" : "";
    let df = "";
    if (dflt != null && dflt !== "") {
      df =
        typeof dflt === "string" && !dflt.startsWith("'")
          ? ` DEFAULT '${dflt.replace(/'/g, "''")}'`
          : ` DEFAULT ${dflt}`;
    }
    return `${name} ${type}${nn}${df}`;
  }

  const colDefs = cols
    .map((r) => colDef(r.name, r.notnull, r.dflt_value))
    .join(",\n  ");
  const colList = colNames.join(", ");
  const fixName = `${table}_fix_058`;

  return `PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS ${fixName};
CREATE TABLE ${fixName} (
  ${colDefs}
);
INSERT INTO ${fixName} (${colList})
SELECT ${colList} FROM ${table};
DROP TABLE ${table};
ALTER TABLE ${fixName} RENAME TO ${table};
PRAGMA foreign_keys = ON;
`;
}

if (tableExists("circles") && columnExists("circles", "teacher_id")) {
  const sql = rebuildAssigneeFkTable("circles", "teacher_id");
  const tmp = path.join(apiRoot, ".tmp-058-circles.sql");
  writeFileSync(tmp, sql);
  try {
    run(`--file="${tmp}"`, "058 circles teacher_id ON DELETE SET NULL");
  } finally {
    unlinkSync(tmp);
  }
} else {
  console.log("\n>>> skip circles teacher_id rebind");
}

if (tableExists("tracks") && columnExists("tracks", "supervisor_id")) {
  const sql = rebuildAssigneeFkTable("tracks", "supervisor_id");
  const tmp = path.join(apiRoot, ".tmp-058-tracks.sql");
  writeFileSync(tmp, sql);
  try {
    run(`--file="${tmp}"`, "058 tracks supervisor_id ON DELETE SET NULL");
  } finally {
    unlinkSync(tmp);
  }
} else {
  console.log("\n>>> skip tracks supervisor_id rebind");
}

console.log("\nDone: 058 migration.");
