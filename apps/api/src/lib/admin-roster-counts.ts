import type { Env } from "../types";
import { staffListSql } from "./admin-staff";
import { buildStudentPlacementSql } from "./student-list-sql";
import { studentAttendanceEligibleSql } from "./db-schema";

export type ComplexStaffCounts = {
  total: number;
  by_role: Record<string, number>;
};

export type ComplexStudentCounts = {
  total: number;
  /** حلقة فقط — circle IS NOT NULL AND track IS NULL */
  circle_only: number;
  /** مسار فقط — track IS NOT NULL AND circle IS NULL */
  track_only: number;
  /** حلقة ومسار معاً */
  circle_and_track: number;
  /** بدون حلقة ولا مسار */
  unassigned: number;
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
  const isActiveExpr = await studentAttendanceEligibleSql(env, "s");
  const base = `FROM students s ${historyJoin} WHERE s.complex_id = ? AND ${isActiveExpr}`;

  const totalP = env.DB.prepare(`SELECT COUNT(*) AS c ${base}`)
    .bind(complexId)
    .first<{ c: number }>();

  const hasCircle = circleRef !== "NULL";
  const hasTrack = trackRef !== "NULL";

  const circleOnlyP =
    hasCircle && hasTrack
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NOT NULL AND ${trackRef} IS NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : hasCircle
        ? env.DB.prepare(
            `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NOT NULL`,
          )
            .bind(complexId)
            .first<{ c: number }>()
        : Promise.resolve({ c: 0 } as { c: number });

  const trackOnlyP =
    hasCircle && hasTrack
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${trackRef} IS NOT NULL AND ${circleRef} IS NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : hasTrack
        ? env.DB.prepare(
            `SELECT COUNT(*) AS c ${base} AND ${trackRef} IS NOT NULL`,
          )
            .bind(complexId)
            .first<{ c: number }>()
        : Promise.resolve({ c: 0 } as { c: number });

  const bothP =
    hasCircle && hasTrack
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NOT NULL AND ${trackRef} IS NOT NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const unassignedP =
    hasCircle && hasTrack
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c ${base} AND ${circleRef} IS NULL AND ${trackRef} IS NULL`,
        )
          .bind(complexId)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

  const [total, circleOnly, trackOnly, both, unassigned] = await Promise.all([
    totalP,
    circleOnlyP,
    trackOnlyP,
    bothP,
    unassignedP,
  ]);

  return {
    total: Number(total?.c ?? 0),
    circle_only: Number(circleOnly?.c ?? 0),
    track_only: Number(trackOnly?.c ?? 0),
    circle_and_track: Number(both?.c ?? 0),
    unassigned: Number(unassigned?.c ?? 0),
  };
}
