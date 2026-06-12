import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { assignStudentCircle } from "../lib/placement";
import { tableHasColumn } from "../lib/db-schema";
import {
  buildStudentsInScopeWhere,
  loadUserScope,
  studentsInScopeBinds,
  studentsInScopeWhere,
} from "../lib/dept-scope";
import { upsertStudentAttendance } from "../lib/student-attendance-db";
import { handleEduDeptExtendedRoutes } from "./edu-dept-extended";

const ACCEPT_ASSIGN_PATHS = new Set([
  "/api/edu-dept/accept-assign",
  "/api/v1/education/supervisor/accept-assign",
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleEduDeptRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-dept/") && !path.startsWith("/api/edu-supervisor/") && !ACCEPT_ASSIGN_PATHS.has(path)) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return authUnauthorizedResponse(request);
  if (!requireRoles(auth, ["edu_supervisor", "super_admin"])) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);

  const extended = await handleEduDeptExtendedRoutes(
    request,
    env,
    url,
    { userId: auth.userId, complexId: auth.complexId },
    scope,
  );
  if (extended) return extended;

  if (request.method === "POST" && ACCEPT_ASSIGN_PATHS.has(path)) {
    let body: {
      student_id?: number;
      circle_id?: number;
      track_id?: number | null;
      note?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    const circleId = Number(body.circle_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(circleId) || circleId <= 0) {
      return json({ error: "student_id_and_circle_id_required" }, 400);
    }

    const scopeWhere = studentsInScopeWhere(scope);
    const allowed = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ? AND s.is_active = 1`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope), studentId)
      .first();

    if (!allowed) return json({ error: "student_out_of_scope" }, 403);

    const circle = await env.DB.prepare(
      `SELECT id, track_id FROM circles
       WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, auth.complexId)
      .first<{ id: number; track_id: number | null }>();

    if (!circle) return json({ error: "circle_not_found" }, 404);

    const trackId =
      body.track_id != null && body.track_id !== undefined
        ? Number(body.track_id)
        : circle.track_id;

    const note =
      typeof body.note === "string"
        ? body.note.trim().slice(0, 500)
        : "قبول وتوزيع فوري — الشبكة المركزية";

    await assignStudentCircle(env, studentId, circleId, trackId, note);

    await env.DB.prepare(
      `UPDATE students SET admission_status = NULL
       WHERE id = ? AND admission_status = 'pending_placement'`,
    )
      .bind(studentId)
      .run();

    return json({
      ok: true,
      message: "تم تنفيذ القبول والتوزيع دون المساس بسجل الرصد",
    });
  }

  if (request.method === "GET" && path === "/api/edu-dept/scope") {
    const row = await env.DB.prepare(
      `SELECT supervisor_scope FROM users WHERE id = ?`,
    )
      .bind(auth.userId)
      .first<{ supervisor_scope: string | null }>();
    return json({
      supervisor_scope: row?.supervisor_scope ?? "global",
      scope,
    });
  }

  if (
    request.method === "GET" &&
    path === "/api/edu-dept/student-attendance/today"
  ) {
    const date = url.searchParams.get("date")?.trim() || todayIso();
    const scopeWhere = studentsInScopeWhere(scope);
    const binds = [date, auth.complexId, ...studentsInScopeBinds(auth.complexId, scope)];

    const rows = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar, s.stage_id,
              c.name_ar AS circle_name,
              COALESCE(sda.status, 'present') AS status,
              sda.recorded_at,
              sda.source
       FROM students s
       LEFT JOIN circles c ON c.id = s.current_circle_id
       LEFT JOIN student_attendance sda
         ON sda.student_id = s.id AND sda.attendance_date = ?
       WHERE ${scopeWhere}
       ORDER BY c.name_ar, s.full_name_ar`,
    )
      .bind(...binds)
      .all<{
        student_id: number;
        full_name_ar: string;
        stage_id: number | null;
        circle_name: string | null;
        status: string;
        recorded_at: string | null;
        source: string | null;
      }>();

    return json({
      date,
      items: rows.results ?? [],
      default_status: "present",
      scope,
    });
  }

  if (
    request.method === "POST" &&
    path === "/api/edu-dept/student-attendance/init-today"
  ) {
    const date = todayIso();
    const scopeWhere = studentsInScopeWhere(scope);
    const students = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere}`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope))
      .all<{ id: number }>();

    for (const row of students.results ?? []) {
      await env.DB.prepare(
        `INSERT INTO student_attendance
         (complex_id, student_id, attendance_date, status, source, recorded_by_user_id)
         VALUES (?, ?, ?, 'present', 'edu_supervisor', ?)
         ON CONFLICT(student_id, attendance_date) DO NOTHING`,
      )
        .bind(auth.complexId, row.id, date, auth.userId)
        .run();
    }

    return json({ ok: true, date, count: students.results?.length ?? 0 });
  }

  if (
    request.method === "POST" &&
    path === "/api/edu-dept/student-attendance/upsert"
  ) {
    let body: {
      student_id?: number;
      status?: string;
      attendance_date?: string;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    if (!Number.isFinite(studentId)) return json({ error: "student_id_required" }, 400);
    const status = body.status ?? "present";
    if (!["present", "absent", "excused"].includes(status)) {
      return json({ error: "invalid_status" }, 400);
    }
    const date = body.attendance_date?.trim() || todayIso();
    const scopeWhere = studentsInScopeWhere(scope);

    const allowed = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ?`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope), studentId)
      .first();

    if (!allowed) return json({ error: "student_out_of_scope" }, 403);

    const circleRow = await env.DB.prepare(
      `SELECT current_circle_id, current_track_id FROM students WHERE id = ?`,
    )
      .bind(studentId)
      .first<{ current_circle_id: number | null; current_track_id: number | null }>();

    await upsertStudentAttendance(env, {
      complexId: auth.complexId,
      studentId,
      attendanceDate: date,
      status,
      source: "edu_supervisor",
      circleId: circleRow?.current_circle_id ?? null,
      trackId: circleRow?.current_track_id ?? null,
      recordedByUserId: auth.userId,
      notes: body.notes?.trim() ?? null,
    });

    return json({ ok: true, student_id: studentId, status, attendance_date: date });
  }

  if (request.method === "GET" && path === "/api/edu-dept/master-grid") {
    try {
      const pendingOnly = url.searchParams.get("pending_acceptance") === "1";
      const q = (url.searchParams.get("q") ?? "").trim();
      const scopeWhere = await buildStudentsInScopeWhere(env, scope);
      const hasCurrentCircle = await tableHasColumn(
        env,
        "students",
        "current_circle_id",
      );
      const hasCurrentTrack = await tableHasColumn(
        env,
        "students",
        "current_track_id",
      );

      let innerSql: string;
      if (hasCurrentCircle) {
        innerSql = `
        SELECT
          s.id,
          s.full_name_ar,
          s.is_active,
          s.stage_id,
          s.school_grade,
          s.admission_status,
          s.current_circle_id,
          c.name_ar AS current_circle_name,
          ${hasCurrentTrack ? "s.current_track_id" : "NULL AS current_track_id"},
          ${hasCurrentTrack ? "t.name_ar AS current_track_name" : "NULL AS current_track_name"}
        FROM students s
        LEFT JOIN circles c ON c.id = s.current_circle_id
        ${hasCurrentTrack ? "LEFT JOIN tracks t ON t.id = s.current_track_id" : ""}
        WHERE ${scopeWhere}`;
      } else {
        innerSql = `
        SELECT
          s.id,
          s.full_name_ar,
          s.is_active,
          s.stage_id,
          s.school_grade,
          s.admission_status,
          h.circle_id AS current_circle_id,
          c.name_ar AS current_circle_name,
          h.track_id AS current_track_id,
          t.name_ar AS current_track_name
        FROM students s
        LEFT JOIN student_circle_history h
          ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
        LEFT JOIN circles c ON c.id = h.circle_id
        LEFT JOIN tracks t ON t.id = h.track_id
        WHERE ${scopeWhere}`;
      }

      let sql = `SELECT * FROM (${innerSql}) master_sheet WHERE 1 = 1`;
      const binds: Array<string | number> = [
        ...studentsInScopeBinds(auth.complexId, scope),
      ];
      if (pendingOnly) {
        sql += ` AND current_circle_id IS NULL AND current_track_id IS NULL`;
      }
      if (q.length > 0) {
        sql += ` AND full_name_ar LIKE ?`;
        binds.push(`%${q}%`);
      }
      sql += ` ORDER BY full_name_ar LIMIT 500`;
      const rows = await env.DB.prepare(sql).bind(...binds).all();

      const circles = await env.DB.prepare(
        `SELECT id, name_ar
         FROM circles
         WHERE complex_id = ? AND is_active = 1
         ORDER BY name_ar`,
      )
        .bind(auth.complexId)
        .all();

      const tracks = await env.DB.prepare(
        `SELECT id, name_ar
         FROM tracks
         WHERE complex_id = ?
         ORDER BY name_ar`,
      )
        .bind(auth.complexId)
        .all();

      return json({
        items: rows.results ?? [],
        circles: circles.results ?? [],
        tracks: tracks.results ?? [],
        pending_filter_applied: pendingOnly,
      });
    } catch (err) {
      console.error("master_grid_failed", err);
      return json(
        {
          error: "master_grid_failed",
          message: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  return json({ error: "Not Found", path }, 404);
}
