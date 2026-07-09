#!/usr/bin/env node
/**
 * 056 remote: memorization_faces on students for unified cumulative memorization.
 *
 * Usage (from apps/api):
 *   npm run db:remote:056
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
❌ Windows ARM64: use GitHub Actions (docs/PRODUCTION.md) for db:remote:056.
`);
  process.exit(1);
}

function printAuthHelp() {
  console.error(`
❌ Cloudflare auth failed. Run: cd apps/api && npx wrangler login
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
  `--file="${path.join(schemaDir, "056_student_memorization_faces.sql")}"`,
  "056 students memorization_faces",
  { allowFail: true },
);

console.log("\nDone: 056 migration.");
