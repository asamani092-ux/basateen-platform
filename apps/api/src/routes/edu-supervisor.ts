import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import {
  loadUserScope,
  studentsInScopeBinds,
  studentsInScopeWhere,
} from "../lib/supervisor-scope";
import { handleEduExtendedRoutes } from "./edu-extended";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleEduSupervisorRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-supervisor/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["edu_supervisor"])) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);

  const extended = await handleEduExtendedRoutes(
    request,
    env,
    url,
    { userId: auth.userId, complexId: auth.complexId },
    scope,
  );
  if (extended) return extended;

  if (request.method === "GET" && path === "/api/edu-supervisor/scope") {
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
    path === "/api/edu-supervisor/student-attendance/today"
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
       LEFT JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       LEFT JOIN circles c ON c.id = h.circle_id
       LEFT JOIN student_daily_attendance sda
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
    path === "/api/edu-supervisor/student-attendance/init-today"
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
        `INSERT INTO student_daily_attendance
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
    path === "/api/edu-supervisor/student-attendance/upsert"
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

    await env.DB.prepare(
      `INSERT INTO student_daily_attendance
       (complex_id, student_id, attendance_date, status, source, recorded_by_user_id, notes)
       VALUES (?, ?, ?, ?, 'edu_supervisor', ?, ?)
       ON CONFLICT(student_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         source = 'edu_supervisor',
         recorded_by_user_id = excluded.recorded_by_user_id,
         notes = excluded.notes,
         recorded_at = datetime('now')`,
    )
      .bind(
        auth.complexId,
        studentId,
        date,
        status,
        auth.userId,
        body.notes?.trim() ?? null,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO student_attendance_log
       (student_id, attendance_date, status, source, recorded_by_user_id, notes)
       VALUES (?, ?, ?, 'edu_supervisor', ?, ?)`,
    )
      .bind(studentId, date, status, auth.userId, body.notes?.trim() ?? null)
      .run();

    return json({ ok: true, student_id: studentId, status, attendance_date: date });
  }

  return json({ error: "Not Found", path }, 404);
}
