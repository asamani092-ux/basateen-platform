import type { Env } from "../types";

/** تشغيل دفعة حذف مع تعطيل FK مؤقتاً — O(1) */
export async function runHardDeleteBatch(
  env: Env,
  batch: D1PreparedStatement[],
): Promise<void> {
  await env.DB.prepare(`PRAGMA foreign_keys = OFF`).run();
  try {
    await env.DB.batch(batch);
  } finally {
    await env.DB.prepare(`PRAGMA foreign_keys = ON`).run();
  }
}

/**
 * إسقاط مُشغّلات SQLite العالقة على جدول الحلقات (مثل circles_legacy_035).
 * O(t) حيث t = عدد المُشغّلات المطابقة.
 */
export async function dropCircleTriggers(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'trigger'
       AND (
         tbl_name = 'circles'
         OR lower(COALESCE(sql, '')) LIKE '%circles%'
         OR lower(COALESCE(sql, '')) LIKE '%circles_legacy%'
       )`,
  ).all<{ name: string; sql: string | null }>();

  const dropped: string[] = [];
  for (const row of rows.results ?? []) {
    const name = row.name?.trim();
    if (!name) continue;
    const escaped = name.replace(/"/g, '""');
    await env.DB.prepare(`DROP TRIGGER IF EXISTS "${escaped}"`).run();
    dropped.push(name);
  }
  return dropped;
}
