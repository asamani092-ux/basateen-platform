import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

/** يُرجع track_id المرتبط بحلقة — يتكيف مع v25 (track_circles) أو legacy (circles.track_id) */
export async function resolveCircleTrackId(
  env: Env,
  circleId: number,
  complexId?: number,
  explicitTrackId?: number | null,
): Promise<number | null> {
  const explicit = explicitTrackId ?? null;
  if (explicit != null && explicit > 0) return explicit;

  if (await tableHasColumn(env, "circles", "track_id")) {
    let sql = `SELECT track_id FROM circles WHERE id = ?`;
    const binds: number[] = [circleId];
    if (complexId != null) {
      sql += ` AND complex_id = ?`;
      binds.push(complexId);
    }
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ track_id: number | null }>();
    if (row?.track_id != null) return row.track_id;
  }

  if (await hasTable(env, "track_circles")) {
    const row = await env.DB.prepare(
      `SELECT track_id FROM track_circles WHERE circle_id = ? LIMIT 1`,
    )
      .bind(circleId)
      .first<{ track_id: number }>();
    if (row?.track_id != null) return row.track_id;
  }

  return null;
}

/** تحقق من وجود حلقة دون الاعتماد على أعمدة اختيارية */
export async function circleExistsInComplex(
  env: Env,
  circleId: number,
  complexId: number,
): Promise<boolean> {
  if (!(await hasTable(env, "circles"))) return false;
  const row = await env.DB.prepare(
    `SELECT id FROM circles WHERE id = ? AND complex_id = ?`,
  )
    .bind(circleId, complexId)
    .first();
  return Boolean(row);
}
