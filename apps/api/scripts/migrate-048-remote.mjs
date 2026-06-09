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

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (!token) {
  console.error(`
❌ CLOUDFLARE_API_TOKEN غير مضبوط — لا يمكن تنفيذ ترحيل D1 البعيد.

  export CLOUDFLARE_API_TOKEN='your-token-on-one-line'
  cd apps/api && npm run db:remote:048

Token: https://developers.cloudflare.com/profile/api-tokens
`);
  process.exit(1);
}

// Normalize token (wrangler fails if pasted with line breaks)
process.env.CLOUDFLARE_API_TOKEN = token;

function wrangler(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${remote} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function wranglerTry(args, label) {
  try {
    wrangler(args, label);
    return true;
  } catch {
    console.log(`>>> skipped: ${label} (already applied or not applicable)`);
    return false;
  }
}

console.log(">>> verifying token…");
try {
  execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });
} catch {
  console.error(`
❌ فشل التحقق من التوكن (wrangler whoami).

- الصق التوكن في سطر واحد بدون أسطر جديدة
- تأكد من صلاحية D1 → Edit على الحساب
- إن انتهت صلاحية التوكن أنشئ واحداً جديداً من لوحة Cloudflare
`);
  process.exit(1);
}

// Best-effort rename: legacy teacher tasks table (027) before platform competition_tasks (048)
wranglerTry(
  `--command "ALTER TABLE competition_tasks RENAME TO teacher_competition_tasks"`,
  "rename legacy teacher competition_tasks → teacher_competition_tasks",
);

wrangler(
  `--file="${path.join(schemaDir, "048_competition_engine.sql")}"`,
  "048 competition engine schema",
);

console.log("\nDone: 048 migration.");
