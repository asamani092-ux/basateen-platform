import type { Env } from "../types";

/** تشغيل دفعة حذف مع تعطيل FK — تنفيذ متسلسل (D1 لا يضمن PRAGMA داخل batch) — O(n) */
export async function runHardDeleteBatch(
  env: Env,
  batch: D1PreparedStatement[],
): Promise<void> {
  if (batch.length === 0) return;
  await env.DB.prepare(`PRAGMA foreign_keys = OFF`).run();
  try {
    for (const stmt of batch) {
      await stmt.run();
    }
  } finally {
    await env.DB.prepare(`PRAGMA foreign_keys = ON`).run();
  }
}

async function dropTriggersByNames(
  env: Env,
  names: string[],
): Promise<string[]> {
  const dropped: string[] = [];
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    const escaped = name.replace(/"/g, '""');
    await env.DB.prepare(`DROP TRIGGER IF EXISTS "${escaped}"`).run();
    dropped.push(name);
  }
  return dropped;
}

/**
 * إسقاط أي مُشغّل يشير إلى circles_legacy أو جدول الحلقات.
 * O(t) حيث t = عدد المُشغّلات.
 */
export async function dropPhantomLegacyTriggers(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'`,
  ).all<{ name: string; sql: string | null }>();

  const toDrop: string[] = [];
  for (const row of rows.results ?? []) {
    const sql = (row.sql ?? "").toLowerCase();
    if (
      sql.includes("circles_legacy") ||
      sql.includes("circles_legacy_035") ||
      row.name.toLowerCase().includes("circles")
    ) {
      toDrop.push(row.name);
    }
  }
  return dropTriggersByNames(env, toDrop);
}

/** إسقاط مُشغّلات مرتبطة بجدول circles مباشرة */
export async function dropCircleTriggers(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'trigger' AND tbl_name = 'circles'`,
  ).all<{ name: string }>();
  const names = (rows.results ?? []).map((r) => r.name);
  return dropTriggersByNames(env, names);
}

/** إسقاط كل المُشغّلات — O(t) */
export async function dropAllTriggers(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'trigger'`,
  ).all<{ name: string }>();
  return dropTriggersByNames(
    env,
    (rows.results ?? []).map((r) => r.name),
  );
}

/** تجهيز قاعدة البيانات قبل حذف حلقة — O(t) */
export async function prepareCircleHardDelete(env: Env): Promise<void> {
  await dropAllTriggers(env);
  await dropPhantomLegacyTriggers(env);
  await dropCircleTriggers(env);
}
