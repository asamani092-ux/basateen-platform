#!/usr/bin/env node
/**
 * 061 remote: إصلاح إسنادات منسوبين بعد تغيير الدور
 *
 * Usage (from apps/api): npm run db:remote:061
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const remote = "--remote --yes";

console.log("\n>>> 061 staff role assignment cleanup");
execSync(
  `npx wrangler d1 execute basateen ${remote} --file="${path.join(schemaDir, "061_staff_role_assignment_cleanup.sql")}"`,
  { cwd: apiRoot, stdio: "inherit", env: process.env },
);

console.log("\nDone: 061 migration.");
