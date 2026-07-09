#!/usr/bin/env node
/**
 * 051 remote: competition_tasks.input_type column + category cleanup.
 *
 * Auth: wrangler OAuth (`npx wrangler login`) OR CLOUDFLARE_API_TOKEN (+ optional ACCOUNT_ID).
 *
 * Usage (from apps/api):
 *   npm run db:remote:051
 *
 * Windows PowerShell (API token):
 *   $env:CLOUDFLARE_API_TOKEN = 'your-token'
 *   $env:CLOUDFLARE_ACCOUNT_ID = 'your-account-id'
 *   npm run db:remote:051
 *
 * Windows ARM64: Wrangler غير مدعوم محلياً — استخدم GitHub Actions (docs/PRODUCTION.md).
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (token) {
  process.env.CLOUDFLARE_API_TOKEN = token;
}

const isWinArm64 = process.platform === "win32" && process.arch === "arm64";
if (isWinArm64) {
  console.error(`
❌ Windows ARM64: Wrangler/workerd غير مدعوم على هذا الجهاز — لا يمكن تشغيل db:remote:051 محلياً.

استخدم GitHub Actions بدلاً من ذلك:
  1. GitHub → Settings → Secrets → Actions
     CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
  2. Actions → D1 Production Migrate (أو Production Release)
  3. راجع docs/PRODUCTION.md

أو من WSL/x64:
  npx wrangler login
  npm run db:remote:051
`);
  process.exit(1);
}

function printAuthHelp() {
  console.error(`
❌ فشل المصادقة مع Cloudflare — Wrangler غير مسجّل أو CLOUDFLARE_API_TOKEN غير صالح.

الطريقة 1 — OAuth (Windows x64 / macOS / WSL):
  cd apps/api
  npx wrangler login
  npm run db:remote:051

الطريقة 2 — API Token (PowerShell، جلسة واحدة):
  $env:CLOUDFLARE_API_TOKEN = 'your-token'
  $env:CLOUDFLARE_ACCOUNT_ID = 'your-account-id'
  cd apps\\api
  npm run db:remote:051

Account ID من Dashboard أو بعد login:
  cd apps/api
  npx wrangler whoami

Windows ARM64 (Snapdragon): Wrangler/workerd غير مدعوم محلياً.
  → GitHub → Settings → Secrets → Actions:
     CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
  → Actions → D1 Production Migrate (راجع docs/PRODUCTION.md)

D1 database: basateen (مُعرّف في wrangler.toml)
`);
}

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

console.log(">>> verifying Cloudflare auth…");
try {
  execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });
} catch {
  printAuthHelp();
  process.exit(1);
}

run(
  `--file="${path.join(schemaDir, "051_competition_task_input_type.sql")}"`,
  "051 competition task input_type",
  { allowFail: true },
);

console.log("\nDone: 051 migration.");
