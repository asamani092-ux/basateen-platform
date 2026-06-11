#!/usr/bin/env node
/**
 * 052 remote: sird_period_records table for recitation competitions.
 *
 * Usage (from apps/api):
 *   npm run db:remote:052
 *
 * Windows ARM64: use GitHub Actions (docs/PRODUCTION.md).
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
❌ Windows ARM64: Wrangler/workerd غير مدعوم — لا يمكن تشغيل db:remote:052 محلياً.
استخدم GitHub Actions (docs/PRODUCTION.md) أو WSL/x64.
`);
  process.exit(1);
}

function printAuthHelp() {
  console.error(`
❌ فشل المصادقة مع Cloudflare.

  cd apps/api
  npx wrangler login
  npm run db:remote:052
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
  `--file="${path.join(schemaDir, "052_sird_periods_matrix.sql")}"`,
  "052 sird periods matrix",
  { allowFail: true },
);

console.log("\nDone: 052 migration.");
