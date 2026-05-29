import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { STAGE_LABELS } from "../lib/dept-scope";
import { randomMagicToken } from "../lib/magic-link";
import {
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
    `SELECT id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
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

async function bumpPledgeSummary(env: Env, studentId: number): Promise<number> {
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

export async function handleAdminDeptRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/admin-dept/")) return null;

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
    if (!(await assertCircleInComplex(env, admin.complexId, circleId))) {
      return json({ error: "circle_not_found" }, 404);
    }

    const date = url.searchParams.get("date")?.trim() || todayIso();
    const rows = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar, s.stage_id,
              COALESCE(sa.status, 'present') AS status,
              sa.recorded_at, sa.source
       FROM students s
       LEFT JOIN student_attendance sa
         ON sa.student_id = s.id AND sa.attendance_date = ?
       WHERE s.complex_id = ? AND s.is_active = 1 AND s.current_circle_id = ?
       ORDER BY s.full_name_ar`,
    )
      .bind(date, admin.complexId, circleId)
      .all();

    const circle = await env.DB.prepare(
      `SELECT id, name_ar, stage FROM circles WHERE id = ?`,
    )
      .bind(circleId)
      .first<{ id: number; name_ar: string; stage: string }>();

    return json({
      attendance_date: date,
      circle,
      items: rows.results ?? [],
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

      const allowed = await env.DB.prepare(
        `SELECT id FROM students
         WHERE id = ? AND complex_id = ? AND is_active = 1 AND current_circle_id = ?`,
      )
        .bind(studentId, admin.complexId, circleId)
        .first();

      if (!allowed) continue;

      if (status === "present") {
        await env.DB.prepare(
          `DELETE FROM student_attendance WHERE student_id = ? AND attendance_date = ?`,
        )
          .bind(studentId, date)
          .run();
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

    let sql = `
      SELECT s.id AS student_id, s.full_name_ar, s.guardian_phone, s.stage_id,
             sa.status, c.id AS circle_id, c.name_ar AS circle_name
      FROM students s
      INNER JOIN student_attendance sa
        ON sa.student_id = s.id AND sa.attendance_date = ?
      LEFT JOIN circles c ON c.id = s.current_circle_id
      WHERE s.complex_id = ? AND s.is_active = 1
        AND sa.status IN ('absent', 'excused')`;
    const binds: (number | string)[] = [date, admin.complexId];

    if (circleId != null && Number.isFinite(circleId)) {
      sql += ` AND s.current_circle_id = ?`;
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

    const circle = await env.DB.prepare(
      `SELECT id, stage FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, admin.complexId)
      .first<{ id: number; stage: string }>();

    if (!circle) return json({ error: "circle_not_found" }, 404);

    const expectedStage = STAGE_ID_TO_CIRCLE_STAGE[stageId];
    if (circle.stage !== expectedStage) {
      return json({ error: "circle_stage_mismatch", expected_stage: expectedStage }, 400);
    }

    const hasAdmissionStatus = await tableHasColumn(env, "students", "admission_status");
    const trackId =
      body.track_id != null && Number.isFinite(Number(body.track_id))
        ? Number(body.track_id)
        : null;

    const insertSql = hasAdmissionStatus
      ? `INSERT INTO students (
           complex_id, full_name_ar, national_id, phone, nationality, school_name, school_grade,
           stage_id, age, guardian_phone, guardian_national_id, guardian_work, health_notes,
           current_circle_id, current_track_id, admission_status, account_status, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'active', 1)`
      : `INSERT INTO students (
           complex_id, full_name_ar, national_id, phone, nationality, school_name, school_grade,
           stage_id, age, guardian_phone, guardian_national_id, guardian_work, health_notes,
           current_circle_id, current_track_id, account_status, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`;

    const binds = [
      admin.complexId,
      fullName,
      nationalId,
      body.phone?.trim() ?? null,
      body.nationality?.trim() ?? null,
      body.school_name?.trim() ?? null,
      body.school_grade?.trim() ?? null,
      stageId,
      body.age != null && Number.isFinite(Number(body.age)) ? Number(body.age) : null,
      guardianPhone,
      body.guardian_national_id?.trim() ?? null,
      body.guardian_work?.trim() ?? null,
      body.health_notes?.trim() ?? null,
      circleId,
      trackId,
    ];

    let ins;
    try {
      ins = await env.DB.prepare(insertSql).bind(...binds).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE") && msg.includes("national_id")) {
        return json({ error: "national_id_exists" }, 409);
      }
      throw e;
    }

    const studentId = ins.meta.last_row_id as number;

    await env.DB.prepare(
      `INSERT INTO student_circle_history (
         student_id, old_circle_id, new_circle_id, old_track_id, new_track_id,
         moved_by_user_id, reason
       ) VALUES (?, NULL, ?, NULL, ?, ?, 'admission')`,
    )
      .bind(studentId, circleId, trackId, admin.userId)
      .run();

    return json({
      ok: true,
      student_id: studentId,
      stage_id: stageId,
      stage_label: STAGE_LABELS[stageId],
      circle_id: circleId,
      admission_status: "active",
    });
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

  return json({ error: "Not Found", path }, 404);
}
