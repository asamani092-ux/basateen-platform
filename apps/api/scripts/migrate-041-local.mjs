#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const schemaDir = path.resolve(apiRoot, "../../packages/database/schema");
const flag = "--local";

function run(args, label) {
  console.log(`\n>>> ${label}`);
  execSync(`npx wrangler d1 execute basateen ${flag} ${args}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
}

run(
  `--file="${path.join(schemaDir, "041_purge_circles_legacy_phantoms.sql")}"`,
  "041 static purge (local)",
);

console.log("\nDone: 041 migration (local).");
