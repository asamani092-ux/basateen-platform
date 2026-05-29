import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import {
  circleLabelRow,
  studentCircleScopeSql,
  syncStudentPlacementColumns,
  validateCircleStage,
} from "../lib/admin-dept-schema";
import { teachersListSql } from "../lib/admin-gm-schema";
import { activePlacementSql, hasTable, tableHasColumn } from "../lib/db-schema";
import { STAGE_LABELS } from "../lib/dept-scope";
import { randomMagicToken } from "../lib/magic-link";
import { assignStudentCircle } from "../lib/placement";
import {
  resolveAttendanceTableName,
  upsertStudentAttendance,
  type AttendanceStatus,
} from "../lib/student-attendance-db";

const ADMIN_ROLES = ["admin_supervisor", "super_admin"] as const;

const STAGE_ID_TO_CIRCLE_STAGE: Record<number, string> = {
  1: "tlaqeen",
  2: "primary",
  3: "middle",
  4: "secondary",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

async function staffListSql(env: Env): Promise<{ sql: string; flat: boolean }> {
  const hasRole = await tableHasColumn(env, "users", "role");
  if (hasRole) {
    return {
      flat: false,
      sql: `SELECT u.id AS user_id, u.full_name_ar, u.role,
                   sa.status AS saved_status, sa.recorded_at
            FROM users u
            LEFT JOIN staff_attendance sa
              ON sa.user_id = u.id AND sa.attendance_date = ? AND sa.complex_id = ?
            WHERE u.complex_id = ? AND u.is_active = 1
              AND u.role IN ('super_admin','admin_supervisor','edu_supervisor','prog_supervisor','teacher')
            ORDER BY u.full_name_ar`,
    };
  }
  return {
    flat: true,
    sql: `SELECT u.id AS user_id, u.full_name_ar,
                 sa.status AS saved_status, sa.recorded_at
          FROM users u
          LEFT JOIN staff_attendance sa
            ON sa.user_id = u.id AND sa.attendance_date = ? AND sa.complex_id = ?
          WHERE u.complex_id = ? AND u.is_active = 1
            AND (
              COALESCE(u.is_admin, 0) = 1 OR COALESCE(u.is_educational, 0) = 1 OR
              COALESCE(u.is_programs, 0) = 1 OR COALESCE(u.is_teacher, 0) = 1 OR
              COALESCE(u.is_track_supervisor, 0) = 1
            )
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

async function loadStudentsForCircleAttendance(
  env: Env,
  complexId: number,
  circleId: number,
  date: string,
): Promise<{ items: unknown[]; attTable: string } | { error: Response }> {
  if (!(await tableHasColumn(env, "students", "current_circle_id"))) {
    return {
      error: json(
        {
          error: "migration_required",
          hint: "students.current_circle_id — run D1 migrate 025",
        },
        503,
      ),
    };
  }

  const attTable = await resolveAttendanceTableName(env);
  if (!attTable) {
    return {
      error: json({ error: "migration_required", table: "student_attendance" }, 503),
    };
  }

  const attSourceCol = (await tableHasColumn(env, attTable, "source"))
    ? ", sa.source"
    : "";

  const rows = await env.DB.prepare(
    `SELECT s.id AS student_id, s.full_name_ar,
            COALESCE(s.stage_id, 0) AS stage_id,
            COALESCE(sa.status, 'present') AS status,
            sa.recorded_at${attSourceCol}
     FROM students s
     LEFT JOIN ${attTable} sa
       ON sa.student_id = s.id AND sa.attendance_date = ?
     WHERE s.complex_id = ? AND COALESCE(s.is_active, 1) = 1
       AND s.current_circle_id = ?
     ORDER BY s.full_name_ar`,
  )
    .bind(date, complexId, circleId)
    .all();

  return { items: rows.results ?? [], attTable };
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

export async function handleAdminDeptRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/admin-dept/")) return null;

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
    const date = url.searchParams.get("date")?.trim() || todayIso();
    const { sql } = await staffListSql(env);
    const rows = await env.DB.prepare(sql)
      .bind(date, admin.complexId, admin.complexId)
      .all<{
        user_id: number;
        full_name_ar: string;
        role?: string;
        saved_status: string | null;
        recorded_at: string | null;
      }>();

    const items = (rows.results ?? []).map((r) => ({
      user_id: r.user_id,
      full_name_ar: r.full_name_ar,
      role: r.role ?? null,
      status: r.saved_status ?? "present",
      recorded_at: r.recorded_at,
    }));

    return json({ date, items, default_status: "present" });
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

    const date = body.attendance_date?.trim() || todayIso();
    const records = body.records ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "records_required" }, 400);
    }

    let saved = 0;
    for (const rec of records) {
      const userId = Number(rec.user_id);
      const status = parseStatus(rec.status) ?? "present";
      if (!Number.isFinite(userId)) continue;
      if (status === "present") {
        await env.DB.prepare(
          `DELETE FROM staff_attendance WHERE user_id = ? AND attendance_date = ? AND complex_id = ?`,
        )
          .bind(userId, date, admin.complexId)
          .run();
        saved++;
        continue;
      }
      const staffOk = await env.DB.prepare(
        `SELECT id FROM users WHERE id = ? AND complex_id = ? AND is_active = 1`,
      )
        .bind(userId, admin.complexId)
        .first();
      if (!staffOk) continue;

      await env.DB.prepare(
        `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, attendance_date) DO UPDATE SET
           status = excluded.status,
           recorded_by_user_id = excluded.recorded_by_user_id,
           recorded_at = datetime('now')`,
      )
        .bind(admin.complexId, userId, date, status, admin.userId)
        .run();
      saved++;
    }

    return json({ ok: true, attendance_date: date, saved });
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

    const date = url.searchParams.get("date")?.trim() || todayIso();
    const loaded = await loadStudentsForCircleAttendance(
      env,
      admin.complexId,
      circleId,
      date,
    );
    if ("error" in loaded) return loaded.error;

    const circle = await circleLabelRow(env, circleId);

    return json({
      attendance_date: date,
      circle,
      items: loaded.items,
      default_status: "present",
    });
  }

  // POST /api/admin-dept/students/attendance
  if (request.method === "POST" && path === "/api/admin-dept/students/attendance") {
    let body: {
      circle_id?: number;
      attendance_date?: string;
      records?: Array<{ student_id?: number; status?: string; notes?: string }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const circleId = Number(body.circle_id);
    if (!Number.isFinite(circleId)) return json({ error: "circle_id_required" }, 400);
    if (!(await assertCircleInComplex(env, admin.complexId, circleId))) {
      return json({ error: "circle_not_found" }, 404);
    }

    const date = body.attendance_date?.trim() || todayIso();
    const records = body.records ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "records_required" }, 400);
    }

    let saved = 0;
    for (const rec of records) {
      const studentId = Number(rec.student_id);
      const status = parseStatus(rec.status);
      if (!Number.isFinite(studentId) || !status) continue;

      let allowed: { id: number } | null = null;
      if (await tableHasColumn(env, "students", "current_circle_id")) {
        allowed = await env.DB.prepare(
          `SELECT id FROM students
           WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1
             AND current_circle_id = ?`,
        )
          .bind(studentId, admin.complexId, circleId)
          .first<{ id: number }>();
      } else {
        const scope = await studentCircleScopeSql(env);
        allowed = await env.DB.prepare(
          `SELECT s.id FROM students s
           ${scope.joinSql}
           WHERE s.id = ? AND s.complex_id = ? AND s.is_active = 1 AND ${scope.circlePredicate}`,
        )
          .bind(
            ...(scope.usesFlatColumn
              ? [studentId, admin.complexId, circleId]
              : [circleId, studentId, admin.complexId]),
          )
          .first<{ id: number }>();
      }

      if (!allowed) continue;

      if (status === "present") {
        const attTable = await resolveAttendanceTableName(env);
        if (attTable) {
          await env.DB.prepare(
            `DELETE FROM ${attTable} WHERE student_id = ? AND attendance_date = ?`,
          )
            .bind(studentId, date)
            .run();
        }
        saved++;
        continue;
      }

      await upsertStudentAttendance(env, {
        complexId: admin.complexId,
        studentId,
        attendanceDate: date,
        status,
        source: "admin_supervisor",
        circleId,
        recordedByUserId: admin.userId,
        notes: rec.notes?.trim() ?? null,
      });
      saved++;
    }

    return json({ ok: true, attendance_date: date, circle_id: circleId, saved });
  }

  // GET /api/admin-dept/students/absent-today
  if (request.method === "GET" && path === "/api/admin-dept/students/absent-today") {
    const date = url.searchParams.get("date")?.trim() || todayIso();
    const circleIdParam = url.searchParams.get("circle_id");
    const circleId = circleIdParam ? Number(circleIdParam) : null;

    const attTable = await resolveAttendanceTableName(env);
    if (!attTable) {
      return json({ error: "migration_required", table: "student_attendance" }, 503);
    }

    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const activeHist = await activePlacementSql(env, "h");

    let sql: string;
    if (hasCurrentCircle) {
      sql = `
      SELECT s.id AS student_id, s.full_name_ar, s.guardian_phone, s.stage_id,
             sa.status, c.id AS circle_id, c.name_ar AS circle_name
      FROM students s
      INNER JOIN ${attTable} sa
        ON sa.student_id = s.id AND sa.attendance_date = ?
      LEFT JOIN circles c ON c.id = s.current_circle_id
      WHERE s.complex_id = ? AND s.is_active = 1
        AND sa.status IN ('absent', 'excused')`;
    } else {
      sql = `
      SELECT s.id AS student_id, s.full_name_ar, s.guardian_phone, s.stage_id,
             sa.status, c.id AS circle_id, c.name_ar AS circle_name
      FROM students s
      INNER JOIN ${attTable} sa
        ON sa.student_id = s.id AND sa.attendance_date = ?
      INNER JOIN student_circle_history h
        ON h.student_id = s.id AND ${activeHist}
      LEFT JOIN circles c ON c.id = h.circle_id
      WHERE s.complex_id = ? AND s.is_active = 1
        AND sa.status IN ('absent', 'excused')`;
    }
    const binds: (number | string)[] = [date, admin.complexId];

    if (circleId != null && Number.isFinite(circleId)) {
      sql += hasCurrentCircle
        ? ` AND s.current_circle_id = ?`
        : ` AND h.circle_id = ?`;
      binds.push(circleId);
    }

    sql += ` ORDER BY c.name_ar, s.full_name_ar`;

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
      const msg = template
        .replace(/\{\{student_name\}\}/g, name)
        .replace(/\{\{date\}\}/g, date);
      const phone = String(r.guardian_phone ?? "").replace(/\D/g, "");
      const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : null;
      return { ...r, whatsapp_message: msg, whatsapp_url: waUrl };
    });

    return json({ date, items, template });
  }

  // POST /api/admin-dept/admission
  if (request.method === "POST" && path === "/api/admin-dept/admission") {
    let body: {
      full_name_ar?: string;
      national_id?: string;
      phone?: string;
      school_grade?: string;
      stage_id?: number;
      age?: number | null;
      guardian_phone?: string;
      guardian_national_id?: string;
      guardian_work?: string;
      health_notes?: string;
      circle_id?: number;
      track_id?: number | null;
      nationality?: string;
      school_name?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const fullName = body.full_name_ar?.trim();
    const nationalId = body.national_id?.trim();
    const guardianPhone = body.guardian_phone?.trim();
    const stageId = Number(body.stage_id);
    const circleId = Number(body.circle_id);

    if (!fullName || !nationalId || !guardianPhone) {
      return json({ error: "full_name_national_id_guardian_required" }, 400);
    }
    if (!Number.isFinite(stageId) || stageId < 1 || stageId > 4) {
      return json({ error: "invalid_stage_id" }, 400);
    }
    if (!Number.isFinite(circleId)) {
      return json({ error: "circle_id_required" }, 400);
    }

    const stageCheck = await validateCircleStage(
      env,
      circleId,
      admin.complexId,
      stageId,
    );
    if (!stageCheck.ok) {
      if (stageCheck.error === "circle_not_found") {
        return json({ error: "circle_not_found" }, 404);
      }
      return json(
        {
          error: "circle_stage_mismatch",
          expected_stage: STAGE_ID_TO_CIRCLE_STAGE[stageId],
        },
        400,
      );
    }

    const trackId =
      body.track_id != null && Number.isFinite(Number(body.track_id))
        ? Number(body.track_id)
        : null;

    const hasStageId = await tableHasColumn(env, "students", "stage_id");
    const hasGuardian = await tableHasColumn(env, "students", "guardian_phone");
    if (!hasGuardian) {
      return json({ error: "migration_required", hint: "students.guardian_phone" }, 503);
    }

    const insertCols = [
      "complex_id",
      "full_name_ar",
      "national_id",
      "guardian_phone",
      "is_active",
    ];
    const insertVals: (string | number | null)[] = [
      admin.complexId,
      fullName,
      nationalId,
      guardianPhone,
      1,
    ];

    const optionalPairs: Array<[string, string | number | null]> = [
      ["phone", body.phone?.trim() ?? null],
      ["nationality", body.nationality?.trim() ?? null],
      ["school_name", body.school_name?.trim() ?? null],
      ["school_grade", body.school_grade?.trim() ?? null],
      ["age", body.age != null && Number.isFinite(Number(body.age)) ? Number(body.age) : null],
      ["guardian_national_id", body.guardian_national_id?.trim() ?? null],
      ["guardian_work", body.guardian_work?.trim() ?? null],
      ["health_notes", body.health_notes?.trim() ?? null],
    ];
    if (hasStageId) optionalPairs.push(["stage_id", stageId]);
    if (await tableHasColumn(env, "students", "current_circle_id")) {
      optionalPairs.push(["current_circle_id", circleId]);
    }
    if (await tableHasColumn(env, "students", "current_track_id")) {
      optionalPairs.push(["current_track_id", trackId]);
    }
    if (await tableHasColumn(env, "students", "admission_status")) {
      optionalPairs.push(["admission_status", "active"]);
    }
    if (await tableHasColumn(env, "students", "account_status")) {
      optionalPairs.push(["account_status", "active"]);
    }

    for (const [col, val] of optionalPairs) {
      if (await tableHasColumn(env, "students", col)) {
        insertCols.push(col);
        insertVals.push(val);
      }
    }

    const placeholders = insertCols.map(() => "?").join(", ");
    let ins;
    try {
      ins = await env.DB.prepare(
        `INSERT INTO students (${insertCols.join(", ")}) VALUES (${placeholders})`,
      )
        .bind(...insertVals)
        .run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE") && msg.includes("national_id")) {
        return json({ error: "national_id_exists" }, 409);
      }
      throw e;
    }

    const studentId = ins.meta.last_row_id as number;

    if (await hasTable(env, "student_circle_history")) {
      await assignStudentCircle(env, studentId, circleId, trackId, "admission");
    }
    await syncStudentPlacementColumns(env, studentId, circleId, trackId, stageId);

    return json(
      {
        ok: true,
        student_id: studentId,
        stage_id: stageId,
        stage_label: STAGE_LABELS[stageId],
        circle_id: circleId,
        admission_status: "active",
      },
      201,
    );
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
    const pledgeDate = body.pledge_date?.trim() || todayIso();

    if (!Number.isFinite(studentId) || !reason) {
      return json({ error: "student_id_and_reason_required" }, 400);
    }

    const student = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students WHERE id = ? AND complex_id = ? AND is_active = 1`,
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

  // GET /api/admin-dept/pledges/:studentId
  const pledgeGet = path.match(/^\/api\/admin-dept\/pledges\/(\d+)$/);
  if (request.method === "GET" && pledgeGet) {
    if (!(await hasTable(env, "student_pledges"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    const studentId = Number(pledgeGet[1]);
    const student = await env.DB.prepare(
      `SELECT id, full_name_ar, stage_id, current_circle_id FROM students
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

  // GET /api/admin-dept/reports
  if (request.method === "GET" && path === "/api/admin-dept/reports") {
    const startDate =
      url.searchParams.get("startDate")?.trim() ||
      url.searchParams.get("start_date")?.trim() ||
      todayIso();
    const endDate =
      url.searchParams.get("endDate")?.trim() ||
      url.searchParams.get("end_date")?.trim() ||
      startDate;
    const statusFilter = (
      url.searchParams.get("status")?.trim() || "all"
    ).toLowerCase();
    const typeFilter = (
      url.searchParams.get("type")?.trim() || "all"
    ).toLowerCase();

    const absentOnly = statusFilter === "absent_only" || statusFilter === "absent";
    const includeStaff = typeFilter === "all" || typeFilter === "staff";
    const includeStudents = typeFilter === "all" || typeFilter === "student";

    type ReportRow = {
      name: string;
      date: string;
      status: string;
      type: "staff" | "student";
    };
    const items: ReportRow[] = [];

    if (includeStaff && (await hasTable(env, "staff_attendance"))) {
      let staffSql = `
        SELECT u.full_name_ar AS name, sa.attendance_date AS date, sa.status
        FROM staff_attendance sa
        JOIN users u ON u.id = sa.user_id
        WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?`;
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

    const attTable = await resolveAttendanceTableName(env);
    if (includeStudents && attTable) {
      let stuSql = `
        SELECT s.full_name_ar AS name, sa.attendance_date AS date, sa.status
        FROM ${attTable} sa
        JOIN students s ON s.id = sa.student_id
        WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
          AND COALESCE(s.is_active, 1) = 1`;
      if (absentOnly) stuSql += ` AND sa.status IN ('absent', 'excused')`;
      stuSql += ` ORDER BY sa.attendance_date DESC, s.full_name_ar`;
      const stuRows = await env.DB.prepare(stuSql)
        .bind(admin.complexId, startDate, endDate)
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

    const staffRosterSql = await teachersListSql(env);
    const staffAll = await env.DB.prepare(staffRosterSql)
      .bind(admin.complexId)
      .all<{ id: number }>();
    const staffTotal = staffAll.results?.length ?? 0;

    const staffOnEnd = await env.DB.prepare(
      `SELECT user_id, status FROM staff_attendance
       WHERE complex_id = ? AND attendance_date = ?`,
    )
      .bind(admin.complexId, endDate)
      .all<{ user_id: number; status: string }>();
    const staffStatusMap = new Map(
      (staffOnEnd.results ?? []).map((r) => [r.user_id, r.status]),
    );
    let staffPresent = 0;
    for (const u of staffAll.results ?? []) {
      const st = staffStatusMap.get(u.id) ?? "present";
      if (st === "present") staffPresent++;
    }

    const studentsTotalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students WHERE complex_id = ? AND COALESCE(is_active, 1) = 1`,
    )
      .bind(admin.complexId)
      .first<{ c: number }>();
    const studentsTotal = Number(studentsTotalRow?.c ?? 0);

    let studentsPresent = studentsTotal;
    if (attTable) {
      const absentOnEnd = await env.DB.prepare(
        `SELECT COUNT(DISTINCT student_id) AS c FROM ${attTable}
         WHERE complex_id = ? AND attendance_date = ?
           AND status IN ('absent', 'excused')`,
      )
        .bind(admin.complexId, endDate)
        .first<{ c: number }>();
      studentsPresent = Math.max(
        0,
        studentsTotal - Number(absentOnEnd?.c ?? 0),
      );
    }

    const pct = (n: number, total: number) =>
      total > 0 ? Math.round((n / total) * 100) : 0;

    const staffAbsent = Math.max(0, staffTotal - staffPresent);
    const studentsAbsent = Math.max(0, studentsTotal - studentsPresent);

    return json({
      start_date: startDate,
      end_date: endDate,
      filters: { status: statusFilter, type: typeFilter },
      summary: {
        staff_total: staffTotal,
        staff_present: staffPresent,
        staff_absent: staffAbsent,
        staff_present_pct: pct(staffPresent, staffTotal),
        staff_absent_pct: pct(staffAbsent, staffTotal),
        students_total: studentsTotal,
        students_present: studentsPresent,
        students_absent: studentsAbsent,
        students_present_pct: pct(studentsPresent, studentsTotal),
        students_absent_pct: pct(studentsAbsent, studentsTotal),
      },
      items,
    });
  }

  // GET /api/admin-dept/students/search?q=
  if (request.method === "GET" && path === "/api/admin-dept/students/search") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

    const hasCircleCol = await tableHasColumn(env, "students", "current_circle_id");
    const circleJoin = hasCircleCol
      ? `LEFT JOIN circles c ON c.id = s.current_circle_id AND c.complex_id = s.complex_id`
      : `LEFT JOIN circles c ON 1 = 0`;

    let sql = `
      SELECT s.id, s.full_name_ar, s.national_id, s.phone, s.guardian_phone,
             c.name_ar AS circle_name
      FROM students s
      ${circleJoin}
      WHERE s.complex_id = ? AND COALESCE(s.is_active, 1) = 1`;
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
      }>();

    return json({ items: rows.results ?? [], count: rows.results?.length ?? 0 });
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
      let circleId: number | null = null;
      let attendanceDate: string | null = null;
      try {
        const ctx = JSON.parse(row.context_data) as {
          circle_id?: number;
          attendance_date?: string;
        };
        circleId = ctx.circle_id != null ? Number(ctx.circle_id) : null;
        attendanceDate = ctx.attendance_date ?? null;
      } catch {
        /* ignore malformed context */
      }

      let circleName: string | null = null;
      if (circleId != null && Number.isFinite(circleId)) {
        const circle = await circleLabelRow(env, circleId);
        circleName = circle?.name_ar ?? null;
      }

      const publicPath = `/public/attendance/${row.token}`;
      items.push({
        id: row.id,
        token: row.token,
        circle_id: circleId,
        circle_name: circleName,
        attendance_date: attendanceDate,
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
    const row = await env.DB.prepare(
      `SELECT id FROM shared_access_tokens WHERE id = ? AND complex_id = ?`,
    )
      .bind(linkId, admin.complexId)
      .first();
    if (!row) return json({ error: "not_found" }, 404);

    await env.DB.prepare(`DELETE FROM shared_access_tokens WHERE id = ?`)
      .bind(linkId)
      .run();

    return json({ ok: true, id: linkId });
  }

  // POST /api/admin-dept/magic-links
  if (request.method === "POST" && path === "/api/admin-dept/magic-links") {
    if (!(await hasTable(env, "shared_access_tokens"))) {
      return json({ error: "migration_required", migration: "024_admin_department" }, 503);
    }

    let body: {
      circle_id?: number;
      attendance_date?: string;
      feature_name?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const circleId = Number(body.circle_id);
    const featureName = body.feature_name?.trim() || "student_attendance";
    if (featureName !== "student_attendance") {
      return json({ error: "unsupported_feature", allowed: ["student_attendance"] }, 400);
    }
    if (!Number.isFinite(circleId)) return json({ error: "circle_id_required" }, 400);
    if (!(await assertCircleInComplex(env, admin.complexId, circleId))) {
      return json({ error: "circle_not_found" }, 404);
    }

    const attendanceDate = body.attendance_date?.trim() || todayIso();
    const token = randomMagicToken();
    const context = JSON.stringify({
      circle_id: circleId,
      attendance_date: attendanceDate,
      scope: "circle",
    });

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
    const pledgeDate = todayIso();

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
