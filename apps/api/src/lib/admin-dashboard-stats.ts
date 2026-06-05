import type { Env } from "../types";
import {
  hasTable,
  sqliteActiveEq1,
  tableHasColumn,
} from "./db-schema";
import { countComplexStaff, countComplexStudents } from "./admin-roster-counts";
import { resolveAttendanceTableName } from "./student-attendance-db";
import { fetchSemesterPeriod, semesterQueryRange } from "./semester-period";

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
    date: string;
    students_marked_today: number;
    students_present_today: number;
    staff_marked_today: number;
    staff_present_today: number;
  };
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(now) };
}

/**
 * Live aggregation engine for admin dashboard KPIs.
 * Time O(q) parallel queries; Space O(1) beyond DB buffers.
 */
export async function fetchAdminDashboardStats(
  env: Env,
  complexId: number,
): Promise<AdminDashboardStats> {
  const semester = await fetchSemesterPeriod(env, complexId);
  const month = semester.active
    ? semesterQueryRange(semester)
    : currentMonthRange();

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
    const today = todayIso();
    const attTable = await resolveAttendanceTableName(env);

    const studentMarkedP = attTable
      ? env.DB.prepare(
          `SELECT COUNT(DISTINCT student_id) AS c FROM ${attTable}
           WHERE complex_id = ? AND attendance_date = ?`,
        )
          .bind(complexId, today)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

    const studentPresentP = attTable
      ? env.DB.prepare(
          `SELECT COUNT(DISTINCT student_id) AS c FROM ${attTable}
           WHERE complex_id = ? AND attendance_date = ? AND status = 'present'`,
        )
          .bind(complexId, today)
          .first<{ c: number }>()
      : Promise.resolve({ c: 0 } as { c: number });

    const staffMarkedP =
      (await hasTable(env, "staff_attendance"))
        ? env.DB.prepare(
            `SELECT COUNT(*) AS c FROM staff_attendance
             WHERE complex_id = ? AND attendance_date = ?`,
          )
            .bind(complexId, today)
            .first<{ c: number }>()
        : Promise.resolve({ c: 0 } as { c: number });

    const staffPresentP =
      (await hasTable(env, "staff_attendance"))
        ? env.DB.prepare(
            `SELECT COUNT(*) AS c FROM staff_attendance
             WHERE complex_id = ? AND attendance_date = ? AND status = 'present'`,
          )
            .bind(complexId, today)
            .first<{ c: number }>()
        : Promise.resolve({ c: 0 } as { c: number });

    const [studentMarked, studentPresent, staffMarked, staffPresent] =
      await Promise.all([
        studentMarkedP,
        studentPresentP,
        staffMarkedP,
        staffPresentP,
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
    attendance,
  };
}
