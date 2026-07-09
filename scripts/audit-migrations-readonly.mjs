#!/usr/bin/env node
/**
 * تدقيق قراءة فقط: أثر كل ملف ترحيل مقابل مخطط D1 الإنتاج
 * Usage: node scripts/audit-migrations-readonly.mjs  (from repo root; needs CLOUDFLARE_API_TOKEN)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = path.join(ROOT, "packages/database/schema");
const API_DIR = path.join(ROOT, "apps/api");
const remote = "--remote --yes";

function queryJson(sql) {
  const out = execSync(
    `npx wrangler d1 execute basateen ${remote} --command ${JSON.stringify(sql)} --json`,
    { cwd: API_DIR, encoding: "utf8", env: process.env, maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  if (block?.success === false) {
    throw new Error(`D1 query failed: ${JSON.stringify(block)}`);
  }
  return block?.results ?? [];
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, " ");
}

/** O(F·L) — F ملفات، L طول SQL */
function parseExpectations(sql) {
  const cleaned = stripComments(sql);
  const expects = {
    tables: new Set(),
    columns: [],
    indexes: [],
    absentIndexes: [],
    absentTables: [],
    hasDml: /\b(INSERT|UPDATE|DELETE)\b/i.test(cleaned),
    hasTrigger: /\bCREATE\s+TRIGGER\b/i.test(cleaned),
    hasAlterOther: /\bALTER\s+TABLE\b/i.test(cleaned) && !/\bADD\s+COLUMN\b/i.test(cleaned),
  };

  for (const m of cleaned.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi,
  )) {
    const name = m[1];
    if (!/_\d{3}$|_new$|_068$|_legacy$|_old$/i.test(name)) expects.tables.add(name);
  }

  for (const m of cleaned.matchAll(
    /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+COLUMN\s+[`"]?(\w+)[`"]?/gi,
  )) {
    expects.columns.push({ table: m[1], column: m[2] });
  }

  for (const m of cleaned.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+ON\s+[`"]?(\w+)[`"]?/gi,
  )) {
    expects.indexes.push({ name: m[1], table: m[2] });
  }

  for (const m of cleaned.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi)) {
    expects.absentIndexes.push(m[1]);
  }

  for (const m of cleaned.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi)) {
    expects.absentTables.push(m[1]);
  }

  return expects;
}

function buildSchemaSnapshot() {
  const master = queryJson(
    "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name;",
  );

  console.log("=== RAW sqlite_master ===");
  console.log(JSON.stringify(master, null, 2));

  const userTables = master.filter(
    (r) =>
      r.type === "table" &&
      !r.name.startsWith("sqlite_") &&
      r.name !== "_cf_KV",
  );

  const tableCols = {};
  const tableIdx = {};
  const pragmaDump = {};

  for (const t of userTables) {
    const info = queryJson(`PRAGMA table_info(${t.name});`);
    const idx = queryJson(`PRAGMA index_list(${t.name});`);
    tableCols[t.name] = info.map((r) => r.name);
    tableIdx[t.name] = idx.map((r) => r.name);
    pragmaDump[t.name] = { table_info: info, index_list: idx };
  }

  console.log("\n=== RAW PRAGMA (all tables) ===");
  console.log(JSON.stringify(pragmaDump, null, 2));

  const allIndexNames = new Set(
    master.filter((r) => r.type === "index").map((r) => r.name),
  );
  const allTableNames = new Set(userTables.map((t) => t.name));

  return { master, tableCols, tableIdx, allIndexNames, allTableNames };
}

function indexExists(name, tableIdx, allIndexNames) {
  if (allIndexNames.has(name)) return true;
  for (const idxs of Object.values(tableIdx)) {
    if (idxs.includes(name)) return true;
  }
  return false;
}

function indexAbsent(name, tableIdx, allIndexNames) {
  return !indexExists(name, tableIdx, allIndexNames);
}

/** فحوصات أثر محروسة (نفس منطق migrate-066/067/068-remote) */
function specialEffectCheck(filename, snap) {
  const { tableCols, tableIdx, allTableNames } = snap;
  if (filename === "000_migrations_applied.sql") {
    const ok = allTableNames.has("_migrations_applied");
    return ok
      ? { status: "APPLIED", missing: [] }
      : { status: "MISSING", missing: ["table:_migrations_applied"] };
  }
  if (filename === "066_semester_plans_columns.sql") {
    const cols = tableCols.student_semester_plans ?? [];
    const need = ["starts_at", "ends_at", "is_active", "created_by_user_id"];
    const missing = need.filter((c) => !cols.includes(c));
    if (missing.length === 0) return { status: "APPLIED", missing: [] };
    if (missing.length === need.length)
      return { status: "MISSING", missing: need.map((c) => `column:student_semester_plans.${c}`) };
    return {
      status: "PARTIAL",
      missing: missing.map((c) => `column:student_semester_plans.${c}`),
    };
  }
  if (filename === "067_teacher_competition_task_types.sql") {
    const table = allTableNames.has("teacher_competition_tasks")
      ? "teacher_competition_tasks"
      : allTableNames.has("competition_tasks")
        ? "competition_tasks"
        : null;
    if (!table)
      return {
        status: "MISSING",
        missing: ["table:teacher_competition_tasks|competition_tasks"],
      };
    const cols = tableCols[table] ?? [];
    const missing = ["type", "input_type"].filter((c) => !cols.includes(c));
    if (missing.length === 0) return { status: "APPLIED", missing: [] };
    if (missing.length === 2)
      return { status: "MISSING", missing: missing.map((c) => `column:${table}.${c}`) };
    return {
      status: "PARTIAL",
      missing: missing.map((c) => `column:${table}.${c}`),
    };
  }
  if (filename === "068_student_semester_plans_multi.sql") {
    const cols = tableCols.student_semester_plans ?? [];
    const idxs = tableIdx.student_semester_plans ?? [];
    const missing = [];
    if (!cols.includes("duration_weeks"))
      missing.push("column:student_semester_plans.duration_weeks");
    if (idxs.includes("idx_student_semester_plan_active"))
      missing.push("absent-index:idx_student_semester_plan_active (still exists)");
    if (!idxs.includes("idx_student_semester_plans_student_active"))
      missing.push("index:idx_student_semester_plans_student_active");
    if (missing.length === 0) return { status: "APPLIED", missing: [] };
    const onlyOldIdx =
      missing.length === 1 && missing[0].includes("idx_student_semester_plan_active");
    const noDuration = missing.some((m) => m.includes("duration_weeks"));
    if (noDuration && missing.length >= 2) return { status: "MISSING", missing };
    return { status: onlyOldIdx || noDuration ? "PARTIAL" : "PARTIAL", missing };
  }
  return null;
}

function verifyFile(filename, sql, snap) {
  const special = specialEffectCheck(filename, snap);
  if (special) return special;

  const expects = parseExpectations(sql);
  const checks = [];
  let passed = 0;

  for (const t of expects.tables) {
    checks.push({ kind: "table", ref: t, ok: snap.allTableNames.has(t) });
  }
  for (const { table, column } of expects.columns) {
    const cols = snap.tableCols[table] ?? [];
    checks.push({
      kind: "column",
      ref: `${table}.${column}`,
      ok: cols.includes(column),
    });
  }
  for (const { name, table } of expects.indexes) {
    checks.push({
      kind: "index",
      ref: name,
      ok: indexExists(name, snap.tableIdx, snap.allIndexNames),
    });
  }
  for (const idx of expects.absentIndexes) {
    checks.push({
      kind: "absent-index",
      ref: idx,
      ok: indexAbsent(idx, snap.tableIdx, snap.allIndexNames),
    });
  }
  for (const t of expects.absentTables) {
    if (/_\d{3}$|_new$|_068$|_legacy$|_old$/i.test(t)) continue;
    checks.push({ kind: "absent-table", ref: t, ok: !snap.allTableNames.has(t) });
  }

  if (checks.length === 0) {
    if (expects.hasTrigger)
      return {
        status: "UNVERIFIABLE",
        missing: [],
        reason: "CREATE TRIGGER — not introspected",
      };
    if (expects.hasAlterOther)
      return {
        status: "UNVERIFIABLE",
        missing: [],
        reason: "ALTER TABLE (non-ADD COLUMN) — not introspected",
      };
    if (expects.hasDml)
      return {
        status: "UNVERIFIABLE",
        missing: [],
        reason: "data-only DML (backfill/seed/cleanup)",
      };
    return {
      status: "UNVERIFIABLE",
      missing: [],
      reason: "no verifiable DDL extracted",
    };
  }

  for (const c of checks) {
    if (c.ok) passed++;
  }
  const missing = checks.filter((c) => !c.ok).map((c) => `${c.kind}:${c.ref}`);

  if (missing.length === 0) return { status: "APPLIED", missing: [] };
  if (passed === 0) return { status: "MISSING", missing };
  return { status: "PARTIAL", missing };
}

function verdict(tracked, effectStatus) {
  let v = effectStatus;
  if (tracked && (effectStatus === "MISSING" || effectStatus === "PARTIAL"))
    v += " | FALSE POSITIVE";
  if (!tracked && effectStatus === "APPLIED") v += " | TRACKING GAP";
  return v;
}

// --- main ---
if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
  console.error("CLOUDFLARE_API_TOKEN is required");
  process.exit(1);
}

execSync("npm install >/dev/null 2>&1", { cwd: API_DIR, stdio: "inherit" });

const snap = buildSchemaSnapshot();

const trackedRows = queryJson("SELECT name FROM _migrations_applied ORDER BY name;");
const tracked = new Set(trackedRows.map((r) => r.name));
console.log("\n=== RAW _migrations_applied ===");
console.log(JSON.stringify(trackedRows, null, 2));

const files = fs
  .readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith(".sql") && f !== "_wave3_bundle.sql")
  .sort();

const rows = [];
for (const file of files) {
  const sql = fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8");
  const result = verifyFile(file, sql, snap);
  const isTracked = tracked.has(file);
  rows.push({
    file,
    tracked: isTracked,
    effect: result.status,
    missing: result.missing,
    reason: result.reason ?? "",
    verdict: verdict(isTracked, result.status),
  });
}

console.log("\n=== AUDIT TABLE ===");
console.log("| file | tracked? | effect | missing objects | verdict |");
for (const r of rows) {
  const miss =
    r.missing?.length > 0
      ? r.missing.join("; ")
      : r.reason || "—";
  console.log(
    `| ${r.file} | ${r.tracked ? "yes" : "no"} | ${r.effect} | ${miss} | ${r.verdict} |`,
  );
}

console.log("\n=== DISCREPANCIES ===");
let disc = 0;
for (const r of rows) {
  if (r.tracked && (r.effect === "MISSING" || r.effect === "PARTIAL")) {
    disc++;
    console.log(
      `FALSE POSITIVE: ${r.file} — tracked=yes effect=${r.effect} missing=${(r.missing ?? []).join("; ") || r.reason}`,
    );
  }
  if (!r.tracked && r.effect === "APPLIED") {
    disc++;
    console.log(`TRACKING GAP: ${r.file} — effect=APPLIED but not in _migrations_applied`);
  }
}
if (disc === 0) console.log("(none)");

console.log("\n=== ACTION ITEMS (migrations that truly need applying) ===");
const actions = rows.filter((r) => r.effect === "MISSING" || r.effect === "PARTIAL");
if (actions.length === 0) {
  console.log("(none — all verifiable effects present or UNVERIFIABLE only)");
} else {
  for (const r of actions) {
    console.log(
      `APPLY: ${r.file} [${r.effect}] — ${(r.missing ?? []).join("; ") || r.reason}`,
    );
  }
}

console.log(`\n=== SUMMARY: ${rows.length} files audited ===`);
