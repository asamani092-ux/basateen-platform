import type { Env } from "../types";
import {
  hasTable,
  sqliteActiveEq1,
  tableHasColumn,
} from "./db-schema";
import { countComplexStaff, countComplexStudents } from "./admin-roster-counts";
import { resolveAttendanceTableName } from "./student-attendance-db";
import { fetchSemesterPeriod, semesterQueryRange } from "./semester-period";
import { todayRiyadhIso } from "../lib/today-riyadh-iso";

export type AdminDashboardStats = {
  complex_name: string | null;
  generated_at: string;
  students: {
    total: number;
    circle_only: number;
    track_only: number;
    circle_and_track: number;
    unassigned: number;
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
    date: string;
    students_marked_today: number;
    students_present_today: number;
    students_attendance_rate_today: number;
    staff_marked_today: number;
    staff_present_today: number;
    staff_attendance_rate_today: number;
  };
};

function attendanceRatePct(present: number, total: number): number {
  return total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
}

function currentMonthRange(): { start: string; end: string } {
  const end = todayRiyadhIso();
  const [y, m] = end.split("-");
  return { start: `${y}-${m}-01`, end };
}

/**
 * Live aggregation engine for admin dashboard KPIs.
 * Time O(q) parallel queries; Space O(1) beyond DB buffers.
 */
export async function fetchAdminDashboardStats(
  env: Env,
  complexId: number,
): Promise<AdminDashboardStats> {
  const semesterP = fetchSemesterPeriod(env, complexId);

  const circlesActiveP = (async () => {
    const [hasCircles, hasIsActive] = await Promise.all([
      hasTable(env, "circles"),
      tableHasColumn(env, "circles", "is_active"),
    ]);
    if (!hasCircles) return 0;
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
    const [hasTracks, hasIsActive] = await Promise.all([
      hasTable(env, "tracks"),
      tableHasColumn(env, "tracks", "is_active"),
    ]);
    if (!hasTracks) return 0;
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

  const pledgesP = (async () => {
    if (!(await hasTable(env, "student_pledges"))) return null;
    const semester = await semesterP;
    const month = semester.active
      ? semesterQueryRange(semester)
      : currentMonthRange();
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
    const today = todayRiyadhIso();
    const [attTable, hasStaffAtt] = await Promise.all([
      resolveAttendanceTableName(env),
      hasTable(env, "staff_attendance"),
    ]);

    const [studentMarked, studentPresent, staffMarked, staffPresent] =
      await Promise.all([
        attTable
          ? env.DB.prepare(
              `SELECT COUNT(DISTINCT student_id) AS c FROM ${attTable}
               WHERE complex_id = ? AND attendance_date = ?`,
            )
              .bind(complexId, today)
              .first<{ c: number }>()
          : Promise.resolve({ c: 0 } as { c: number }),
        attTable
          ? env.DB.prepare(
              `SELECT COUNT(DISTINCT student_id) AS c FROM ${attTable}
               WHERE complex_id = ? AND attendance_date = ? AND status = 'present'`,
            )
              .bind(complexId, today)
              .first<{ c: number }>()
          : Promise.resolve({ c: 0 } as { c: number }),
        hasStaffAtt
          ? env.DB.prepare(
              `SELECT COUNT(*) AS c FROM staff_attendance
               WHERE complex_id = ? AND attendance_date = ?`,
            )
              .bind(complexId, today)
              .first<{ c: number }>()
          : Promise.resolve({ c: 0 } as { c: number }),
        hasStaffAtt
          ? env.DB.prepare(
              `SELECT COUNT(*) AS c FROM staff_attendance
               WHERE complex_id = ? AND attendance_date = ? AND status = 'present'`,
            )
              .bind(complexId, today)
              .first<{ c: number }>()
          : Promise.resolve({ c: 0 } as { c: number }),
      ]);

    return {
      date: today,
      students_marked_today: Number(studentMarked?.c ?? 0),
      students_present_today: Number(studentPresent?.c ?? 0),
      staff_marked_today: Number(staffMarked?.c ?? 0),
      staff_present_today: Number(staffPresent?.c ?? 0),
    };
  })();

  const complexP = env.DB.prepare(`SELECT name_ar FROM complexes WHERE id = ?`)
    .bind(complexId)
    .first<{ name_ar: string }>();

  const [students, staff, circlesActive, tracksActive, pledges, attendance, complex] =
    await Promise.all([
      countComplexStudents(env, complexId),
      countComplexStaff(env, complexId),
      circlesActiveP,
      tracksActiveP,
      pledgesP,
      attendanceP,
      complexP,
    ]);

  return {
    complex_name: complex?.name_ar ?? null,
    generated_at: new Date().toISOString(),
    students,
    groups: {
      circles_active: circlesActive,
      tracks_active: tracksActive,
    },
    staff,
    pledges,
    attendance: {
      ...attendance,
      students_attendance_rate_today: attendanceRatePct(
        attendance.students_present_today,
        students.total,
      ),
      staff_attendance_rate_today: attendanceRatePct(
        attendance.staff_present_today,
        staff.total,
      ),
    },
  };
}
