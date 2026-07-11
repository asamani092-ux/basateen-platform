#!/usr/bin/env node
/**
 * 073 remote: ترحيل display_media.media_url من data: إلى R2
 *
 * يرفع عبر Worker R2 binding (يتطلب نشر Worker + SETUP_KEY) — wrangler r2 object put
 * يفشل 403 مع API token بدون صلاحيات R2 Admin.
 *
 * Usage (from apps/api):
 *   SETUP_KEY=… API_PUBLIC_ORIGIN=… node scripts/migrate-073-remote.mjs
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const remote = "--remote --yes";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") || null;
const API_ORIGIN = (
  process.env.API_PUBLIC_ORIGIN ?? "https://winter-term-cb93.a-samani092.workers.dev"
).replace(/\/$/, "");
const SETUP_KEY = process.env.SETUP_KEY ?? "";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)} --json`,
    { cwd: apiRoot, encoding: "utf8", env: process.env },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
}

function runCommand(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(oneLine)}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

/** O(1) I/O — رفع عبر Worker R2 binding */
async function uploadViaWorker(dataUrl, complexId, id) {
  if (!SETUP_KEY) {
    throw new Error(
      "SETUP_KEY required — deploy Worker first, then run 073 with secrets.SETUP_KEY",
    );
  }
  const endpoint = `${API_ORIGIN}/api/setup/migrate-display-media-row?key=${encodeURIComponent(SETUP_KEY)}`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, complexId, id }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`worker upload failed (${resp.status}): ${text}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`worker upload invalid JSON: ${text}`);
  }
  if (!parsed?.url || !parsed?.key) {
    throw new Error(`worker upload missing url/key: ${text}`);
  }
  return { url: String(parsed.url), key: String(parsed.key) };
}

async function main() {
  console.log("\n>>> 073 display_media data: → R2 (one-time via Worker binding)");
  if (R2_PUBLIC_BASE) {
    console.log(`using R2_PUBLIC_BASE_URL=${R2_PUBLIC_BASE}`);
  } else {
    console.log(`using API_PUBLIC_ORIGIN=${API_ORIGIN} (worker proxy)`);
  }
  if (!SETUP_KEY) {
    console.error("ERROR: SETUP_KEY is required for 073 (Worker R2 binding upload)");
    process.exit(1);
  }

  const rows = queryJson(
    `SELECT id, complex_id, media_url, media_type FROM display_media WHERE media_url LIKE 'data:%' ORDER BY id`,
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = Number(row.id);
    const complexId = Number(row.complex_id ?? 1);
    const dataUrl = String(row.media_url ?? "");
    if (!dataUrl.toLowerCase().startsWith("data:")) {
      skipped++;
      continue;
    }

    try {
      const { url, key } = await uploadViaWorker(dataUrl, complexId, id);
      runCommand(
        `UPDATE display_media SET media_url = '${sqlEscape(url)}' WHERE id = ${id}`,
      );
      migrated++;
      console.log(`migrated id=${id} → ${key}`);
    } catch (err) {
      console.error(`failed id=${id}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  runCommand(
    "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('073_display_media_r2_urls.sql')",
  );

  console.log(`\nDone: migrated=${migrated} skipped=${skipped} total_data_rows=${rows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
