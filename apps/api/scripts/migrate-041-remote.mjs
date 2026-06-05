#!/usr/bin/env node
/**
 * 041 remote: purge circles_legacy_035 phantoms.
 * 1) Static SQL (known trigger names + DROP legacy tables)
 * 2) Dynamic DROP of every trigger in sqlite_master whose SQL references circles_legacy
 *
 * Usage (from apps/api): npm run db:remote:041
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote";

function run(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
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

function dropTrigger(name) {
  const escaped = name.replace(/"/g, '""');
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command "DROP TRIGGER IF EXISTS \\"${escaped}\\""`,
    { cwd: apiRoot, stdio: "pipe" },
  );
}

run(
  `--file="${path.join(schemaDir, "041_purge_circles_legacy_phantoms.sql")}"`,
  "041 static purge (known triggers + legacy tables)",
);

const triggers = queryJson(
  "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'",
);
let dropped = 0;
for (const row of triggers) {
  const sql = (row.sql ?? "").toLowerCase();
  const tbl = (row.tbl_name ?? "").toLowerCase();
  const hit =
    sql.includes("circles_legacy") ||
    sql.includes("circles_legacy_035") ||
    ["students", "student_circle_history", "circles"].includes(tbl);
  if (hit && row.name) {
    console.log(`\n>>> DROP TRIGGER ${row.name} (tbl=${row.tbl_name})`);
    try {
      dropTrigger(row.name);
      dropped += 1;
    } catch (err) {
      console.warn(`warn: could not drop ${row.name}:`, err.message ?? err);
    }
  }
}
console.log(`\n>>> dynamic trigger purge: dropped ${dropped} trigger(s)`);
console.log("\nDone: 041 migration.");
