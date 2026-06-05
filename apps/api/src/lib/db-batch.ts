import type { Env } from "../types";

/** تشغيل دفعة حذف مع تعطيل FK داخل نفس الجلسة — O(n) */
export async function runHardDeleteBatch(
  env: Env,
  batch: D1PreparedStatement[],
): Promise<void> {
  if (batch.length === 0) return;
  await env.DB.batch([
    env.DB.prepare(`PRAGMA foreign_keys = OFF`),
    ...batch,
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
  ]);
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

/** تجهيز قاعدة البيانات قبل حذف حلقة — O(t) */
export async function prepareCircleHardDelete(env: Env): Promise<void> {
  await dropPhantomLegacyTriggers(env);
  await dropCircleTriggers(env);
}
