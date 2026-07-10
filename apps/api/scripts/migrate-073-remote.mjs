#!/usr/bin/env node
/**
 * 073 remote: ترحيل display_media.media_url من data: إلى R2
 *
 * Usage (from apps/api):
 *   R2_PUBLIC_BASE_URL=https://pub-….r2.dev node scripts/migrate-073-remote.mjs
 *   (أو API_PUBLIC_ORIGIN=… للبروكسي عبر Worker)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(apiDir, "..");
const remote = "--remote --yes";
const BUCKET = "basateen-display-media";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") || null;
const API_ORIGIN = (
  process.env.API_PUBLIC_ORIGIN ?? "https://winter-term-cb93.a-samani092.workers.dev"
).replace(/\/$/, "");

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

function extFromMime(mime) {
  const m = String(mime).toLowerCase();
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.startsWith("video/")) return "mp4";
  if (m.startsWith("image/")) return "jpg";
  return "bin";
}

function decodeDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/i);
  if (!m) return null;
  const mime = (m[1] || "application/octet-stream").toLowerCase();
  const payload = m[2];
  try {
    if (dataUrl.includes(";base64,")) {
      const buf = Buffer.from(payload, "base64");
      return { bytes: buf, mime };
    }
    const decoded = decodeURIComponent(payload);
    return { bytes: Buffer.from(decoded, "utf8"), mime };
  } catch {
    return null;
  }
}

function buildPublicUrl(key) {
  if (R2_PUBLIC_BASE) {
    return `${R2_PUBLIC_BASE}/${key.split("/").map((s) => encodeURIComponent(s)).join("/")}`;
  }
  return `${API_ORIGIN}/api/public/display-media/${encodeURIComponent(key)}`;
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function putR2Object(key, filePath, contentType) {
  execSync(
    `npx wrangler r2 object put ${BUCKET}/${key} --file=${JSON.stringify(filePath)} --content-type=${JSON.stringify(contentType)} ${remote}`,
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
}

console.log("\n>>> 073 display_media data: → R2 (one-time)");
if (R2_PUBLIC_BASE) {
  console.log(`using R2_PUBLIC_BASE_URL=${R2_PUBLIC_BASE}`);
} else {
  console.log(`using API_PUBLIC_ORIGIN=${API_ORIGIN} (worker proxy)`);
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
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    console.warn(`skip id=${id}: invalid data URL`);
    skipped++;
    continue;
  }
  if (!decoded.mime.startsWith("image/") && !decoded.mime.startsWith("video/")) {
    console.warn(`skip id=${id}: unsupported mime ${decoded.mime}`);
    skipped++;
    continue;
  }

  const key = `display/c${complexId}/migrated-${id}-${Date.now()}.${extFromMime(decoded.mime)}`;
  const tmp = path.join(os.tmpdir(), `display-media-migrate-${id}`);
  fs.writeFileSync(tmp, decoded.bytes);

  try {
    putR2Object(key, tmp, decoded.mime);
    const publicUrl = buildPublicUrl(key);
    runCommand(
      `UPDATE display_media SET media_url = '${sqlEscape(publicUrl)}' WHERE id = ${id}`,
    );
    migrated++;
    console.log(`migrated id=${id} → ${key}`);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

runCommand(
  "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('073_display_media_r2_urls.sql')",
);

console.log(`\nDone: migrated=${migrated} skipped=${skipped} total_data_rows=${rows.length}`);
