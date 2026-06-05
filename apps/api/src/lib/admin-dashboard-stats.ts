import type { Env } from "../types";
import { buildStudentPlacementSql } from "./student-list-sql";
import {
  hasTable,
  sqliteActiveEq1,
  studentIsActiveSql,
  tableHasColumn,
} from "./db-schema";
import { resolveAttendanceTableName } from "./student-attendance-db";

const STAFF_ROLE_CASE_SQL = `CASE
  WHEN COALESCE(u.is_admin, 0) = 1 THEN 'super_admin'
  WHEN COALESCE(u.is_educational, 0) = 1 THEN 'edu_supervisor'
  WHEN COALESCE(u.is_programs, 0) = 1 THEN 'programs_supervisor'
  WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
  WHEN COALESCE(u.is_teacher, 0) = 1 THEN 'teacher'
  ELSE 'teacher'
END`;

export type AdminDashboardStats = {
  complex_name: string | null;
  generated_at: string;
  students: {
    total: number;
    with_circle: number;
    without_circle: number;
    with_track: number;
    without_track: number;
  };
  groups: {
    circles_active: number;
    tracks_active: number;
  };
  staff: {
    total: number;
    by_role: Record<string, number>;
  };
  pledges: {
    total: number;
    this_month: number;
    students_with_pledges: number;
  } | null;
  attendance: {
    student_records_this_month: number;
    staff_records_this_month: number;
    month_start: string;
    month_end: string;
  };
};

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(now) };
}

/**
 * Live aggregation engine for admin dashboard KPIs.
 * Time O(q) parallel queries where q = number of COUNT statements; Space O(1) beyond DB buffers.
 */
export async function fetchAdminDashboardStats(
  env: Env,
  complexId: number,
): Promise<AdminDashboardStats> {
  const placement = await buildStudentPlacementSql(env);
  const { historyJoin, circleRef, trackRef } = placement;
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const month = currentMonthRange();
  const studentBase = `FROM students s ${historyJoin} WHERE s.complex_id = ? AND ${isActiveExpr}`;

  const studentTotalP = env.DB.prepare(`SELECT COUNT(*) AS c ${studentBase}`)
    .bind(complexId)
    .first<{ c: number }>();

  const circleCountExprs =
    circleRef !== "NULL"
      ? {
          with: `SELECT COUNT(*) AS c ${studentBase} AND ${circleRef} IS NOT NULL`,
          without: `SELECT COUNT(*) AS c ${studentBase} AND ${circleRef} IS NULL`,
        }
      : null;

  const trackCountExprs =
    trackRef !== "NULL"
      ? {
          with: `SELECT COUNT(*) AS c ${studentBase} AND ${trackRef} IS NOT NULL`,
          without: `SELECT COUNT(*) AS c ${studentBase} AND ${trackRef} IS NULL`,
        }
      : null;

  const circlesActiveP = (async () => {
    if (!(await hasTable(env, "circles"))) return 0;
    const hasIsActive = await tableHasColumn(env, "circles", "is_active");
    const activeFilter = hasIsActive
      ? ` AND ${sqliteActiveEq1("is_active")}`
      : "";
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM circles WHERE complex_id = ?${activeFilter}`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    return Number(row?.c ?? 0);
  })();

  const tracksActiveP = (async () => {
    if (!(await hasTable(env, "tracks"))) return 0;
    const hasIsActive = await tableHasColumn(env, "tracks", "is_active");
    const activeFilter = hasIsActive
      ? ` AND ${sqliteActiveEq1("is_active")}`
      : "";
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tracks WHERE complex_id = ?${activeFilter}`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    return Number(row?.c ?? 0);
  })();

  const staffByRoleP = (async () => {
    const hasRole = await tableHasColumn(env, "users", "role");
    const roleExpr = hasRole ? "u.role" : STAFF_ROLE_CASE_SQL;
    const staffFilter = hasRole
      ? `u.role IN ('super_admin','admin_supervisor','edu_supervisor','programs_supervisor','prog_supervisor','track_supervisor','teacher')`
      : `(COALESCE(u.is_admin, 0) = 1 OR COALESCE(u.is_educational, 0) = 1 OR
          COALESCE(u.is_programs, 0) = 1 OR COALESCE(u.is_teacher, 0) = 1 OR
          COALESCE(u.is_track_supervisor, 0) = 1)`;
    const userActive = await tableHasColumn(env, "users", "is_active");
    const activeClause = userActive
      ? ` AND ${sqliteActiveEq1("u.is_active")}`
      : "";

    const rows = await env.DB.prepare(
      `SELECT ${roleExpr} AS role, COUNT(*) AS c
       FROM users u
       WHERE u.complex_id = ?${activeClause} AND ${staffFilter}
       GROUP BY ${roleExpr}`,
    )
      .bind(complexId)
      .all<{ role: string; c: number }>();

    const by_role: Record<string, number> = {};
    let total = 0;
    for (const r of rows.results ?? []) {
      const role = String(r.role ?? "teacher").trim() || "teacher";
      const count = Number(r.c ?? 0);
      by_role[role] = count;
      total += count;
    }
    return { total, by_role };
  })();

  const pledgesP = (async () => {
    if (!(await hasTable(env, "student_pledges"))) return null;
    const [totalRow, monthRow, studentsRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS c FROM student_pledges WHERE complex_id = ?`,
      )
        .bind(complexId)
        .first<{ c: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS c FROM student_pledges
         WHERE complex_id = ? AND pledge_date >= ? AND pledge_date <= ?`,
      )
        .bind(complexId, month.start, month.end)
        .first<{ c: number }>(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT student_id) AS c FROM student_pledges WHERE complex_id = ?`,
      )
        .bind(complexId)
        .first<{ c: number }>(),
    ]);
    return {
      total: Number(totalRow?.c ?? 0),
      this_month: Number(monthRow?.c ?? 0),
      students_with_pledges: Number(studentsRow?.c ?? 0),
    };
  })();

  const attendanceP = (async () => {
    const attTable = await resolveAttendanceTableName(env);
    const studentRecordsP = attTable
      ? env.DB.prepare(
          `SELECT COUNT(*) AS c FROM ${attTable}
           WHERE complex_id = ? AND attendance_date >= ? AND attendance_date <= ?`,
        )
          .bind(complexId, month.start, month.end)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

    const staffRecordsP =
      (await hasTable(env, "staff_attendance"))
        ? env.DB.prepare(
            `SELECT COUNT(*) AS c FROM staff_attendance
             WHERE complex_id = ? AND attendance_date >= ? AND attendance_date <= ?`,
          )
            .bind(complexId, month.start, month.end)
            .first<{ c: number }>()
        : Promise.resolve({ c: 0 } as { c: number });

    const [studentRecords, staffRecords] = await Promise.all([
      studentRecordsP,
      staffRecordsP,
    ]);
    return {
      student_records_this_month: Number(studentRecords?.c ?? 0),
      staff_records_this_month: Number(staffRecords?.c ?? 0),
      month_start: month.start,
      month_end: month.end,
    };
  })();

  const complexP = env.DB.prepare(`SELECT name_ar FROM complexes WHERE id = ?`)
    .bind(complexId)
    .first<{ name_ar: string }>();

  const studentWithCircleP = circleCountExprs
    ? env.DB.prepare(circleCountExprs.with).bind(complexId).first<{ c: number }>()
    : Promise.resolve({ c: 0 } as { c: number });
  const studentWithoutCircleP = circleCountExprs
    ? env.DB.prepare(circleCountExprs.without).bind(complexId).first<{ c: number }>()
    : Promise.resolve({ c: 0 } as { c: number });
  const studentWithTrackP = trackCountExprs
    ? env.DB.prepare(trackCountExprs.with).bind(complexId).first<{ c: number }>()
    : Promise.resolve({ c: 0 } as { c: number });
  const studentWithoutTrackP = trackCountExprs
    ? env.DB.prepare(trackCountExprs.without).bind(complexId).first<{ c: number }>()
    : Promise.resolve({ c: 0 } as { c: number });

  const [
    studentTotalRow,
    withCircleRow,
    withoutCircleRow,
    withTrackRow,
    withoutTrackRow,
    circlesActive,
    tracksActive,
    staff,
    pledges,
    attendance,
    complex,
  ] = await Promise.all([
    studentTotalP,
    studentWithCircleP,
    studentWithoutCircleP,
    studentWithTrackP,
    studentWithoutTrackP,
    circlesActiveP,
    tracksActiveP,
    staffByRoleP,
    pledgesP,
    attendanceP,
    complexP,
  ]);

  const studentsTotal = Number(studentTotalRow?.c ?? 0);

  return {
    complex_name: complex?.name_ar ?? null,
    generated_at: new Date().toISOString(),
    students: {
      total: studentsTotal,
      with_circle: Number(withCircleRow?.c ?? 0),
      without_circle: Number(withoutCircleRow?.c ?? 0),
      with_track: Number(withTrackRow?.c ?? 0),
      without_track: Number(withoutTrackRow?.c ?? 0),
    },
    groups: {
      circles_active: circlesActive,
      tracks_active: tracksActive,
    },
    staff,
    pledges,
    attendance,
  };
}
