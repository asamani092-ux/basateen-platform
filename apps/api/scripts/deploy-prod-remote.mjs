#!/usr/bin/env node
/**
 * Production Worker deploy — validates Cloudflare auth before wrangler deploy.
 *
 * Usage (from apps/api):
 *   export CLOUDFLARE_API_TOKEN='...'
 *   export CLOUDFLARE_ACCOUNT_ID='01f5b1526aa792441a4b9ca33a156327'
 *   npm run deploy:prod
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");

const token = process.env.CLOUDFLARE_API_TOKEN?.replace(/\s+/g, "").trim();
if (!token) {
  console.error(`
❌ CLOUDFLARE_API_TOKEN غير مضبوط.

  export CLOUDFLARE_API_TOKEN='your-token'
  export CLOUDFLARE_ACCOUNT_ID='01f5b1526aa792441a4b9ca33a156327'
  cd apps/api && npm run deploy:prod
`);
  process.exit(1);
}
process.env.CLOUDFLARE_API_TOKEN = token;

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!accountId) {
  console.error(`
❌ CLOUDFLARE_ACCOUNT_ID غير مضبوط.

  export CLOUDFLARE_ACCOUNT_ID='01f5b1526aa792441a4b9ca33a156327'
  cd apps/api && npm run deploy:prod
`);
  process.exit(1);
}
process.env.CLOUDFLARE_ACCOUNT_ID = accountId;

function run(cmd, label) {
  console.log(`\n>>> ${label}`);
  execSync(cmd, { cwd: apiRoot, stdio: "inherit", env: process.env });
}

console.log(">>> التحقق من التوكن…");
run("npx wrangler whoami", "wrangler whoami");

console.log("\n>>> نشر Worker (production)…");
run("npx wrangler deploy --env production", "wrangler deploy --env production");

console.log("\n✅ Done: production deploy.");
