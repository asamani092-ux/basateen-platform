import type { Env } from "../types";
import { staffListSql } from "./admin-staff";
import { buildStudentPlacementSql } from "./student-list-sql";
import { studentIsActiveSql } from "./db-schema";

export type ComplexStaffCounts = {
  total: number;
  by_role: Record<string, number>;
};

export type ComplexStudentCounts = {
  total: number;
  with_circle: number;
  without_circle: number;
  with_track: number;
  without_track: number;
};

/**
 * Staff roster count — mirrors GET /api/admin/staff (StaffManagementPage).
 * Time O(n) rows; Space O(r) roles.
 */
export async function countComplexStaff(
  env: Env,
  complexId: number,
): Promise<ComplexStaffCounts> {
  const sql = await staffListSql(env);
  const rows = await env.DB.prepare(sql)
    .bind(complexId)
    .all<{ role: string }>();

  const by_role: Record<string, number> = {};
  for (const r of rows.results ?? []) {
    const role = String(r.role ?? "teacher").trim() || "teacher";
    by_role[role] = (by_role[role] ?? 0) + 1;
  }
  return { total: rows.results?.length ?? 0, by_role };
}

/**
 * Active student counts — mirrors GET /api/students list predicate.
 * Time O(q) parallel COUNT; Space O(1).
 */
export async function countComplexStudents(
  env: Env,
  complexId: number,
): Promise<ComplexStudentCounts> {
  const placement = await buildStudentPlacementSql(env);
  const { historyJoin, circleRef, trackRef } = placement;
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const base = `FROM students s ${historyJoin} WHERE s.complex_id = ? AND ${isActiveExpr}`;

  const totalP = env.DB.prepare(`SELECT COUNT(*) AS c ${base}`)
    .bind(complexId)
    .first<{ c: number }>();

  const withCircleP =
    circleRef !== "NULL"
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NOT NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const withoutCircleP =
    circleRef !== "NULL"
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const withTrackP =
    trackRef !== "NULL"
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${trackRef} IS NOT NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const withoutTrackP =
    trackRef !== "NULL"
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${trackRef} IS NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const [total, withCircle, withoutCircle, withTrack, withoutTrack] =
    await Promise.all([
      totalP,
      withCircleP,
      withoutCircleP,
      withTrackP,
      withoutTrackP,
    ]);

  return {
    total: Number(total?.c ?? 0),
    with_circle: Number(withCircle?.c ?? 0),
    without_circle: Number(withoutCircle?.c ?? 0),
    with_track: Number(withTrack?.c ?? 0),
    without_track: Number(withoutTrack?.c ?? 0),
  };
}
