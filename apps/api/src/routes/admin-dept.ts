import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { enforceRateLimit } from "../lib/rate-limit";
import {
  circleLabelRow,
  studentCircleScopeSql,
  syncStudentPlacementColumns,
  validateCircleStage,
} from "../lib/admin-dept-schema";
import { staffListSql as unifiedStaffListSql } from "../lib/admin-staff";
import {
  countComplexStaff,
  countComplexStudents,
} from "../lib/admin-roster-counts";
import { fetchStudentForAdminReport } from "../lib/admin-student-report";
import {
  activePlacementSql,
  hasTable,
  studentAttendanceEligibleSql,
  studentIsActiveSql,
  tableHasColumn,
} from "../lib/db-schema";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
import { STAGE_LABELS } from "../lib/dept-scope";
import {
  deleteSharedAccessToken,
  findActiveMagicLinkForEntity,
  randomMagicToken,
  resolveMagicGroupId,
  type MagicLinkContext,
} from "../lib/magic-link";
import { pageMeta, parsePageParams } from "../lib/pagination";
import { fetchSemesterPeriod, semesterQueryRange } from "../lib/semester-period";
import {
  batchSaveStaffAttendance,
  batchSaveStudentAttendance,
} from "../lib/attendance-batch";
import {
  assertTrackInComplex,
  loadEntityAttendanceStatus,
  loadStudentsForEntityAttendance,
  parseAttendanceEntity,
  studentBelongsToEntity,
} from "../lib/admin-attendance-entities";
import {
  bulkClearAttendanceRange,
  bulkPatchAttendanceRecords,
  fetchAttendanceLedger,
} from "../lib/admin-attendance-ledger";
import {
  bulkClearAttendanceDay,
  deleteAttendanceById,
  parseBeneficiaryType,
  patchAttendanceById,
  upsertAttendanceRecord,
} from "../lib/admin-attendance-mutations";
import { fetchAdminDashboardStats } from "../lib/admin-dashboard-stats";
import {
  buildSemesterExportCsvBundle,
  semesterExportCsvResponse,
} from "../lib/semester-export-all";
import { assignStudentCircle } from "../lib/placement";
import {
  resolveAttendanceTableName,
  upsertStudentAttendance,
  type AttendanceStatus,
} from "../lib/student-attendance-db";
import { todayRiyadhIso } from "../lib/today-riyadh-iso";

const ADMIN_ROLES = ["super_admin"] as const;

const STAGE_ID_TO_CIRCLE_STAGE: Record<number, string> = {
  1: "tlaqeen",
  2: "primary",
  3: "middle",
  4: "secondary",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function applyWhatsappAbsenceTemplate(
  template: string,
  ctx: { studentName: string; circleOrTrack: string; date: string },
): string {
  return template
    .replace(/\{\{student_name\}\}/g, ctx.studentName)
    .replace(/\{\{اسم_الطالب\}\}/g, ctx.studentName)
    .replace(/\{\{circle_name\}\}/g, ctx.circleOrTrack)
    .replace(/\{\{الحلقة_أو_المسار\}\}/g, ctx.circleOrTrack)
    .replace(/\{\{الجهة\}\}/g, ctx.circleOrTrack)
    .replace(/\{\{date\}\}/g, ctx.date)
    .replace(/\{\{التاريخ\}\}/g, ctx.date);
}

function parseStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim();
  if (s === "present" || s === "absent" || s === "excused") return s;
  return null;
}

async function requireAdminDept(auth: Awaited<ReturnType<typeof getAuth>>) {
  if (!requireAuth(auth)) return null;
  if (!requireRoles(auth, [...ADMIN_ROLES])) return null;
  return auth;
}

const STAFF_ROLE_CASE_SQL = `CASE
  WHEN COALESCE(u.is_admin, 0) = 1 THEN 'super_admin'
  WHEN COALESCE(u.is_educational, 0) = 1 THEN 'edu_supervisor'
  WHEN COALESCE(u.is_programs, 0) = 1 THEN 'programs_supervisor'
  WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
  WHEN COALESCE(u.is_teacher, 0) = 1 THEN 'teacher'
  ELSE 'teacher'
END AS role`;

async function staffListSql(env: Env): Promise<{ sql: string; flat: boolean }> {
  const hasRole = await tableHasColumn(env, "users", "role");
  const roleExpr = hasRole ? "u.role AS role" : STAFF_ROLE_CASE_SQL;
  const staffFilter = hasRole
    ? `u.role IN ('super_admin','admin_supervisor','edu_supervisor','programs_supervisor','prog_supervisor','track_supervisor','teacher')`
    : `(COALESCE(u.is_admin, 0) = 1 OR COALESCE(u.is_educational, 0) = 1 OR
        COALESCE(u.is_programs, 0) = 1 OR COALESCE(u.is_teacher, 0) = 1 OR
        COALESCE(u.is_track_supervisor, 0) = 1)`;

  return {
    flat: !hasRole,
    sql: `SELECT u.id AS user_id, u.full_name_ar, ${roleExpr},
                 sa.id AS attendance_id,
                 CASE WHEN sa.id IS NOT NULL THEN 1 ELSE 0 END AS has_record,
                 sa.status AS saved_status, sa.recorded_at
          FROM users u
          LEFT JOIN staff_attendance sa
            ON sa.user_id = u.id AND sa.attendance_date = ? AND sa.complex_id = ?
          WHERE u.complex_id = ? AND u.is_active = 1 AND ${staffFilter}
          ORDER BY u.full_name_ar`,
  };
}

async function assertCircleInComplex(
  env: Env,
  complexId: number,
  circleId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM circles WHERE id = ? AND complex_id = ?`,
  )
    .bind(circleId, complexId)
    .first<{ id: number }>();
  return Boolean(row);
}

async function getMaxPledges(env: Env, complexId: number): Promise<number> {
  const hasMax = await tableHasColumn(env, "complex_settings", "max_pledges_per_student");
  if (!hasMax) return 3;
  const row = await env.DB.prepare(
    `SELECT max_pledges_per_student FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(complexId)
    .first<{ max_pledges_per_student: number }>();
  return Number(row?.max_pledges_per_student ?? 3);
}

const PLEDGES_PAGE_LIMIT = 20;
const PLEDGES_CRITICAL_MIN = 3;

type PledgeSummaryRow = {
  student_id: number;
  full_name_ar: string;
  guardian_phone: string | null;
  pledge_count: number;
  latest_pledge_id: number | null;
  latest_reason: string | null;
  latest_pledge_date: string | null;
};

async function pledgeSummarySelectSql(
  env: Env,
  guardianCol: string,
  isActiveExpr: string,
): Promise<string> {
  return `SELECT s.id AS student_id, s.full_name_ar, ${guardianCol},
              COALESCE(d.pledge_count, pc.cnt, 0) AS pledge_count,
              lp.id AS latest_pledge_id,
              lp.reason_ar AS latest_reason,
              lp.pledge_date AS latest_pledge_date
       FROM students s
       INNER JOIN (
         SELECT student_id, COUNT(*) AS cnt
         FROM student_pledges
         WHERE complex_id = ?
         GROUP BY student_id
       ) pc ON pc.student_id = s.id
       LEFT JOIN student_disciplinary_summary d ON d.student_id = s.id
       LEFT JOIN student_pledges lp ON lp.id = (
         SELECT p2.id FROM student_pledges p2
         WHERE p2.student_id = s.id
         ORDER BY p2.pledge_date DESC, p2.id DESC
         LIMIT 1
       )
       WHERE s.complex_id = ? AND ${isActiveExpr}`;
}

async function loadPledgesSummaryList(
  env: Env,
  complexId: number,
  q?: string,
): Promise<PledgeSummaryRow[]> {
  const hasGuardian = await tableHasColumn(env, "students", "guardian_phone");
  const guardianCol = hasGuardian ? "s.guardian_phone" : "NULL AS guardian_phone";
  const hasNationalId = await tableHasColumn(env, "students", "national_id");
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const baseSql = await pledgeSummarySelectSql(env, guardianCol, isActiveExpr);

  if (q && q.trim().length > 0) {
    const term = q.trim();
    const like = `%${term}%`;
    const filters = ["s.full_name_ar LIKE ?"];
    const binds: (string | number)[] = [complexId, complexId, like];
    if (hasNationalId) {
      filters.push("s.national_id LIKE ?");
      binds.push(like);
    }
    if (/^\d+$/.test(term)) {
      filters.push("CAST(s.id AS TEXT) = ?");
      binds.push(term);
    }
    const rows = await env.DB.prepare(
      `${baseSql} AND (${filters.join(" OR ")})
       ORDER BY pledge_count DESC, s.full_name_ar`,
    )
      .bind(...binds)
      .all<PledgeSummaryRow>();
    return rows.results ?? [];
  }

  const critical = await env.DB.prepare(
    `${baseSql} AND COALESCE(d.pledge_count, pc.cnt, 0) >= ?
     ORDER BY pledge_count DESC, s.full_name_ar
     LIMIT ?`,
  )
    .bind(complexId, complexId, PLEDGES_CRITICAL_MIN, PLEDGES_PAGE_LIMIT)
    .all<PledgeSummaryRow>();
  const items = [...(critical.results ?? [])];
  if (items.length >= PLEDGES_PAGE_LIMIT) return items;

  const excludeIds = items.map((r) => r.student_id);
  const remaining = PLEDGES_PAGE_LIMIT - items.length;
  let recentSql = `${baseSql}`;
  const recentBinds: (string | number)[] = [complexId, complexId];
  if (excludeIds.length > 0) {
    recentSql += ` AND s.id NOT IN (${excludeIds.map(() => "?").join(",")})`;
    recentBinds.push(...excludeIds);
  }
  recentSql += ` ORDER BY lp.pledge_date DESC, lp.id DESC, pledge_count DESC LIMIT ?`;
  recentBinds.push(remaining);

  const recent = await env.DB.prepare(recentSql)
    .bind(...recentBinds)
    .all<PledgeSummaryRow>();
  return [...items, ...(recent.results ?? [])];
}

async function bumpPledgeSummary(env: Env, studentId: number): Promise<number> {
  if (await hasTable(env, "student_disciplinary_summary")) {
    await env.DB.prepare(
      `INSERT INTO student_disciplinary_summary (student_id, pledge_count, updated_at)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET
         pledge_count = pledge_count + 1,
         updated_at = datetime('now')`,
    )
      .bind(studentId)
      .run();

    const row = await env.DB.prepare(
      `SELECT pledge_count FROM student_disciplinary_summary WHERE student_id = ?`,
    )
      .bind(studentId)
      .first<{ pledge_count: number }>();
    return Number(row?.pledge_count ?? 0);
  }

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM student_pledges WHERE student_id = ?`,
  )
    .bind(studentId)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

async function syncPledgeSummary(env: Env, studentId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM student_pledges WHERE student_id = ?`,
  )
    .bind(studentId)
    .first<{ c: number }>();
  const count = Number(row?.c ?? 0);

  if (await hasTable(env, "student_disciplinary_summary")) {
    if (count === 0) {
      await env.DB.prepare(
        `DELETE FROM student_disciplinary_summary WHERE student_id = ?`,
      )
        .bind(studentId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO student_disciplinary_summary (student_id, pledge_count, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(student_id) DO UPDATE SET
           pledge_count = excluded.pledge_count,
           updated_at = datetime('now')`,
      )
        .bind(studentId, count)
        .run();
    }
  }

  return count;
}

export async function handleAdminDeptRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  const isAdminDeptPath = path.startsWith("/api/admin-dept/");
  const isStaffReportAlias = path === "/api/admin/staff/attendance";
  const isDashboardStatsAlias = path === "/api/admin/dashboard-stats";
  const isAttendanceAlias = path.startsWith("/api/admin/attendance");
  if (
    !isAdminDeptPath &&
    !isStaffReportAlias &&
    !isDashboardStatsAlias &&
    !isAttendanceAlias
  ) {
    return null;
  }

  try {
    return await handleAdminDeptRouterImpl(request, env, url, path);
  } catch (error: unknown) {
    console.error("[admin-dept] uncaught:", error);
    return json(
      {
        error: "admin_dept_error",
        message:
          error instanceof Error ? error.message : "Uncaught admin-dept error",
      },
      500,
    );
  }
}

/** Time O(n+m+d) students + summary + daily rows; Space O(n+m+d). */
async function buildSemesterExportPayload(
  env: Env,
  complexId: number,
  mode: "active" | "all",
): Promise<{
  semester: {
    start_date: string | null;
    end_date: string | null;
    active: boolean;
    semester_weeks: number;
    graduates_count: number;
    huffadh_count: number;
    export_range: { start: string; end: string };
  };
  students: Array<Record<string, unknown>>;
  attendance_summary: Array<{
    student_id: number;
    full_name_ar: string;
    present_days: number;
    absent_days: number;
    excused_days: number;
  }>;
  attendance_daily?: Array<{
    student_id: number;
    full_name_ar: string;
    attendance_date: string;
    status: string;
  }>;
  export_type: "standard" | "comprehensive";
  exported_at: string;
}> {
  const semester = await fetchSemesterPeriod(env, complexId);
  const semesterRange = semesterQueryRange(semester);
  const placement = await buildStudentPlacementSql(env);
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const hasFull = await tableHasColumn(env, "students", "full_name_ar");
  const nameSelect = hasFull ? "s.full_name_ar" : "s.name AS full_name_ar";
  const hasIsActive = await tableHasColumn(env, "students", "is_active");
  const rosterFilter = mode === "all" ? "1=1" : isActiveExpr;

  const studentSql = `
    SELECT
      s.id,
      ${nameSelect},
      ${(await tableHasColumn(env, "students", "national_id")) ? "s.national_id" : "NULL AS national_id"},
      ${(await tableHasColumn(env, "students", "phone")) ? "s.phone" : "NULL AS phone"},
      ${(await tableHasColumn(env, "students", "school_grade")) ? "s.school_grade" : "NULL AS school_grade"},
      ${hasIsActive ? "COALESCE(CAST(s.is_active AS INTEGER), 1) AS is_active" : "1 AS is_active"},
      c.name_ar AS circle_name,
      t.name_ar AS track_name
    FROM students s
    ${placement.historyJoin}
    ${placement.circleJoin}
    ${placement.trackJoin}
    WHERE s.complex_id = ? AND ${rosterFilter}
    ORDER BY ${hasFull ? "s.full_name_ar" : "s.name"}
    LIMIT 5000`;

  const students = await env.DB.prepare(studentSql)
    .bind(complexId)
    .all<{
      id: number;
      full_name_ar: string;
      national_id: string | null;
      phone: string | null;
      school_grade: string | null;
      is_active: number;
      circle_name: string | null;
      track_name: string | null;
    }>();

  const attTable = await resolveAttendanceTableName(env);
  let attendanceRows: Array<{
    student_id: number;
    full_name_ar: string;
    present_days: number;
    absent_days: number;
    excused_days: number;
  }> = [];
  let attendanceDaily: Array<{
    student_id: number;
    full_name_ar: string;
    attendance_date: string;
    status: string;
  }> | undefined;

  if (attTable) {
    const attSql = `
      SELECT s.id AS student_id, s.full_name_ar,
             SUM(CASE WHEN sa.status = 'present' THEN 1 ELSE 0 END) AS present_days,
             SUM(CASE WHEN sa.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
             SUM(CASE WHEN sa.status = 'excused' THEN 1 ELSE 0 END) AS excused_days
      FROM students s
      LEFT JOIN ${attTable} sa
        ON sa.student_id = s.id
       AND sa.complex_id = s.complex_id
       AND sa.attendance_date BETWEEN ? AND ?
      WHERE s.complex_id = ? AND ${rosterFilter}
      GROUP BY s.id, s.full_name_ar
      ORDER BY s.full_name_ar
      LIMIT 5000`;
    const attResult = await env.DB.prepare(attSql)
      .bind(semesterRange.start, semesterRange.end, complexId)
      .all<{
        student_id: number;
        full_name_ar: string;
        present_days: number;
        absent_days: number;
        excused_days: number;
      }>();
    attendanceRows = attResult.results ?? [];

    if (mode === "all") {
      const dailySql = `
        SELECT sa.student_id, s.full_name_ar, sa.attendance_date, sa.status
        FROM ${attTable} sa
        INNER JOIN students s ON s.id = sa.student_id AND s.complex_id = sa.complex_id
        WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
        ORDER BY sa.attendance_date, s.full_name_ar
        LIMIT 50000`;
      const dailyResult = await env.DB.prepare(dailySql)
        .bind(complexId, semesterRange.start, semesterRange.end)
        .all<{
          student_id: number;
          full_name_ar: string;
          attendance_date: string;
          status: string;
        }>();
      attendanceDaily = dailyResult.results ?? [];
    }
  }

  const settings = await env.DB.prepare(
    `SELECT semester_weeks, graduates_count, huffadh_count FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(complexId)
    .first<{
      semester_weeks: number;
      graduates_count: number;
      huffadh_count: number;
    }>();

  const studentRows = (students.results ?? []).map((s) => ({
    id: s.id,
    full_name_ar: s.full_name_ar,
    national_id: s.national_id,
    phone: s.phone,
    school_grade: s.school_grade,
    circle_name: s.circle_name,
    track_name: s.track_name,
    ...(mode === "all"
      ? {
          is_archived: s.is_active === 0,
        }
      : {}),
  }));

  return {
    semester: {
      start_date: semester.start_date,
      end_date: semester.end_date,
      active: semester.active,
      semester_weeks: settings?.semester_weeks ?? 16,
      graduates_count: settings?.graduates_count ?? 0,
      huffadh_count: settings?.huffadh_count ?? 0,
      export_range: semesterRange,
    },
    students: studentRows,
    attendance_summary: attendanceRows,
    ...(mode === "all" && attendanceDaily ? { attendance_daily: attendanceDaily } : {}),
    export_type: mode === "all" ? "comprehensive" : "standard",
    exported_at: new Date().toISOString(),
  };
}

async function handleAdminDeptRouterImpl(
  request: Request,
  env: Env,
  url: URL,
  path: string,
): Promise<Response | null> {
  const auth = await getAuth(request, env);
  const admin = await requireAdminDept(auth);
  if (!admin) {
    if (!requireAuth(auth)) return authUnauthorizedResponse(request);
    return json({ error: "forbidden" }, 403);
  }

  // GET /api/admin-dept/staff
  if (request.method === "GET" && path === "/api/admin-dept/staff") {
    const date = url.searchParams.get("date")?.trim() || todayRiyadhIso();
    const pageParams = parsePageParams(url);
    const { sql } = await staffListSql(env);
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM (${sql})`,
    )
      .bind(date, admin.complexId, admin.complexId)
      .first<{ c: number }>();
    const total = Number(countRow?.c ?? 0);

    const rows = await env.DB.prepare(`${sql} LIMIT ? OFFSET ?`)
      .bind(date, admin.complexId, admin.complexId, pageParams.pageSize, pageParams.offset)
      .all<{
        user_id: number;
        full_name_ar: string;
        role?: string;
        attendance_id: number | null;
        has_record: number;
        saved_status: string | null;
        recorded_at: string | null;
      }>();

    const items = (rows.results ?? []).map((r) => ({
      user_id: r.user_id,
      full_name_ar: r.full_name_ar,
      role:
        typeof r.role === "string" && r.role.trim().length > 0
          ? r.role.trim()
          : null,
      attendance_id: r.attendance_id ?? null,
      has_record: Number(r.has_record ?? 0) === 1,
      status: r.saved_status ?? "present",
      recorded_at: r.recorded_at,
    }));

    return json({
      date,
      items,
      default_status: "present",
      page: pageMeta(total, pageParams),
    });
  }

  // GET /api/admin-dept/staff/attendance | GET /api/admin/staff/attendance (تقرير مجمّع)
  if (
    request.method === "GET" &&
    (path === "/api/admin-dept/staff/attendance" || path === "/api/admin/staff/attendance")
  ) {
    const start =
      url.searchParams.get("start")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      todayRiyadhIso();
    const end =
      url.searchParams.get("end")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      start;
    if (start > end) {
      return json({ error: "invalid_date_range", start, end }, 400);
    }

    const hasRole = await tableHasColumn(env, "users", "role");
    const roleFilter = hasRole
      ? `u.role IN ('super_admin','admin_supervisor','edu_supervisor','programs_supervisor','prog_supervisor','track_supervisor','teacher')`
      : `(COALESCE(u.is_admin, 0) = 1 OR COALESCE(u.is_educational, 0) = 1 OR COALESCE(u.is_programs, 0) = 1 OR COALESCE(u.is_teacher, 0) = 1 OR COALESCE(u.is_track_supervisor, 0) = 1)`;

    const roleCol = hasRole ? "u.role," : "";
    const rows = await env.DB.prepare(
      `SELECT u.id AS user_id, u.full_name_ar, ${roleCol}
              SUM(CASE WHEN sa.status = 'present' THEN 1 ELSE 0 END) AS present_days,
              SUM(CASE WHEN sa.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
              SUM(CASE WHEN sa.status = 'excused' THEN 1 ELSE 0 END) AS excused_days
       FROM users u
       LEFT JOIN staff_attendance sa
         ON sa.user_id = u.id
        AND sa.complex_id = ?
        AND sa.attendance_date >= ?
        AND sa.attendance_date <= ?
       WHERE u.complex_id = ? AND u.is_active = 1 AND ${roleFilter}
       GROUP BY u.id
       ORDER BY u.full_name_ar`,
    )
      .bind(admin.complexId, start, end, admin.complexId)
      .all<{
        user_id: number;
        full_name_ar: string;
        role?: string;
        present_days: number;
        absent_days: number;
        excused_days: number;
      }>();

    let complexName: string | null = null;
    if (await hasTable(env, "complexes")) {
      const cx = await env.DB.prepare(`SELECT name_ar FROM complexes WHERE id = ?`)
        .bind(admin.complexId)
        .first<{ name_ar: string }>();
      complexName = cx?.name_ar ?? null;
    }

    const items = (rows.results ?? []).map((r) => ({
      user_id: r.user_id,
      full_name_ar: r.full_name_ar,
      role: r.role ?? null,
      present_days: Number(r.present_days ?? 0),
      absent_days: Number(r.absent_days ?? 0),
      excused_days: Number(r.excused_days ?? 0),
    }));

    return json({
      start_date: start,
      end_date: end,
      complex_name: complexName,
      items,
    });
  }

  // POST /api/admin-dept/staff/attendance
  if (request.method === "POST" && path === "/api/admin-dept/staff/attendance") {
    let body: {
      attendance_date?: string;
      records?: Array<{ user_id?: number; status?: string }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const date = body.attendance_date?.trim() || todayRiyadhIso();
    const records = body.records ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "records_required" }, 400);
    }

    const batchRecords = [];
    for (const rec of records) {
      const userId = Number(rec.user_id);
      const status = parseStatus(rec.status) ?? "present";
      if (!Number.isFinite(userId)) continue;
      const staffOk = await env.DB.prepare(
        `SELECT id FROM users WHERE id = ? AND complex_id = ? AND is_active = 1`,
      )
        .bind(userId, admin.complexId)
        .first();
      if (!staffOk) continue;
      batchRecords.push({ user_id: userId, status });
    }

    const saved = await batchSaveStaffAttendance(
      env,
      admin.complexId,
      admin.userId,
      date,
      batchRecords,
    );

    return json({ ok: true, attendance_date: date, saved });
  }

  // GET /api/admin-dept/students/attendance/entity-status — حالة محضّر اليوم لكل حلقة/مسار
  if (
    request.method === "GET" &&
    path === "/api/admin-dept/students/attendance/entity-status"
  ) {
    const date = url.searchParams.get("date")?.trim() || todayRiyadhIso();
    const status = await loadEntityAttendanceStatus(
      env,
      admin.complexId,
      date,
    );
    return json({ date, ...status });
  }

  // GET /api/admin-dept/students/attendance/track/:trackId
  const trackAttGet = path.match(
    /^\/api\/admin-dept\/students\/attendance\/track\/(\d+)$/,
  );
  if (request.method === "GET" && trackAttGet) {
    const trackId = Number(trackAttGet[1]);
    if (!Number.isFinite(trackId)) {
      return json({ error: "invalid_track_id" }, 400);
    }
    if (!(await assertTrackInComplex(env, admin.complexId, trackId))) {
      return json({ error: "track_not_found" }, 404);
    }

    const date = url.searchParams.get("date")?.trim() || todayRiyadhIso();
    const pageParams = parsePageParams(url);
    const loaded = await loadStudentsForEntityAttendance(
      env,
      admin.complexId,
      { type: "track", id: trackId },
      date,
      pageParams,
    );
    if ("error" in loaded) {
      return json(loaded, loaded.error === "migration_required" ? 503 : 500);
    }

    const track = await env.DB.prepare(
      `SELECT id, name_ar FROM tracks WHERE id = ? AND complex_id = ?`,
    )
      .bind(trackId, admin.complexId)
      .first<{ id: number; name_ar: string }>();

    return json({
      attendance_date: date,
      entity_type: "track",
      track,
      items: loaded.items,
      default_status: "present",
      page: loaded.page,
    });
  }

  // GET /api/admin-dept/students/attendance/:circleId
  const circleAttGet = path.match(/^\/api\/admin-dept\/students\/attendance\/(\d+)$/);
  if (request.method === "GET" && circleAttGet) {
    const circleId = Number(circleAttGet[1]);
    if (!Number.isFinite(circleId)) {
      return json({ error: "invalid_circle_id" }, 400);
    }
    if (!(await assertCircleInComplex(env, admin.complexId, circleId))) {
      return json({ error: "circle_not_found" }, 404);
    }

    const date = url.searchParams.get("date")?.trim() || todayRiyadhIso();
    const pageParams = parsePageParams(url);
    const loaded = await loadStudentsForEntityAttendance(
      env,
      admin.complexId,
      { type: "circle", id: circleId },
      date,
      pageParams,
    );
    if ("error" in loaded) {
      return json(loaded, loaded.error === "migration_required" ? 503 : 500);
    }

    const circle = await circleLabelRow(env, circleId);

    return json({
      attendance_date: date,
      entity_type: "circle",
      circle,
      items: loaded.items,
      default_status: "present",
      page: loaded.page,
    });
  }

  // POST /api/admin-dept/students/attendance
  if (request.method === "POST" && path === "/api/admin-dept/students/attendance") {
    let body: {
      circle_id?: number;
      track_id?: number;
      attendance_date?: string;
      records?: Array<{ student_id?: number; status?: string; notes?: string }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const entity = parseAttendanceEntity(body);
    if (!entity) {
      return json(
        { error: "entity_required", hint: "circle_id XOR track_id" },
        400,
      );
    }

    if (entity.type === "circle") {
      if (!(await assertCircleInComplex(env, admin.complexId, entity.id))) {
        return json({ error: "circle_not_found" }, 404);
      }
    } else if (!(await assertTrackInComplex(env, admin.complexId, entity.id))) {
      return json({ error: "track_not_found" }, 404);
    }

    const date = body.attendance_date?.trim() || todayRiyadhIso();
    const records = body.records ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "records_required" }, 400);
    }

    const batchRecords: Array<{
      student_id: number;
      status: AttendanceStatus;
      notes?: string | null;
    }> = [];

    for (const rec of records) {
      const studentId = Number(rec.student_id);
      const status = parseStatus(rec.status);
      if (!Number.isFinite(studentId) || !status) continue;

      const allowed = await studentBelongsToEntity(
        env,
        admin.complexId,
        studentId,
        entity,
      );
      if (!allowed) continue;
      batchRecords.push({
        student_id: studentId,
        status,
        notes: rec.notes?.trim() ?? null,
      });
    }

    const saved = await batchSaveStudentAttendance(env, {
      complexId: admin.complexId,
      attendanceDate: date,
      circleId: entity.type === "circle" ? entity.id : null,
      trackId: entity.type === "track" ? entity.id : null,
      source: "admin_supervisor",
      recordedByUserId: admin.userId,
      records: batchRecords,
    });

    return json({
      ok: true,
      attendance_date: date,
      entity_type: entity.type,
      circle_id: entity.type === "circle" ? entity.id : null,
      track_id: entity.type === "track" ? entity.id : null,
      saved,
    });
  }

  // GET /api/admin-dept/students/attendance/report — ملخص تحضير الطلاب بالحلقة والفترة
  if (
    request.method === "GET" &&
    path === "/api/admin-dept/students/attendance/report"
  ) {
    const start =
      url.searchParams.get("start")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      todayRiyadhIso();
    const end =
      url.searchParams.get("end")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      start;
    const circleId = Number(url.searchParams.get("circle_id"));
    if (start > end) {
      return json({ error: "invalid_date_range", start, end }, 400);
    }
    if (!Number.isFinite(circleId)) {
      return json({ error: "circle_id_required" }, 400);
    }
    if (!(await assertCircleInComplex(env, admin.complexId, circleId))) {
      return json({ error: "circle_not_found" }, 404);
    }
    if (!(await tableHasColumn(env, "students", "current_circle_id"))) {
      return json(
        {
          error: "migration_required",
          hint: "students.current_circle_id — run D1 migrate 025",
        },
        503,
      );
    }

    const attTable = await resolveAttendanceTableName(env);
    if (!attTable) {
      return json({ error: "migration_required", table: "student_attendance" }, 503);
    }

    const rows = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar,
              SUM(CASE WHEN sa.status = 'present' THEN 1 ELSE 0 END) AS present_days,
              SUM(CASE WHEN sa.status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
              SUM(CASE WHEN sa.status = 'excused' THEN 1 ELSE 0 END) AS excused_days
       FROM students s
       LEFT JOIN ${attTable} sa
         ON sa.student_id = s.id
        AND sa.attendance_date >= ?
        AND sa.attendance_date <= ?
       WHERE s.complex_id = ? AND COALESCE(s.is_active, 1) = 1
         AND s.current_circle_id = ?
       GROUP BY s.id
       ORDER BY s.full_name_ar`,
    )
      .bind(start, end, admin.complexId, circleId)
      .all<{
        student_id: number;
        full_name_ar: string;
        present_days: number;
        absent_days: number;
        excused_days: number;
      }>();

    const circle = await circleLabelRow(env, circleId);
    const complex = await env.DB.prepare(
      `SELECT name_ar FROM complexes WHERE id = ?`,
    )
      .bind(admin.complexId)
      .first<{ name_ar: string }>();

    return json({
      start_date: start,
      end_date: end,
      circle_id: circleId,
      circle,
      complex_name: complex?.name_ar ?? null,
      items: (rows.results ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        present_days: Number(r.present_days ?? 0),
        absent_days: Number(r.absent_days ?? 0),
        excused_days: Number(r.excused_days ?? 0),
      })),
    });
  }

  // GET /api/admin-dept/students/absent-today
  if (request.method === "GET" && path === "/api/admin-dept/students/absent-today") {
    const date = url.searchParams.get("date")?.trim() || todayRiyadhIso();
    const circleIdParam = url.searchParams.get("circle_id");
    const circleId = circleIdParam ? Number(circleIdParam) : null;
    const trackIdParam = url.searchParams.get("track_id");
    const trackId = trackIdParam ? Number(trackIdParam) : null;

    const attTable = await resolveAttendanceTableName(env);
    if (!attTable) {
      return json({ error: "migration_required", table: "student_attendance" }, 503);
    }

    const placement = await buildStudentPlacementSql(env);
    const isActiveExpr = await studentAttendanceEligibleSql(env, "s");
    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");

    const placementParts: string[] = [];
    if (hasCurrentCircle) placementParts.push("s.current_circle_id IS NOT NULL");
    if (hasCurrentTrack) placementParts.push("s.current_track_id IS NOT NULL");
    if (placement.circleRef !== "NULL") {
      placementParts.push(`${placement.circleRef} IS NOT NULL`);
    }
    if (placement.trackRef !== "NULL") {
      placementParts.push(`${placement.trackRef} IS NOT NULL`);
    }
    const placementFilter =
      placementParts.length > 0 ? `(${placementParts.join(" OR ")})` : "1=1";

    let sql = `
      SELECT s.id AS student_id, s.full_name_ar, s.guardian_phone, s.stage_id,
             sa.status,
             c.id AS circle_id, c.name_ar AS circle_name,
             t.id AS track_id, t.name_ar AS track_name
      FROM students s
      INNER JOIN ${attTable} sa
        ON sa.student_id = s.id
       AND sa.attendance_date = ?
       AND sa.complex_id = s.complex_id
      ${placement.historyJoin}
      ${placement.circleJoin}
      ${placement.trackJoin}
      WHERE s.complex_id = ? AND ${isActiveExpr}
        AND sa.status IN ('absent', 'excused')
        AND ${placementFilter}`;
    const binds: (number | string)[] = [date, admin.complexId];

    if (circleId != null && Number.isFinite(circleId)) {
      if (await hasTable(env, "track_circles")) {
        sql += ` AND (
          ${placement.circleRef} = ?
          OR ${placement.trackRef} IN (
            SELECT tc.track_id FROM track_circles tc WHERE tc.circle_id = ?
          )
        )`;
        binds.push(circleId, circleId);
      } else {
        sql += ` AND ${placement.circleRef} = ?`;
        binds.push(circleId);
      }
    } else if (trackId != null && Number.isFinite(trackId)) {
      sql += ` AND ${placement.trackRef} = ?`;
      binds.push(trackId);
    }

    sql += ` ORDER BY COALESCE(c.name_ar, t.name_ar), s.full_name_ar`;

    const rows = await env.DB.prepare(sql).bind(...binds).all();

    const hasTemplate = await tableHasColumn(
      env,
      "complex_settings",
      "whatsapp_absence_template_ar",
    );
    let template =
      "السلام عليكم، نود إبلاغكم بغياب الطالب {{student_name}} عن الحلقة اليوم {{date}}.";
    if (hasTemplate) {
      const t = await env.DB.prepare(
        `SELECT whatsapp_absence_template_ar FROM complex_settings WHERE complex_id = ?`,
      )
        .bind(admin.complexId)
        .first<{ whatsapp_absence_template_ar: string }>();
      if (t?.whatsapp_absence_template_ar) template = t.whatsapp_absence_template_ar;
    }

    const items = (rows.results ?? []).map((r: Record<string, unknown>) => {
      const name = String(r.full_name_ar ?? "");
      const circleOrTrack = String(
        r.circle_name ?? r.track_name ?? "الحلقة أو المسار",
      );
      const msg = applyWhatsappAbsenceTemplate(template, {
        studentName: name,
        circleOrTrack,
        date,
      });
      const phone = String(r.guardian_phone ?? "").replace(/\D/g, "");
      const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : null;
      return { ...r, whatsapp_message: msg, whatsapp_url: waUrl };
    });

    return json({ date, items, template });
  }

  // GET /api/admin-dept/students/absent-today/template
  if (
    request.method === "GET" &&
    path === "/api/admin-dept/students/absent-today/template"
  ) {
    const hasTemplate = await tableHasColumn(
      env,
      "complex_settings",
      "whatsapp_absence_template_ar",
    );
    const defaultTemplate =
      "السلام عليكم، نود إبلاغكم بغياب الطالب {{student_name}} عن {{الحلقة_أو_المسار}} يوم {{date}}.";
    if (!hasTemplate) {
      return json({ template: defaultTemplate, migration_required: true });
    }
    const row = await env.DB.prepare(
      `SELECT whatsapp_absence_template_ar FROM complex_settings WHERE complex_id = ?`,
    )
      .bind(admin.complexId)
      .first<{ whatsapp_absence_template_ar: string | null }>();
    return json({
      template: row?.whatsapp_absence_template_ar?.trim() || defaultTemplate,
    });
  }

  // PUT /api/admin-dept/students/absent-today/template
  if (
    request.method === "PUT" &&
    path === "/api/admin-dept/students/absent-today/template"
  ) {
    const hasTemplate = await tableHasColumn(
      env,
      "complex_settings",
      "whatsapp_absence_template_ar",
    );
    if (!hasTemplate) {
      return json(
        { error: "migration_required", column: "whatsapp_absence_template_ar" },
        503,
      );
    }

    let body: { template?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const template = body.template?.trim();
    if (!template) {
      return json({ error: "template_required" }, 400);
    }

    const updated = await env.DB.prepare(
      `UPDATE complex_settings
       SET whatsapp_absence_template_ar = ?, updated_at = datetime('now')
       WHERE complex_id = ?`,
    )
      .bind(template, admin.complexId)
      .run();

    if ((updated.meta.changes ?? 0) === 0) {
      return json({ error: "complex_settings_not_found" }, 404);
    }

    return json({ ok: true, template });
  }

  // POST /api/admin-dept/pledges
  if (request.method === "POST" && path === "/api/admin-dept/pledges") {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    let body: { student_id?: number; reason_ar?: string; pledge_date?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    const reason = body.reason_ar?.trim();
    const pledgeDate = body.pledge_date?.trim() || todayRiyadhIso();

    if (!Number.isFinite(studentId) || !reason) {
      return json({ error: "student_id_and_reason_required" }, 400);
    }

    const isActiveExpr = await studentIsActiveSql(env, "");
    const student = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students WHERE id = ? AND complex_id = ? AND ${isActiveExpr}`,
    )
      .bind(studentId, admin.complexId)
      .first<{ id: number; full_name_ar: string }>();

    if (!student) return json({ error: "student_not_found" }, 404);

    const ins = await env.DB.prepare(
      `INSERT INTO student_pledges (complex_id, student_id, reason_ar, pledge_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(admin.complexId, studentId, reason, pledgeDate, admin.userId)
      .run();

    const pledgeCount = await bumpPledgeSummary(env, studentId);
    const maxPledges = await getMaxPledges(env, admin.complexId);

    return json({
      ok: true,
      pledge_id: ins.meta.last_row_id,
      student_id: studentId,
      pledge_count: pledgeCount,
      max_pledges: maxPledges,
      threshold_reached: pledgeCount >= maxPledges,
      alert:
        pledgeCount >= maxPledges
          ? `بلغ الطالب ${student.full_name_ar} الحد الأعلى للتعهدات (${maxPledges}).`
          : null,
    });
  }

  // PATCH /api/admin-dept/pledges/entry/:id
  const pledgeEntryPatch = path.match(/^\/api\/admin-dept\/pledges\/entry\/(\d+)$/);
  if (request.method === "PATCH" && pledgeEntryPatch) {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const pledgeId = Number(pledgeEntryPatch[1]);
    let body: { reason_ar?: string; pledge_date?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const existing = await env.DB.prepare(
      `SELECT id, student_id FROM student_pledges
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(pledgeId, admin.complexId)
      .first<{ id: number; student_id: number }>();
    if (!existing) return json({ error: "pledge_not_found" }, 404);

    const reason = body.reason_ar?.trim();
    const pledgeDate = body.pledge_date?.trim();
    if (!reason && !pledgeDate) {
      return json({ error: "reason_or_date_required" }, 400);
    }

    if (reason) {
      await env.DB.prepare(`UPDATE student_pledges SET reason_ar = ? WHERE id = ?`)
        .bind(reason, pledgeId)
        .run();
    }
    if (pledgeDate) {
      await env.DB.prepare(`UPDATE student_pledges SET pledge_date = ? WHERE id = ?`)
        .bind(pledgeDate, pledgeId)
        .run();
    }

    const pledgeCount = await syncPledgeSummary(env, existing.student_id);
    const maxPledges = await getMaxPledges(env, admin.complexId);

    return json({
      ok: true,
      pledge_id: pledgeId,
      student_id: existing.student_id,
      pledge_count: pledgeCount,
      max_pledges: maxPledges,
      threshold_reached: pledgeCount >= maxPledges,
    });
  }

  // DELETE /api/admin-dept/pledges/entry/:id
  const pledgeEntryDelete = path.match(/^\/api\/admin-dept\/pledges\/entry\/(\d+)$/);
  if (request.method === "DELETE" && pledgeEntryDelete) {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const pledgeId = Number(pledgeEntryDelete[1]);
    const existing = await env.DB.prepare(
      `SELECT id, student_id FROM student_pledges
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(pledgeId, admin.complexId)
      .first<{ id: number; student_id: number }>();
    if (!existing) return json({ error: "pledge_not_found" }, 404);

    await env.DB.prepare(`DELETE FROM student_pledges WHERE id = ?`)
      .bind(pledgeId)
      .run();

    const pledgeCount = await syncPledgeSummary(env, existing.student_id);
    const maxPledges = await getMaxPledges(env, admin.complexId);

    return json({
      ok: true,
      student_id: existing.student_id,
      pledge_count: pledgeCount,
      max_pledges: maxPledges,
      threshold_reached: pledgeCount >= maxPledges,
    });
  }

  // DELETE /api/admin-dept/pledges/student/:studentId — حذف كل تعهدات الطالب
  const pledgeStudentDelete = path.match(
    /^\/api\/admin-dept\/pledges\/student\/(\d+)$/,
  );
  if (request.method === "DELETE" && pledgeStudentDelete) {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const studentId = Number(pledgeStudentDelete[1]);
    const student = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students WHERE id = ? AND complex_id = ?`,
    )
      .bind(studentId, admin.complexId)
      .first<{ id: number; full_name_ar: string }>();
    if (!student) return json({ error: "student_not_found" }, 404);

    const del = await env.DB.prepare(
      `DELETE FROM student_pledges WHERE student_id = ? AND complex_id = ?`,
    )
      .bind(studentId, admin.complexId)
      .run();

    await syncPledgeSummary(env, studentId);

    return json({
      ok: true,
      student_id: studentId,
      deleted: Number(del.meta.changes ?? 0),
      pledge_count: 0,
    });
  }

  // GET /api/admin-dept/pledges — جدول ملخص التعهدات (ذكي + بحث)
  if (request.method === "GET" && path === "/api/admin-dept/pledges") {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }
    const q = url.searchParams.get("q")?.trim() ?? "";
    const items = await loadPledgesSummaryList(env, admin.complexId, q || undefined);
    return json({
      items,
      mode: q ? "search" : "smart",
      limit: q ? null : PLEDGES_PAGE_LIMIT,
    });
  }

  // GET /api/admin-dept/pledges/:studentId
  const pledgeGet = path.match(/^\/api\/admin-dept\/pledges\/(\d+)$/);
  if (request.method === "GET" && pledgeGet) {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const studentId = Number(pledgeGet[1]);
    const hasGuardian = await tableHasColumn(env, "students", "guardian_phone");
    const guardianCol = hasGuardian ? "guardian_phone" : "NULL AS guardian_phone";
    const student = await env.DB.prepare(
      `SELECT id, full_name_ar, stage_id, current_circle_id, ${guardianCol}
       FROM students
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(studentId, admin.complexId)
      .first();

    if (!student) return json({ error: "student_not_found" }, 404);

    const pledges = await env.DB.prepare(
      `SELECT p.id, p.reason_ar, p.pledge_date, p.created_at, u.full_name_ar AS created_by_name
       FROM student_pledges p
       LEFT JOIN users u ON u.id = p.created_by_user_id
       WHERE p.student_id = ?
       ORDER BY p.pledge_date DESC, p.created_at DESC`,
    )
      .bind(studentId)
      .all();

    const summary = await env.DB.prepare(
      `SELECT pledge_count FROM student_disciplinary_summary WHERE student_id = ?`,
    )
      .bind(studentId)
      .first<{ pledge_count: number }>();

    const pledgeCount = Number(summary?.pledge_count ?? pledges.results?.length ?? 0);
    const maxPledges = await getMaxPledges(env, admin.complexId);

    return json({
      student,
      pledges: pledges.results ?? [],
      pledge_count: pledgeCount,
      max_pledges: maxPledges,
      threshold_reached: pledgeCount >= maxPledges,
      stage_labels: STAGE_LABELS,
    });
  }

  // GET /api/admin/attendance/ledger — سجل التحضير التاريخي (نطاق زمني)
  if (
    request.method === "GET" &&
    (path === "/api/admin/attendance/ledger" ||
      path === "/api/admin-dept/attendance/ledger")
  ) {
    const beneficiaryType = parseBeneficiaryType(
      url.searchParams.get("beneficiary_type"),
    );
    if (!beneficiaryType) {
      return json({ error: "invalid_beneficiary_type" }, 400);
    }
    const result = await fetchAttendanceLedger(env, admin.complexId, {
      beneficiary_type: beneficiaryType,
      start_date: url.searchParams.get("start_date") ?? undefined,
      end_date: url.searchParams.get("end_date") ?? undefined,
      attendance_date: url.searchParams.get("date") ?? undefined,
      circle_id: Number(url.searchParams.get("circle_id")) || undefined,
      track_id: Number(url.searchParams.get("track_id")) || undefined,
    });
    if ("error" in result) {
      return json(result, 400);
    }
    return json({
      start_date: result.start_date,
      end_date: result.end_date,
      beneficiary_type: beneficiaryType,
      items: result.items,
      count: result.items.length,
    });
  }

  // POST /api/admin/attendance — upsert سجل واحد (إنشاء أو تحديث بدون معرّف)
  if (
    request.method === "POST" &&
    (path === "/api/admin/attendance" || path === "/api/admin-dept/attendance")
  ) {
    let body: {
      beneficiary_type?: string;
      person_id?: number;
      attendance_date?: string;
      status?: string;
      circle_id?: number;
      track_id?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const beneficiaryType = parseBeneficiaryType(body.beneficiary_type);
    const status = parseStatus(body.status);
    if (!beneficiaryType) {
      return json({ error: "invalid_beneficiary_type" }, 400);
    }
    if (!status) return json({ error: "invalid_status" }, 400);
    const date = body.attendance_date?.trim() || todayRiyadhIso();
    const result = await upsertAttendanceRecord(env, admin.complexId, admin.userId, {
      beneficiary_type: beneficiaryType,
      person_id: Number(body.person_id),
      attendance_date: date,
      status,
      circle_id: body.circle_id,
      track_id: body.track_id,
    });
    if ("error" in result) {
      const code = result.error === "not_found" ? 404 : 400;
      return json(result, code);
    }
    return json({ ok: true, attendance_id: result.attendance_id, attendance_date: date });
  }

  // PATCH /api/admin/attendance/:id
  const attPatch = path.match(/^\/api\/admin(?:-dept)?\/attendance\/(\d+)$/);
  if (request.method === "PATCH" && attPatch) {
    let body: { beneficiary_type?: string; status?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const beneficiaryType = parseBeneficiaryType(body.beneficiary_type);
    const status = parseStatus(body.status);
    const attendanceId = Number(attPatch[1]);
    if (!beneficiaryType) {
      return json({ error: "invalid_beneficiary_type" }, 400);
    }
    if (!status) return json({ error: "invalid_status" }, 400);
    if (!Number.isFinite(attendanceId)) {
      return json({ error: "invalid_id" }, 400);
    }
    const result = await patchAttendanceById(
      env,
      admin.complexId,
      attendanceId,
      beneficiaryType,
      status,
      admin.userId,
    );
    if ("error" in result) {
      return json(result, result.error === "not_found" ? 404 : 400);
    }
    return json({ ok: true, id: result.id, status });
  }

  // DELETE /api/admin/attendance/:id
  const attDelete = path.match(/^\/api\/admin(?:-dept)?\/attendance\/(\d+)$/);
  if (request.method === "DELETE" && attDelete) {
    const beneficiaryType = parseBeneficiaryType(
      url.searchParams.get("beneficiary_type"),
    );
    const attendanceId = Number(attDelete[1]);
    if (!beneficiaryType) {
      return json({ error: "beneficiary_type_required" }, 400);
    }
    if (!Number.isFinite(attendanceId)) {
      return json({ error: "invalid_id" }, 400);
    }
    const result = await deleteAttendanceById(
      env,
      admin.complexId,
      attendanceId,
      beneficiaryType,
    );
    if ("error" in result) {
      return json(result, 400);
    }
    return json({ ok: true, deleted: result.deleted });
  }

  // PATCH /api/admin/attendance/bulk — تحديث جماعي للسجلات
  if (
    request.method === "PATCH" &&
    (path === "/api/admin/attendance/bulk" ||
      path === "/api/admin-dept/attendance/bulk")
  ) {
    let body: {
      beneficiary_type?: string;
      records?: Array<{
        attendance_id?: number;
        person_id?: number;
        attendance_date?: string;
        status?: string;
        circle_id?: number;
        track_id?: number;
      }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const beneficiaryType = parseBeneficiaryType(body.beneficiary_type);
    if (!beneficiaryType) {
      return json({ error: "invalid_beneficiary_type" }, 400);
    }
    const result = await bulkPatchAttendanceRecords(
      env,
      admin.complexId,
      admin.userId,
      beneficiaryType,
      body.records ?? [],
    );
    if ("error" in result) {
      return json(result, 400);
    }
    return json({ ok: true, saved: result.saved });
  }

  // DELETE /api/admin/attendance/bulk — حذف جماعي (يوم / نطاق / معرّفات)
  if (
    request.method === "DELETE" &&
    (path === "/api/admin/attendance/bulk" ||
      path === "/api/admin-dept/attendance/bulk")
  ) {
    let body: {
      beneficiary_type?: string;
      attendance_date?: string;
      start_date?: string;
      end_date?: string;
      circle_id?: number;
      track_id?: number;
      attendance_ids?: number[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const beneficiaryType = parseBeneficiaryType(body.beneficiary_type);
    if (!beneficiaryType) {
      return json({ error: "invalid_beneficiary_type" }, 400);
    }

    const hasRange =
      Boolean(body.start_date?.trim()) ||
      Boolean(body.end_date?.trim()) ||
      (body.attendance_ids?.length ?? 0) > 0;

    if (hasRange) {
      const result = await bulkClearAttendanceRange(env, admin.complexId, {
        beneficiary_type: beneficiaryType,
        attendance_date: body.attendance_date,
        start_date: body.start_date,
        end_date: body.end_date,
        circle_id: body.circle_id,
        track_id: body.track_id,
        attendance_ids: body.attendance_ids,
      });
      if ("error" in result) {
        return json(result, 400);
      }
      return json({
        ok: true,
        deleted: result.deleted,
        start_date: result.start_date,
        end_date: result.end_date,
      });
    }

    const result = await bulkClearAttendanceDay(env, admin.complexId, {
      beneficiary_type: beneficiaryType,
      attendance_date: body.attendance_date?.trim() || todayRiyadhIso(),
      circle_id: body.circle_id,
      track_id: body.track_id,
    });
    if ("error" in result) {
      return json(result, 400);
    }
    return json({
      ok: true,
      deleted: result.deleted,
      attendance_date: body.attendance_date?.trim() || todayRiyadhIso(),
    });
  }

  // GET /api/admin-dept/dashboard-stats | GET /api/admin/dashboard-stats
  if (
    request.method === "GET" &&
    (path === "/api/admin-dept/dashboard-stats" ||
      path === "/api/admin/dashboard-stats")
  ) {
    const stats = await fetchAdminDashboardStats(env, admin.complexId);
    return json(stats);
  }

  // GET /api/admin-dept/reports
  if (request.method === "GET" && path === "/api/admin-dept/reports") {
    const semester = await fetchSemesterPeriod(env, admin.complexId);
    const semesterRange = semesterQueryRange(semester);
    const startDate =
      url.searchParams.get("startDate")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      semesterRange.start;
    const endDate =
      url.searchParams.get("endDate")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      semesterRange.end;
    const statusFilter = (
      url.searchParams.get("status")?.trim() || "all"
    ).toLowerCase();
    const typeFilter = (
      url.searchParams.get("type")?.trim() || "all"
    ).toLowerCase();

    const absentOnly = statusFilter === "absent_only" || statusFilter === "absent";
    const includeStaff = typeFilter === "all" || typeFilter === "staff";
    const includeStudents = typeFilter === "all" || typeFilter === "student";
    const includeItems = url.searchParams.get("include_items") !== "false";
    const isActiveExpr = await studentAttendanceEligibleSql(env, "s");

    type ReportRow = {
      name: string;
      date: string;
      status: string;
      type: "staff" | "student";
    };
    const items: ReportRow[] = [];

    if (includeItems && includeStaff && (await hasTable(env, "staff_attendance"))) {
      let staffSql = `
        SELECT u.full_name_ar AS name, sa.attendance_date AS date, sa.status
        FROM staff_attendance sa
        JOIN users u ON u.id = sa.user_id
        WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
          AND u.is_active = 1`;
      if (absentOnly) staffSql += ` AND sa.status IN ('absent', 'excused')`;
      staffSql += ` ORDER BY sa.attendance_date DESC, u.full_name_ar`;
      const staffRows = await env.DB.prepare(staffSql)
        .bind(admin.complexId, startDate, endDate)
        .all<{ name: string; date: string; status: string }>();
      for (const r of staffRows.results ?? []) {
        items.push({
          name: r.name,
          date: r.date,
          status: r.status,
          type: "staff",
        });
      }
    }

    const circleIdParam = url.searchParams.get("circle_id")?.trim();
    const trackIdParam = url.searchParams.get("track_id")?.trim();
    const filterCircleId = circleIdParam ? Number(circleIdParam) : null;
    const filterTrackId = trackIdParam ? Number(trackIdParam) : null;

    const attTable = await resolveAttendanceTableName(env);
    if (includeItems && includeStudents && attTable) {
      const placement = await buildStudentPlacementSql(env);
      let stuSql = `
        SELECT s.full_name_ar AS name, sa.attendance_date AS date, sa.status
        FROM ${attTable} sa
        JOIN students s ON s.id = sa.student_id
        ${placement.historyJoin}
        WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
          AND ${isActiveExpr}`;
      const stuBinds: (string | number)[] = [
        admin.complexId,
        startDate,
        endDate,
      ];
      if (
        filterCircleId != null &&
        Number.isFinite(filterCircleId) &&
        filterCircleId > 0
      ) {
        stuSql += ` AND ${placement.circleRef} = ?`;
        stuBinds.push(filterCircleId);
      }
      if (
        filterTrackId != null &&
        Number.isFinite(filterTrackId) &&
        filterTrackId > 0
      ) {
        stuSql += ` AND ${placement.trackRef} = ?`;
        stuBinds.push(filterTrackId);
      }
      if (absentOnly) stuSql += ` AND sa.status IN ('absent', 'excused')`;
      stuSql += ` ORDER BY sa.attendance_date DESC, s.full_name_ar`;
      const stuRows = await env.DB.prepare(stuSql)
        .bind(...stuBinds)
        .all<{ name: string; date: string; status: string }>();
      for (const r of stuRows.results ?? []) {
        items.push({
          name: r.name,
          date: r.date,
          status: r.status,
          type: "student",
        });
      }
    }

    const staffCounts = await countComplexStaff(env, admin.complexId);
    const staffTotal = staffCounts.total;
    const today = todayRiyadhIso();
    const rateDate = endDate <= today ? endDate : today;

    const staffOnToday = await env.DB.prepare(
      `SELECT sa.user_id, sa.status
       FROM staff_attendance sa
       JOIN users u ON u.id = sa.user_id
       WHERE sa.complex_id = ? AND sa.attendance_date = ?
         AND COALESCE(u.is_active, 1) = 1`,
    )
      .bind(admin.complexId, rateDate)
      .all<{ user_id: number; status: string }>();
    let staffPresent = 0;
    for (const r of staffOnToday.results ?? []) {
      if (r.status === "present") staffPresent++;
    }

    const studentCounts = await countComplexStudents(env, admin.complexId);
    const studentsTotal = studentCounts.total;

    let studentsPresent = 0;
    if (attTable) {
      const isActiveExpr = await studentAttendanceEligibleSql(env, "s");
      const presentToday = await env.DB.prepare(
        `SELECT COUNT(DISTINCT sa.student_id) AS c
         FROM ${attTable} sa
         JOIN students s ON s.id = sa.student_id
         WHERE sa.complex_id = ? AND sa.attendance_date = ? AND sa.status = 'present'
           AND ${isActiveExpr}`,
      )
        .bind(admin.complexId, rateDate)
        .first<{ c: number }>();
      studentsPresent = Number(presentToday?.c ?? 0);
    }

    const pct = (n: number, total: number) =>
      total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

    const staffAbsent = Math.max(0, staffTotal - staffPresent);
    const studentsAbsent = Math.max(0, studentsTotal - studentsPresent);

    // Same denominator as staff_present_pct / students_present_pct: present on rateDate ÷ roster total.
    const staffDisciplinePct = pct(staffPresent, staffTotal);
    const studentsDisciplinePct = pct(studentsPresent, studentsTotal);

    const complex = await env.DB.prepare(
      `SELECT name_ar FROM complexes WHERE id = ?`,
    )
      .bind(admin.complexId)
      .first<{ name_ar: string }>();

    return json({
      start_date: startDate,
      end_date: endDate,
      complex_name: complex?.name_ar ?? null,
      filters: { status: statusFilter, type: typeFilter },
      summary: {
        staff_total: staffTotal,
        staff_present: staffPresent,
        staff_absent: staffAbsent,
        staff_present_pct: pct(staffPresent, staffTotal),
        staff_absent_pct: pct(staffAbsent, staffTotal),
        staff_discipline_pct: staffDisciplinePct,
        students_total: studentsTotal,
        students_present: studentsPresent,
        students_absent: studentsAbsent,
        students_present_pct: pct(studentsPresent, studentsTotal),
        students_absent_pct: pct(studentsAbsent, studentsTotal),
        students_discipline_pct: studentsDisciplinePct,
      },
      items: includeItems ? items : [],
    });
  }

  // GET /api/admin-dept/reports/semester-export — أرشيف الفصل (JSON للتحويل إلى Excel)
  if (request.method === "GET" && path === "/api/admin-dept/reports/semester-export") {
    const payload = await buildSemesterExportPayload(env, admin.complexId, "active");
    return json(payload);
  }

  // GET /api/admin-dept/reports/semester-export-all — تصدير الفصل (CSV متعدد الأقسام)
  if (request.method === "GET" && path === "/api/admin-dept/reports/semester-export-all") {
    const format = (url.searchParams.get("format") ?? "csv").trim().toLowerCase();
    if (format === "json") {
      const payload = await buildSemesterExportPayload(env, admin.complexId, "all");
      return json(payload);
    }
    const bundle = await buildSemesterExportCsvBundle(env, admin.complexId);
    return semesterExportCsvResponse(bundle);
  }

  // GET /api/admin-dept/reports/individual — تقرير انضباط تفصيلي لفرد
  if (request.method === "GET" && path === "/api/admin-dept/reports/individual") {
    const beneficiaryType = (
      url.searchParams.get("type")?.trim() ||
      url.searchParams.get("beneficiary_type")?.trim() ||
      ""
    ).toLowerCase();
    const personId = Number(
      url.searchParams.get("person_id") ??
        url.searchParams.get("id") ??
        NaN,
    );
    const startDate =
      url.searchParams.get("start")?.trim() ||
      url.searchParams.get("startDate")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      todayRiyadhIso();
    const endDate =
      url.searchParams.get("end")?.trim() ||
      url.searchParams.get("endDate")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      startDate;

    if (beneficiaryType !== "staff" && beneficiaryType !== "student") {
      return json({ error: "invalid_type", allowed: ["staff", "student"] }, 400);
    }
    if (!Number.isFinite(personId)) {
      return json({ error: "person_id_required" }, 400);
    }
    if (startDate > endDate) {
      return json({ error: "invalid_date_range", start: startDate, end: endDate }, 400);
    }

    const complex = await env.DB.prepare(
      `SELECT name_ar FROM complexes WHERE id = ?`,
    )
      .bind(admin.complexId)
      .first<{ name_ar: string }>();

    type AttRow = { date: string; status: string };
    const history: AttRow[] = [];

    if (beneficiaryType === "student") {
      const personRef =
        url.searchParams.get("person_id") ??
        url.searchParams.get("student_id") ??
        url.searchParams.get("id") ??
        "";
      const student = await fetchStudentForAdminReport(
        env,
        admin.complexId,
        personRef,
      );
      if (!student) return json({ error: "student_not_found" }, 404);

      const attTable = await resolveAttendanceTableName(env);
      if (attTable) {
        const attRows = await env.DB.prepare(
          `SELECT attendance_date AS date, status
           FROM ${attTable}
           WHERE student_id = ? AND complex_id = ?
             AND attendance_date BETWEEN ? AND ?
           ORDER BY attendance_date DESC`,
        )
          .bind(student.id, admin.complexId, startDate, endDate)
          .all<AttRow>();
        for (const r of attRows.results ?? []) history.push(r);
      }

      let present = 0;
      let absent = 0;
      let excused = 0;
      for (const r of history) {
        if (r.status === "present") present++;
        else if (r.status === "excused") excused++;
        else absent++;
      }
      const total = history.length;
      const disciplinePct =
        total > 0 ? Math.round((present / total) * 100) : 100;

      const placementLabel =
        [student.circle_name, student.track_name].filter(Boolean).join(" · ") ||
        null;

      return json({
        type: "student",
        start_date: startDate,
        end_date: endDate,
        complex_name: complex?.name_ar ?? null,
        person: {
          id: student.id,
          full_name_ar: student.full_name_ar,
          guardian_phone: student.guardian_phone ?? null,
          stage_id: student.stage_id,
          circle_name: placementLabel,
        },
        summary: { present, absent, excused, total },
        discipline_pct: disciplinePct,
        items: history,
        stage_labels: STAGE_LABELS,
      });
    }

    const hasRole = await tableHasColumn(env, "users", "role");
    const roleCol = hasRole ? "role," : "";
    const staff = await env.DB.prepare(
      `SELECT id, full_name_ar, ${roleCol} is_active
       FROM users
       WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(personId, admin.complexId)
      .first<{
        id: number;
        full_name_ar: string;
        role?: string;
      }>();
    if (!staff) return json({ error: "staff_not_found" }, 404);

    if (await hasTable(env, "staff_attendance")) {
      const attRows = await env.DB.prepare(
        `SELECT attendance_date AS date, status
         FROM staff_attendance
         WHERE user_id = ? AND complex_id = ?
           AND attendance_date BETWEEN ? AND ?
         ORDER BY attendance_date DESC`,
      )
        .bind(personId, admin.complexId, startDate, endDate)
        .all<AttRow>();
      for (const r of attRows.results ?? []) history.push(r);
    }

    let present = 0;
    let absent = 0;
    let excused = 0;
    for (const r of history) {
      if (r.status === "present") present++;
      else if (r.status === "excused") excused++;
      else absent++;
    }
    const total = history.length;
    const disciplinePct = total > 0 ? Math.round((present / total) * 100) : 100;

    return json({
      type: "staff",
      start_date: startDate,
      end_date: endDate,
      complex_name: complex?.name_ar ?? null,
      person: {
        id: staff.id,
        full_name_ar: staff.full_name_ar,
        role: staff.role ?? null,
      },
      summary: { present, absent, excused, total },
      discipline_pct: disciplinePct,
      items: history,
    });
  }

  // GET /api/admin-dept/reports/student/:studentId — سجل حضور طالب كامل
  const studentReport = path.match(/^\/api\/admin-dept\/reports\/student\/(\d+)$/);
  if (request.method === "GET" && studentReport) {
    const studentRef = studentReport[1];
    const student = await fetchStudentForAdminReport(
      env,
      admin.complexId,
      studentRef,
    );
    if (!student) return json({ error: "student_not_found" }, 404);

    type AttRow = { date: string; status: string };
    const history: AttRow[] = [];
    const attTable = await resolveAttendanceTableName(env);
    if (attTable) {
      const attRows = await env.DB.prepare(
        `SELECT attendance_date AS date, status
         FROM ${attTable}
         WHERE student_id = ? AND complex_id = ?
         ORDER BY attendance_date DESC`,
      )
        .bind(student.id, admin.complexId)
        .all<AttRow>();
      for (const r of attRows.results ?? []) history.push(r);
    }

    let present = 0;
    let absent = 0;
    let excused = 0;
    for (const r of history) {
      if (r.status === "present") present++;
      else if (r.status === "excused") excused++;
      else absent++;
    }

    return json({
      student,
      summary: { present, absent, excused, total: history.length },
      items: history,
      stage_labels: STAGE_LABELS,
    });
  }

  // GET /api/admin-dept/reports/circle-discipline
  if (request.method === "GET" && path === "/api/admin-dept/reports/circle-discipline") {
    const startDate =
      url.searchParams.get("startDate")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      todayRiyadhIso();
    const endDate =
      url.searchParams.get("endDate")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      startDate;
    const circleIdParam = url.searchParams.get("circle_id")?.trim();
    const trackIdParam = url.searchParams.get("track_id")?.trim();
    const circleId = circleIdParam ? Number(circleIdParam) : null;
    const trackId = trackIdParam ? Number(trackIdParam) : null;
    const attTable = await resolveAttendanceTableName(env);
    if (!attTable) return json({ items: [] });

    const placement = await buildStudentPlacementSql(env);
    const circleExpr = placement.circleRef;

    let sql = `
      WITH student_rows AS (
        SELECT s.id AS student_id,
               s.full_name_ar,
               ${circleExpr} AS circle_id,
               c.name_ar AS circle_name,
               COUNT(sa.student_id) AS official_days,
               SUM(CASE WHEN sa.status = 'present' THEN 1 ELSE 0 END) AS present_days
        FROM students s
        ${placement.historyJoin}
        ${placement.circleJoin}
        LEFT JOIN ${attTable} sa
          ON sa.student_id = s.id
         AND sa.complex_id = s.complex_id
         AND sa.attendance_date BETWEEN ? AND ?
        WHERE s.complex_id = ? AND COALESCE(s.is_active, 1) = 1`;
    const binds: (string | number)[] = [startDate, endDate, admin.complexId];
    if (circleId != null && Number.isFinite(circleId) && circleId > 0) {
      sql += ` AND ${circleExpr} = ?`;
      binds.push(circleId);
    }
    if (trackId != null && Number.isFinite(trackId) && trackId > 0) {
      sql += ` AND ${placement.trackRef} = ?`;
      binds.push(trackId);
    }
    sql += `
        GROUP BY s.id, ${circleExpr}
      ),
      circle_rows AS (
        SELECT circle_id,
               SUM(official_days) AS circle_days,
               SUM(present_days) AS circle_present
        FROM student_rows
        GROUP BY circle_id
      )
      SELECT sr.student_id,
             sr.full_name_ar,
             sr.circle_id,
             sr.circle_name,
             sr.official_days,
             sr.present_days,
             CASE WHEN COALESCE(sr.official_days, 0) > 0
               THEN ROUND((COALESCE(sr.present_days, 0) * 100.0) / sr.official_days, 0)
               ELSE 0 END AS discipline_pct,
             CASE WHEN COALESCE(cr.circle_days, 0) > 0
               THEN ROUND((COALESCE(cr.circle_present, 0) * 100.0) / cr.circle_days, 0)
               ELSE 0 END AS circle_discipline_pct
      FROM student_rows sr
      LEFT JOIN circle_rows cr ON cr.circle_id = sr.circle_id
      WHERE sr.official_days > 0
      ORDER BY sr.circle_name, sr.full_name_ar
      LIMIT 500`;

    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{
        student_id: number;
        full_name_ar: string;
        circle_id: number | null;
        circle_name: string | null;
        official_days: number;
        present_days: number;
        discipline_pct: number;
        circle_discipline_pct: number;
      }>();
    return json({ start_date: startDate, end_date: endDate, items: rows.results ?? [] });
  }

  // GET /api/admin-dept/students/search?q=
  if (request.method === "GET" && path === "/api/admin-dept/students/search") {
    try {
      const q = url.searchParams.get("q")?.trim() ?? "";
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

      const hasCircleCol = await tableHasColumn(env, "students", "current_circle_id");
      const hasTrackCol = await tableHasColumn(env, "students", "current_track_id");
      const hasTracksTable = await hasTable(env, "tracks");
      const circleJoin = hasCircleCol
        ? `LEFT JOIN circles c ON c.id = s.current_circle_id AND c.complex_id = s.complex_id`
        : `LEFT JOIN circles c ON 1 = 0`;
      const trackJoin =
        hasTrackCol && hasTracksTable
          ? `LEFT JOIN tracks t ON t.id = s.current_track_id AND t.complex_id = s.complex_id`
          : `LEFT JOIN (SELECT NULL AS id, NULL AS name_ar) t ON 1 = 0`;

      const nationalExpr = (await tableHasColumn(env, "students", "national_id"))
        ? "s.national_id"
        : "NULL AS national_id";
      const phoneExpr = (await tableHasColumn(env, "students", "phone"))
        ? "s.phone"
        : "NULL AS phone";
      const guardianExpr = (await tableHasColumn(env, "students", "guardian_phone"))
        ? "s.guardian_phone"
        : "NULL AS guardian_phone";

      const isActiveExpr = await studentIsActiveSql(env, "s");

      let sql = `
      SELECT s.id, s.full_name_ar, ${nationalExpr}, ${phoneExpr}, ${guardianExpr},
             c.name_ar AS circle_name,
             t.name_ar AS track_name
      FROM students s
      ${circleJoin}
      ${trackJoin}
      WHERE s.complex_id = ? AND ${isActiveExpr}`;
      const binds: (string | number)[] = [admin.complexId];

      if (q.length > 0) {
        sql += ` AND s.full_name_ar LIKE ?`;
        binds.push(`%${q}%`);
      }
      sql += ` ORDER BY s.full_name_ar LIMIT ?`;
      binds.push(limit);

      const rows = await env.DB.prepare(sql)
        .bind(...binds)
        .all<{
          id: number;
          full_name_ar: string;
          national_id: string | null;
          phone: string | null;
          guardian_phone: string | null;
          circle_name: string | null;
          track_name: string | null;
        }>();

      return json({ items: rows.results ?? [], count: rows.results?.length ?? 0 });
    } catch (error: unknown) {
      console.error("[admin-dept] students/search:", error);
      return json(
        {
          error: "admin_students_search_failed",
          message:
            error instanceof Error ? error.message : "Failed to search students",
        },
        500,
      );
    }
  }

  // GET /api/admin-dept/magic-links
  if (request.method === "GET" && path === "/api/admin-dept/magic-links") {
    if (!(await hasTable(env, "shared_access_tokens"))) {
      return json({ items: [] });
    }

    const rows = await env.DB.prepare(
      `SELECT id, token, feature_name, context_data, is_active, created_at
       FROM shared_access_tokens
       WHERE complex_id = ? AND feature_name = 'student_attendance'
       ORDER BY created_at DESC`,
    )
      .bind(admin.complexId)
      .all<{
        id: number;
        token: string;
        feature_name: string;
        context_data: string;
        is_active: number;
        created_at: string;
      }>();

    const items = [];
    for (const row of rows.results ?? []) {
      let groupType: "circle" | "track" = "circle";
      let groupId: number | null = null;
      try {
        const ctx = JSON.parse(row.context_data) as MagicLinkContext;
        const resolved = resolveMagicGroupId(ctx);
        groupType = resolved.groupType;
        groupId = resolved.groupId;
      } catch {
        /* ignore malformed context */
      }

      let circleName: string | null = null;
      let trackName: string | null = null;
      if (groupId != null && Number.isFinite(groupId)) {
        if (groupType === "track") {
          const track = await env.DB.prepare(
            `SELECT name_ar FROM tracks WHERE id = ? AND complex_id = ?`,
          )
            .bind(groupId, admin.complexId)
            .first<{ name_ar: string }>();
          trackName = track?.name_ar ?? null;
        } else {
          const circle = await circleLabelRow(env, groupId);
          circleName = circle?.name_ar ?? null;
        }
      }

      const publicPath = `/public/attendance/${row.token}`;
      items.push({
        id: row.id,
        token: row.token,
        group_type: groupType,
        group_id: groupId,
        circle_id: groupType === "circle" ? groupId : null,
        circle_name: circleName,
        track_id: groupType === "track" ? groupId : null,
        track_name: trackName,
        evergreen: true,
        is_active: row.is_active,
        created_at: row.created_at,
        public_path: publicPath,
      });
    }

    return json({ items });
  }

  // DELETE /api/admin-dept/magic-links/:id
  const magicDeleteMatch = path.match(/^\/api\/admin-dept\/magic-links\/(\d+)$/);
  if (request.method === "DELETE" && magicDeleteMatch) {
    if (!(await hasTable(env, "shared_access_tokens"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const linkId = Number(magicDeleteMatch[1]);
    const result = await deleteSharedAccessToken(env, linkId, admin.complexId);
    if (!result.ok) {
      if (result.reason === "not_found") return json({ error: "not_found" }, 404);
      return json({ error: "delete_failed" }, 500);
    }

    return json({ ok: true, success: true, id: linkId });
  }

  // POST /api/admin-dept/magic-links
  if (request.method === "POST" && path === "/api/admin-dept/magic-links") {
    const limited = await enforceRateLimit(request, "magic-links-create", 15, 60);
    if (limited) return limited;

    if (!(await hasTable(env, "shared_access_tokens"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    let body: {
      circle_id?: number;
      track_id?: number;
      group_type?: string;
      attendance_date?: string;
      feature_name?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const featureName = body.feature_name?.trim() || "student_attendance";
    if (featureName !== "student_attendance") {
      return json({ error: "unsupported_feature", allowed: ["student_attendance"] }, 400);
    }

    const explicitType =
      body.group_type === "track"
        ? "track"
        : body.group_type === "circle"
          ? "circle"
          : null;
    const entity =
      explicitType === "track" && body.track_id != null
        ? { type: "track" as const, id: Number(body.track_id) }
        : explicitType === "circle" && body.circle_id != null
          ? { type: "circle" as const, id: Number(body.circle_id) }
          : parseAttendanceEntity(body);

    if (!entity || !Number.isFinite(entity.id)) {
      return json(
        { error: "entity_required", hint: "circle_id XOR track_id with group_type" },
        400,
      );
    }

    if (entity.type === "circle") {
      if (!(await assertCircleInComplex(env, admin.complexId, entity.id))) {
        return json({ error: "circle_not_found" }, 404);
      }
    } else if (!(await assertTrackInComplex(env, admin.complexId, entity.id))) {
      return json({ error: "track_not_found" }, 404);
    }

    const existing = await findActiveMagicLinkForEntity(env, admin.complexId, entity);
    if (existing) {
      return json(
        {
          error: "active_link_exists",
          message:
            "يوجد رابط فعال مسبقاً لهذه الحلقة/المسار، يرجى تعطيله أولاً",
        },
        409,
      );
    }

    const token = randomMagicToken();
    const contextObj: MagicLinkContext = {
      group_type: entity.type,
      group_id: entity.id,
      circle_id: entity.type === "circle" ? entity.id : undefined,
      scope: entity.type,
    };
    const context = JSON.stringify(contextObj);

    const ins = await env.DB.prepare(
      `INSERT INTO shared_access_tokens (
         complex_id, token, feature_name, context_data, is_active, created_by_user_id
       ) VALUES (?, ?, ?, ?, 1, ?)`,
    )
      .bind(admin.complexId, token, featureName, context, admin.userId)
      .run();

    const linkId = ins.meta.last_row_id;
    const publicPath = `/public/attendance/${token}`;

    return json({
      ok: true,
      id: linkId,
      token,
      feature_name: featureName,
      is_active: 1,
      context_data: JSON.parse(context),
      public_path: publicPath,
      api_get: `/api/public/attendance/${token}`,
      api_post: `/api/public/attendance/${token}`,
    });
  }

  // PUT /api/admin-dept/magic-links/:id/toggle
  const toggleMatch = path.match(/^\/api\/admin-dept\/magic-links\/(\d+)\/toggle$/);
  if (request.method === "PUT" && toggleMatch) {
    if (!(await hasTable(env, "shared_access_tokens"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const linkId = Number(toggleMatch[1]);
    const row = await env.DB.prepare(
      `SELECT id, is_active FROM shared_access_tokens
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(linkId, admin.complexId)
      .first<{ id: number; is_active: number }>();

    if (!row) return json({ error: "not_found" }, 404);

    const nextActive = row.is_active === 1 ? 0 : 1;
    await env.DB.prepare(
      `UPDATE shared_access_tokens
       SET is_active = ?,
           deactivated_at = CASE WHEN ? = 0 THEN datetime('now') ELSE NULL END
       WHERE id = ?`,
    )
      .bind(nextActive, nextActive, linkId)
      .run();

    return json({ ok: true, id: linkId, is_active: nextActive });
  }

  // GET /api/admin-dept/teacher-requests/escalations
  if (
    request.method === "GET" &&
    path === "/api/admin-dept/teacher-requests/escalations"
  ) {
    if (!(await hasTable(env, "teacher_requests"))) {
      return json({ error: "migration_required", migration: "026_edu_department_core" }, 503);
    }
    const items = await env.DB.prepare(
      `SELECT tr.id, tr.student_id, tr.teacher_user_id, tr.request_type, tr.status, tr.notes, tr.created_at,
              s.full_name_ar AS student_name,
              u.full_name_ar AS teacher_name
       FROM teacher_requests tr
       JOIN students s ON s.id = tr.student_id
       JOIN users u ON u.id = tr.teacher_user_id
       WHERE tr.complex_id = ? AND tr.request_type = 'escalation' AND tr.status = 'pending'
       ORDER BY tr.created_at DESC`,
    )
      .bind(admin.complexId)
      .all();
    return json({ items: items.results ?? [] });
  }

  const escReq = path.match(/^\/api\/admin-dept\/teacher-requests\/(\d+)$/);
  if (escReq && request.method === "PATCH") {
    if (!(await hasTable(env, "teacher_requests"))) {
      return json({ error: "migration_required", migration: "026_edu_department_core" }, 503);
    }
    const reqId = Number(escReq[1]);
    let body: { notes?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const notes = body.notes?.trim();
    if (!notes) return json({ error: "notes_required" }, 400);
    const row = await env.DB.prepare(
      `SELECT id, status FROM teacher_requests
       WHERE id = ? AND complex_id = ? AND request_type = 'escalation'`,
    )
      .bind(reqId, admin.complexId)
      .first<{ id: number; status: string }>();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_resolved" }, 409);
    await env.DB.prepare(`UPDATE teacher_requests SET notes = ? WHERE id = ?`)
      .bind(notes, reqId)
      .run();
    return json({ ok: true, id: reqId });
  }

  if (escReq && request.method === "DELETE") {
    if (!(await hasTable(env, "teacher_requests"))) {
      return json({ error: "migration_required", migration: "026_edu_department_core" }, 503);
    }
    const reqId = Number(escReq[1]);
    const row = await env.DB.prepare(
      `SELECT id, status FROM teacher_requests
       WHERE id = ? AND complex_id = ? AND request_type = 'escalation'`,
    )
      .bind(reqId, admin.complexId)
      .first<{ id: number; status: string }>();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_resolved" }, 409);
    await env.DB.prepare(`DELETE FROM teacher_requests WHERE id = ?`).bind(reqId).run();
    return json({ ok: true, id: reqId });
  }

  const convertPledge = path.match(
    /^\/api\/admin-dept\/teacher-requests\/(\d+)\/convert-pledge$/,
  );
  if (request.method === "POST" && convertPledge) {
    if (!(await hasTable(env, "teacher_requests"))) {
      return json({ error: "migration_required", migration: "026_edu_department_core" }, 503);
    }
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }
    const reqId = Number(convertPledge[1]);
    const row = await env.DB.prepare(
      `SELECT tr.id, tr.student_id, tr.notes, tr.status
       FROM teacher_requests tr
       WHERE tr.id = ? AND tr.complex_id = ? AND tr.request_type = 'escalation'`,
    )
      .bind(reqId, admin.complexId)
      .first<{
        id: number;
        student_id: number;
        notes: string | null;
        status: string;
      }>();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_resolved" }, 409);

    const reason =
      row.notes?.trim() ||
      "تصعيد من المعلم — تحويل إلى تعهد رسمي";
    const pledgeDate = todayRiyadhIso();

    const ins = await env.DB.prepare(
      `INSERT INTO student_pledges (complex_id, student_id, reason_ar, pledge_date, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(admin.complexId, row.student_id, reason, pledgeDate, admin.userId)
      .run();

    await env.DB.prepare(
      `UPDATE teacher_requests
       SET status = 'approved', resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`,
    )
      .bind(admin.userId, reqId)
      .run();

    const pledgeCount = await bumpPledgeSummary(env, row.student_id);
    const maxPledges = await getMaxPledges(env, admin.complexId);

    return json({
      ok: true,
      pledge_id: ins.meta.last_row_id,
      pledge_count: pledgeCount,
      max_pledges: maxPledges,
      threshold_reached: pledgeCount >= maxPledges,
    });
  }

  return json({ error: "Not Found", path }, 404);
}
