import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import {
  loadUserScope,
  studentsInScopeBinds,
  studentsInScopeWhere,
  teacherCanAccessStudent,
} from "../lib/dept-scope";
import { transferStudentCircle } from "../lib/edu-transfer";

const EDU_SETTINGS_ROLES = ["edu_supervisor", "super_admin"] as const;
const EDU_SUPERVISOR_ROLES = ["edu_supervisor", "super_admin"] as const;
const TEACHER_EDU_ROLES = ["teacher", "edu_supervisor", "super_admin"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function migrationRequired(): Response {
  return json({ error: "migration_required" }, 503);
}

async function studentsInCircle(
  env: Env,
  complexId: number,
  circleId: number,
): Promise<Array<{ id: number; full_name_ar: string }>> {
  const hasFlat = await tableHasColumn(env, "students", "current_circle_id");
  if (hasFlat) {
    const rows = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students
       WHERE complex_id = ? AND current_circle_id = ? AND is_active = 1
       ORDER BY full_name_ar`,
    )
      .bind(complexId, circleId)
      .all<{ id: number; full_name_ar: string }>();
    return rows.results ?? [];
  }
  const rows = await env.DB.prepare(
    `SELECT s.id, s.full_name_ar
     FROM students s
     INNER JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL AND h.circle_id = ?
     WHERE s.complex_id = ? AND s.is_active = 1
     ORDER BY s.full_name_ar`,
  )
    .bind(circleId, complexId)
    .all<{ id: number; full_name_ar: string }>();
  return rows.results ?? [];
}

async function teacherCircleIds(
  env: Env,
  userId: number,
): Promise<number[]> {
  const rows = await env.DB.prepare(
    `SELECT circle_id FROM teacher_assignments WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ circle_id: number }>();
  return (rows.results ?? []).map((r) => r.circle_id);
}

export async function handleEduDeptCoreRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-dept/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return authUnauthorizedResponse(request);

  // --- Settings ---
  if (path === "/api/edu-dept/settings") {
    if (!requireRoles(auth, [...EDU_SETTINGS_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_settings"))) return migrationRequired();

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        `SELECT weight_listening, weight_revision, weight_repeat, penalty_per_error, updated_at
         FROM edu_settings WHERE complex_id = ?`,
      )
        .bind(auth.complexId)
        .first();
      return json({
        settings: row ?? {
          weight_listening: 1,
          weight_revision: 1,
          weight_repeat: 1,
          penalty_per_error: 0.5,
        },
      });
    }

    if (request.method === "PATCH") {
      let body: Record<string, number>;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const wL = Number(body.weight_listening ?? 1);
      const wR = Number(body.weight_revision ?? 1);
      const wRep = Number(body.weight_repeat ?? 1);
      const pen = Number(body.penalty_per_error ?? 0.5);
      await env.DB.prepare(
        `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, penalty_per_error, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(complex_id) DO UPDATE SET
           weight_listening = excluded.weight_listening,
           weight_revision = excluded.weight_revision,
           weight_repeat = excluded.weight_repeat,
           penalty_per_error = excluded.penalty_per_error,
           updated_at = datetime('now')`,
      )
        .bind(auth.complexId, wL, wR, wRep, pen)
        .run();
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  // --- Teacher circles ---
  if (path === "/api/edu-dept/teacher/circles" && request.method === "GET") {
    if (!requireRoles(auth, [...TEACHER_EDU_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    let circleIds: number[] = [];
    if (auth.role === "teacher") {
      circleIds = await teacherCircleIds(env, auth.userId);
    } else {
      const rows = await env.DB.prepare(
        `SELECT id FROM circles WHERE complex_id = ? AND is_active = 1`,
      )
        .bind(auth.complexId)
        .all<{ id: number }>();
      circleIds = (rows.results ?? []).map((r) => r.id);
    }
    if (circleIds.length === 0) return json({ items: [] });
    const ph = circleIds.map(() => "?").join(",");
    const items = await env.DB.prepare(
      `SELECT id, name_ar FROM circles WHERE id IN (${ph}) ORDER BY name_ar`,
    )
      .bind(...circleIds)
      .all<{ id: number; name_ar: string }>();
    return json({ items: items.results ?? [] });
  }

  // --- Daily recitation ---
  if (path === "/api/edu-dept/daily-recitation") {
    if (!requireRoles(auth, [...TEACHER_EDU_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const date = url.searchParams.get("date") ?? todayIso();
    const circleId = Number(url.searchParams.get("circle_id"));

    if (request.method === "GET") {
      if (!Number.isFinite(circleId) || circleId <= 0) {
        return json({ error: "circle_id_required" }, 400);
      }
      if (auth.role === "teacher") {
        const allowed = await teacherCircleIds(env, auth.userId);
        if (!allowed.includes(circleId)) return json({ error: "forbidden" }, 403);
      }
      const students = await studentsInCircle(env, auth.complexId, circleId);
      const marks = await env.DB.prepare(
        `SELECT student_id, listened, repeated, revised, error_count, tune_errors, notes
         FROM edu_daily_recitation
         WHERE circle_id = ? AND recitation_date = ?`,
      )
        .bind(circleId, date)
        .all<{
          student_id: number;
          listened: number;
          repeated: number;
          revised: number;
          error_count: number;
          tune_errors: number;
          notes: string | null;
        }>();
      const byStudent = new Map(
        (marks.results ?? []).map((m) => [m.student_id, m]),
      );
      const items = students.map((s) => {
        const m = byStudent.get(s.id);
        return {
          student_id: s.id,
          full_name_ar: s.full_name_ar,
          listened: Boolean(m?.listened),
          repeated: Boolean(m?.repeated),
          revised: Boolean(m?.revised),
          error_count: m?.error_count ?? 0,
          tune_errors: m?.tune_errors ?? 0,
          notes: m?.notes ?? "",
        };
      });
      return json({ items, date, circle_id: circleId });
    }

    if (request.method === "POST") {
      let body: {
        circle_id?: number;
        recitation_date?: string;
        rows?: Array<{
          student_id: number;
          listened?: boolean;
          repeated?: boolean;
          revised?: boolean;
          error_count?: number;
          tune_errors?: number;
          notes?: string;
        }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const cid = Number(body.circle_id);
      const recDate = body.recitation_date?.trim() || todayIso();
      if (!Number.isFinite(cid) || cid <= 0) {
        return json({ error: "circle_id_required" }, 400);
      }
      if (auth.role === "teacher") {
        const allowed = await teacherCircleIds(env, auth.userId);
        if (!allowed.includes(cid)) return json({ error: "forbidden" }, 403);
      }
      const rows = body.rows ?? [];
      const stmts = rows.map((r) =>
        env.DB.prepare(
          `INSERT INTO edu_daily_recitation
            (student_id, teacher_user_id, circle_id, recitation_date, listened, repeated, revised, error_count, tune_errors, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(student_id, recitation_date) DO UPDATE SET
             teacher_user_id = excluded.teacher_user_id,
             circle_id = excluded.circle_id,
             listened = excluded.listened,
             repeated = excluded.repeated,
             revised = excluded.revised,
             error_count = excluded.error_count,
             tune_errors = excluded.tune_errors,
             notes = excluded.notes,
             updated_at = datetime('now')`,
        ).bind(
          r.student_id,
          auth.userId,
          cid,
          recDate,
          r.listened ? 1 : 0,
          r.repeated ? 1 : 0,
          r.revised ? 1 : 0,
          Number(r.error_count ?? 0),
          Number(r.tune_errors ?? 0),
          typeof r.notes === "string" ? r.notes.slice(0, 500) : null,
        ),
      );
      if (stmts.length > 0) await env.DB.batch(stmts);
      return json({ ok: true, saved: stmts.length });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  // --- Teacher requests ---
  if (!(await hasTable(env, "teacher_requests"))) {
    if (path.startsWith("/api/edu-dept/teacher-requests")) {
      return migrationRequired();
    }
  }

  if (path === "/api/edu-dept/teacher-requests" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    const status = url.searchParams.get("status") ?? "pending";
    const requestType = url.searchParams.get("request_type");
    let sql = `SELECT tr.id, tr.student_id, tr.teacher_user_id, tr.request_type, tr.status, tr.notes,
                      tr.target_circle_id, tr.created_at,
                      s.full_name_ar AS student_name,
                      u.full_name_ar AS teacher_name,
                      c.name_ar AS target_circle_name
               FROM teacher_requests tr
               JOIN students s ON s.id = tr.student_id
               JOIN users u ON u.id = tr.teacher_user_id
               LEFT JOIN circles c ON c.id = tr.target_circle_id
               WHERE tr.complex_id = ? AND tr.status = ?`;
    const binds: (string | number)[] = [auth.complexId, status];
    if (requestType === "transfer" || requestType === "escalation") {
      sql += ` AND tr.request_type = ?`;
      binds.push(requestType);
    }
    sql += ` ORDER BY tr.created_at DESC LIMIT 200`;
    const items = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: items.results ?? [] });
  }

  if (path === "/api/edu-dept/teacher-requests" && request.method === "POST") {
    if (!requireRoles(auth, ["teacher"])) {
      return json({ error: "forbidden" }, 403);
    }
    let body: {
      student_id?: number;
      request_type?: string;
      notes?: string;
      target_circle_id?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const studentId = Number(body.student_id);
    const requestType = body.request_type;
    if (
      !Number.isFinite(studentId) ||
      (requestType !== "transfer" && requestType !== "escalation")
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    if (!(await teacherCanAccessStudent(env, auth.userId, studentId))) {
      return json({ error: "forbidden_student" }, 403);
    }
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;
    const targetCircleId =
      body.target_circle_id != null ? Number(body.target_circle_id) : null;
    const res = await env.DB.prepare(
      `INSERT INTO teacher_requests
        (complex_id, student_id, teacher_user_id, request_type, status, notes, target_circle_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        auth.complexId,
        studentId,
        auth.userId,
        requestType,
        notes,
        Number.isFinite(targetCircleId) ? targetCircleId : null,
      )
      .run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  const reqMatch = path.match(/^\/api\/edu-dept\/teacher-requests\/(\d+)$/);
  if (reqMatch && request.method === "PATCH") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    const id = Number(reqMatch[1]);
    let body: { status?: string; target_circle_id?: number };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (body.status !== "approved" && body.status !== "rejected") {
      return json({ error: "invalid_status" }, 400);
    }
    const row = await env.DB.prepare(
      `SELECT * FROM teacher_requests WHERE id = ? AND complex_id = ?`,
    )
      .bind(id, auth.complexId)
      .first<{
        id: number;
        student_id: number;
        request_type: string;
        status: string;
        target_circle_id: number | null;
        notes: string | null;
      }>();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_resolved" }, 409);

    if (body.status === "approved" && row.request_type === "transfer") {
      const newCircleId = Number(body.target_circle_id ?? row.target_circle_id);
      if (!Number.isFinite(newCircleId) || newCircleId <= 0) {
        return json({ error: "target_circle_required" }, 400);
      }
      const circle = await env.DB.prepare(
        `SELECT id, track_id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
      )
        .bind(newCircleId, auth.complexId)
        .first<{ id: number; track_id: number | null }>();
      if (!circle) return json({ error: "circle_not_found" }, 404);
      await transferStudentCircle(env, {
        studentId: row.student_id,
        newCircleId,
        newTrackId: circle.track_id,
        movedByUserId: auth.userId,
        reason: row.notes ?? "موافقة على طلب نقل — القسم التعليمي",
      });
    }

    await env.DB.prepare(
      `UPDATE teacher_requests
       SET status = ?, resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`,
    )
      .bind(body.status, auth.userId, id)
      .run();

    return json({ ok: true, status: body.status });
  }

  // --- Manual transfer ---
  if (path === "/api/edu-dept/transfers/manual" && request.method === "POST") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
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
    if (!Number.isFinite(studentId) || !Number.isFinite(circleId)) {
      return json({ error: "student_id_and_circle_id_required" }, 400);
    }
    const scope = await loadUserScope(env, auth.userId);
    const scopeWhere = studentsInScopeWhere(scope);
    const allowed = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ?`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope), studentId)
      .first();
    if (!allowed) return json({ error: "student_out_of_scope" }, 403);

    const circle = await env.DB.prepare(
      `SELECT id, track_id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, auth.complexId)
      .first<{ id: number; track_id: number | null }>();
    if (!circle) return json({ error: "circle_not_found" }, 404);

    const trackId =
      body.track_id != null ? Number(body.track_id) : circle.track_id;
    const note =
      typeof body.note === "string"
        ? body.note.trim().slice(0, 500)
        : "نقل يدوي — القسم التعليمي";

    await transferStudentCircle(env, {
      studentId,
      newCircleId: circleId,
      newTrackId: trackId,
      movedByUserId: auth.userId,
      reason: note,
    });
    return json({ ok: true });
  }

  return null;
}
