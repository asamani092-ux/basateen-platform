#!/usr/bin/env node
/**
 * 051 remote: competition_tasks.input_type column + category cleanup.
 *
 * Usage (from apps/api):
 *   export CLOUDFLARE_API_TOKEN='...'
 *   export CLOUDFLARE_ACCOUNT_ID='...'
 *   npm run db:remote:051
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (!token) {
  console.error("❌ CLOUDFLARE_API_TOKEN غير مضبوط");
  process.exit(1);
}
process.env.CLOUDFLARE_API_TOKEN = token;

if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
  console.error("❌ CLOUDFLARE_ACCOUNT_ID غير مضبوط");
  process.exit(1);
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

console.log(">>> verifying token…");
execSync("npx wrangler whoami", { cwd: apiRoot, stdio: "inherit", env: process.env });

run(
  `--file="${path.join(schemaDir, "051_competition_task_input_type.sql")}"`,
  "051 competition task input_type",
  { allowFail: true },
);

console.log("\nDone: 051 migration.");
