#!/usr/bin/env node
/**
 * 048 remote: platform competition engine.
 * Renames legacy teacher sandbox competition_tasks → teacher_competition_tasks,
 * then applies 048_competition_engine.sql (platform tables).
 *
 * Usage (from apps/api): npm run db:remote:048
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote";

if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
  console.error(`
❌ CLOUDFLARE_API_TOKEN غير مضبوط — لا يمكن تنفيذ ترحيل D1 البعيد.

من جهازك أو Codespace (بعد إضافة السر في GitHub):
  export CLOUDFLARE_API_TOKEN="your-token"
  cd apps/api && npm run db:remote:048

للتطوير المحلي فقط (بدون إعادة تسمية مهام المعلم):
  cd apps/api && npm run db:local:048

Token: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
`);
  process.exit(1);
}

function run(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
}

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command "${sql.replace(/"/g, '\\"')}" --json`,
    { cwd: apiRoot, encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function tableColumns(table) {
  try {
    return queryJson(`PRAGMA table_info(${table})`).map((r) => r.name);
  } catch {
    return [];
  }
}

function tableExists(table) {
  const rows = queryJson(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
  );
  return rows.length > 0;
}

const compTasksCols = tableColumns("competition_tasks");
const teacherTasksExists = tableExists("teacher_competition_tasks");

if (compTasksCols.includes("title_ar") && !compTasksCols.includes("type")) {
  if (!teacherTasksExists) {
    run(
      `--command "ALTER TABLE competition_tasks RENAME TO teacher_competition_tasks"`,
      "rename legacy teacher competition_tasks → teacher_competition_tasks",
    );
  } else {
    console.log(
      "\n>>> skip rename: teacher_competition_tasks already exists (legacy competition_tasks kept as-is if present)",
    );
  }
}

run(
  `--file="${path.join(schemaDir, "048_competition_engine.sql")}"`,
  "048 competition engine schema",
);

console.log("\nDone: 048 migration.");
