#!/usr/bin/env node
/**
 * 048 remote: platform competition engine.
 * Renames legacy teacher sandbox competition_tasks → teacher_competition_tasks,
 * then applies 048_competition_engine.sql (platform tables).
 *
 * Usage (from apps/api):
 *   export CLOUDFLARE_API_TOKEN='...'
 *   export CLOUDFLARE_ACCOUNT_ID='01f5b1526aa792441a4b9ca33a156327'
 *   npm run db:remote:048
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (!token) {
  console.error(`
❌ CLOUDFLARE_API_TOKEN غير مضبوط.

  export CLOUDFLARE_API_TOKEN='your-token'
  export CLOUDFLARE_ACCOUNT_ID='your-account-id'
  cd apps/api && npm run db:remote:048
`);
  process.exit(1);
}
process.env.CLOUDFLARE_API_TOKEN = token;

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!accountId) {
  console.error(`
❌ CLOUDFLARE_ACCOUNT_ID غير مضبوط — wrangler d1 --remote يفشل غالباً بخطأ 9106 بدونه.

  export CLOUDFLARE_ACCOUNT_ID='01f5b1526aa792441a4b9ca33a156327'
  cd apps/api && npm run db:remote:048

Account ID يظهر في: npx wrangler whoami (عمود Account ID)
`);
  process.exit(1);
}

function wrangler(args, label, { allowFail = false } = {}) {
  console.log(`\n>>> ${label}`);
  try {
    execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
      cwd: apiRoot,
      stdio: "inherit",
      env: process.env,
    });
    return true;
  } catch (err) {
    if (allowFail) {
      console.log(`>>> skipped (already applied or not applicable): ${label}`);
      return false;
    }
    throw err;
  }
}

function runSqlCommand(sql, label) {
  const escaped = sql.replace(/"/g, '\\"');
  return wrangler(`--command "${escaped}"`, label, { allowFail: true });
}

console.log(">>> verifying token + account…");
try {
  execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });
} catch {
  console.error(`
❌ فشل wrangler whoami — تحقق من التوكن (سطر واحد، بدون أسطر جديدة).
`);
  process.exit(1);
}

wrangler(
  `--command "ALTER TABLE competition_tasks RENAME TO teacher_competition_tasks"`,
  "rename legacy teacher competition_tasks → teacher_competition_tasks",
  { allowFail: true },
);

const sqlPath = path.join(schemaDir, "048_competition_engine.sql");
const statements = readFileSync(sqlPath, "utf8")
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);

console.log(`\n>>> applying 048 (${statements.length} statements)…`);
for (const stmt of statements) {
  const preview = stmt.split("\n")[0].slice(0, 72);
  runSqlCommand(stmt, preview);
}

console.log("\nDone: 048 migration.");
