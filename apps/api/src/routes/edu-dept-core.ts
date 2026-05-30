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
const TEACHER_ONLY_ROLES = ["teacher"] as const;
const TEACHER_EDU_ROLES = ["teacher", "edu_supervisor", "super_admin"] as const;
const RECITATION_ROLES = [
  "teacher",
  "edu_supervisor",
  "super_admin",
  "prog_supervisor",
] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Academic semester start (September) for cumulative face metrics. */
function semesterStartIso(ref = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  if (m >= 9) return `${y}-09-01`;
  return `${y - 1}-09-01`;
}

function computeQualityPct(
  row: {
    listened: number | boolean;
    repeated: number | boolean;
    revised: number | boolean;
    error_count: number;
    tune_errors: number;
  },
  wL: number,
  wRev: number,
  wRep: number,
  wRabt: number,
  pen: number,
  maxScore: number,
): number {
  const listened = Boolean(row.listened);
  const repeated = Boolean(row.repeated);
  const revised = Boolean(row.revised);
  const rabtBonus = listened && repeated && revised ? wRabt : 0;
  const earned =
    (listened ? wL : 0) +
    (repeated ? wRep : 0) +
    (revised ? wRev : 0) +
    rabtBonus;
  const penalties = pen * (Number(row.error_count) + Number(row.tune_errors));
  const raw = maxScore > 0 ? ((earned - penalties) / maxScore) * 100 : 0;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
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

async function resolveTeacherPrimaryCircle(
  env: Env,
  teacherUserId: number,
  complexId: number,
): Promise<{ id: number; name_ar: string } | null> {
  const hasTeacherId = await tableHasColumn(env, "circles", "teacher_id");
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");

  if (hasTeacherId) {
    let sql = `SELECT id, name_ar FROM circles WHERE teacher_id = ? AND complex_id = ?`;
    const binds: number[] = [teacherUserId, complexId];
    if (hasIsActive) sql += ` AND is_active = 1`;
    sql += ` ORDER BY id LIMIT 1`;
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ id: number; name_ar: string }>();
    if (row) return row;
  }

  if (await hasTable(env, "teacher_assignments")) {
    let sql = `SELECT c.id, c.name_ar
       FROM teacher_assignments ta
       INNER JOIN circles c ON c.id = ta.circle_id
       WHERE ta.user_id = ? AND c.complex_id = ?`;
    const binds: number[] = [teacherUserId, complexId];
    if (hasIsActive) sql += ` AND c.is_active = 1`;
    sql += ` ORDER BY c.id LIMIT 1`;
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ id: number; name_ar: string }>();
    if (row) return row;
  }

  return null;
}

async function teacherCircleIds(
  env: Env,
  userId: number,
  complexId: number,
): Promise<number[]> {
  const primary = await resolveTeacherPrimaryCircle(env, userId, complexId);
  if (primary) return [primary.id];

  if (!(await hasTable(env, "teacher_assignments"))) return [];
  const rows = await env.DB.prepare(
    `SELECT circle_id FROM teacher_assignments WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ circle_id: number }>();
  return (rows.results ?? []).map((r) => r.circle_id);
}

const TEACHER_NO_CIRCLE_MSG = "لم يتم ربط حلقة بهذا المعلم بعد";

async function resolveRecitationCircles(
  env: Env,
  auth: { userId: number; complexId: number; role: string },
): Promise<Array<{ id: number; name_ar: string }>> {
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");

  if (auth.role === "teacher") {
    const circle = await resolveTeacherPrimaryCircle(env, auth.userId, auth.complexId);
    if (!circle) return [];
    return [circle];
  }

  if (auth.role === "prog_supervisor") {
    const scope = await loadUserScope(env, auth.userId);
    let sql = `SELECT c.id, c.name_ar FROM circles c WHERE c.complex_id = ?`;
    const binds: (string | number)[] = [auth.complexId];
    if (hasIsActive) sql += ` AND c.is_active = 1`;
    if (scope.type === "stages") {
      const ph = scope.stageIds.map(() => "?").join(",");
      sql += ` AND c.stage_id IN (${ph})`;
      binds.push(...scope.stageIds);
    }
    if (await hasTable(env, "supervisor_scopes")) {
      const scoped = await env.DB.prepare(
        `SELECT circle_id FROM supervisor_scopes WHERE user_id = ?`,
      )
        .bind(auth.userId)
        .all<{ circle_id: number }>();
      const circleIds = (scoped.results ?? []).map((r) => r.circle_id);
      if (circleIds.length > 0) {
        sql += ` AND c.id IN (${circleIds.map(() => "?").join(",")})`;
        binds.push(...circleIds);
      }
    }
    sql += ` ORDER BY c.name_ar`;
    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{ id: number; name_ar: string }>();
    return rows.results ?? [];
  }

  let sql = `SELECT id, name_ar FROM circles WHERE complex_id = ?`;
  const binds: (string | number)[] = [auth.complexId];
  if (hasIsActive) sql += ` AND is_active = 1`;
  if (auth.role === "edu_supervisor" && (await hasTable(env, "supervisor_scopes"))) {
    sql += ` AND id IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ?)`;
    binds.push(auth.userId);
  }
  sql += ` ORDER BY name_ar`;
  const rows = await env.DB.prepare(sql)
    .bind(...binds)
    .all<{ id: number; name_ar: string }>();
  return rows.results ?? [];
}

async function canAccessRecitationCircle(
  env: Env,
  auth: { userId: number; complexId: number; role: string },
  circleId: number,
): Promise<boolean> {
  const circles = await resolveRecitationCircles(env, auth);
  return circles.some((c) => c.id === circleId);
}

async function loadDailyRecitationItems(
  env: Env,
  complexId: number,
  circleId: number,
  date: string,
) {
  const students = await studentsInCircle(env, complexId, circleId);
  const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
  const markCols = hasFace
    ? `student_id, listened, repeated, revised, error_count, tune_errors, notes, face_count`
    : `student_id, listened, repeated, revised, error_count, tune_errors, notes`;
  const marks = await env.DB.prepare(
    `SELECT ${markCols}
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
      face_count?: number;
    }>();
  const byStudent = new Map((marks.results ?? []).map((m) => [m.student_id, m]));
  return students.map((s) => {
    const m = byStudent.get(s.id);
    return {
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      listened: Boolean(m?.listened),
      repeated: Boolean(m?.repeated),
      revised: Boolean(m?.revised),
      error_count: m?.error_count ?? 0,
      tune_errors: m?.tune_errors ?? 0,
      face_count: hasFace ? Number(m?.face_count ?? 0) : 0,
      notes: m?.notes ?? "",
    };
  });
}

function serverError(scope: string, err: unknown): Response {
  console.error(`[edu-dept-core] ${scope}:`, err);
  return json(
    {
      error: "api_internal_crash",
      message: err instanceof Error ? err.message : "internal_error",
    },
    500,
  );
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

    const hasRabt = await tableHasColumn(env, "edu_settings", "rabt_weight");

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        hasRabt
          ? `SELECT weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error, updated_at
             FROM edu_settings WHERE complex_id = ?`
          : `SELECT weight_listening, weight_revision, weight_repeat, penalty_per_error, updated_at
             FROM edu_settings WHERE complex_id = ?`,
      )
        .bind(auth.complexId)
        .first<Record<string, number>>();
      return json({
        settings: {
          weight_listening: row?.weight_listening ?? 1,
          weight_revision: row?.weight_revision ?? 1,
          weight_repeat: row?.weight_repeat ?? 1,
          rabt_weight: hasRabt ? (row?.rabt_weight ?? 1) : 1,
          penalty_per_error: row?.penalty_per_error ?? 0.5,
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
      const wRabt = Number(body.rabt_weight ?? 1);
      const pen = Number(body.penalty_per_error ?? 0.5);
      if (hasRabt) {
        await env.DB.prepare(
          `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(complex_id) DO UPDATE SET
             weight_listening = excluded.weight_listening,
             weight_revision = excluded.weight_revision,
             weight_repeat = excluded.weight_repeat,
             rabt_weight = excluded.rabt_weight,
             penalty_per_error = excluded.penalty_per_error,
             updated_at = datetime('now')`,
        )
          .bind(auth.complexId, wL, wR, wRep, wRabt, pen)
          .run();
      } else {
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
      }
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
      circleIds = await teacherCircleIds(env, auth.userId, auth.complexId);
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

  // --- My students (auto circle for teacher; scoped circles for supervisors) ---
  if (path === "/api/edu-dept/my-students" && request.method === "GET") {
    if (!requireRoles(auth, [...RECITATION_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    try {
      const date = url.searchParams.get("date")?.trim() || todayIso();
      const circleParam = url.searchParams.get("circle_id");

      let circleId: number;
      let circleName = "";
      let circles: Array<{ id: number; name_ar: string }> = [];

      if (auth.role === "teacher") {
        const teacherCircle = await resolveTeacherPrimaryCircle(
          env,
          auth.userId,
          auth.complexId,
        );
        if (!teacherCircle) {
          return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
        }
        circleId = teacherCircle.id;
        circleName = teacherCircle.name_ar;
        circles = [teacherCircle];
      } else {
        circles = await resolveRecitationCircles(env, auth);
        if (circles.length === 0) {
          return json({ error: "no_circle_assigned" }, 404);
        }

        const requested = circleParam != null ? Number(circleParam) : NaN;
        if (Number.isFinite(requested) && requested > 0) {
          circleId = requested;
        } else if (circles.length === 1) {
          circleId = circles[0].id;
        } else {
          return json({
            date,
            circle_id: null,
            circle_name: null,
            circles,
            items: [],
            needs_circle_selection: true,
          });
        }
        if (!(await canAccessRecitationCircle(env, auth, circleId))) {
          return json({ error: "forbidden" }, 403);
        }
        circleName = circles.find((c) => c.id === circleId)?.name_ar ?? "";
      }

      const items = await loadDailyRecitationItems(env, auth.complexId, circleId, date);
      return json({
        date,
        circle_id: circleId,
        circle_name: circleName,
        circles,
        needs_circle_selection: false,
        items,
      });
    } catch (err) {
      return serverError("my-students", err);
    }
  }

  // --- Daily recitation ---
  if (path === "/api/edu-dept/daily-recitation") {
    if (!requireRoles(auth, [...RECITATION_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const date = url.searchParams.get("date") ?? todayIso();
    const circleIdParam = Number(url.searchParams.get("circle_id"));

    if (request.method === "GET") {
      try {
        let circleId = circleIdParam;
        if (auth.role === "teacher") {
          const teacherCircle = await resolveTeacherPrimaryCircle(
            env,
            auth.userId,
            auth.complexId,
          );
          if (!teacherCircle) {
            return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
          }
          circleId = teacherCircle.id;
        }
        if (!Number.isFinite(circleId) || circleId <= 0) {
          return json({ error: "circle_id_required" }, 400);
        }
        if (!(await canAccessRecitationCircle(env, auth, circleId))) {
          return json({ error: "forbidden" }, 403);
        }
        const items = await loadDailyRecitationItems(env, auth.complexId, circleId, date);
        return json({ items, date, circle_id: circleId });
      } catch (err) {
        return serverError("daily-recitation-get", err);
      }
    }

    if (request.method === "POST") {
      try {
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
            face_count?: number;
            notes?: string;
          }>;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        let cid = Number(body.circle_id);
        if (auth.role === "teacher") {
          const teacherCircle = await resolveTeacherPrimaryCircle(
            env,
            auth.userId,
            auth.complexId,
          );
          if (!teacherCircle) {
            return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
          }
          cid = teacherCircle.id;
        }
        const recDate = body.recitation_date?.trim() || todayIso();
        if (!Number.isFinite(cid) || cid <= 0) {
          return json({ error: "circle_id_required" }, 400);
        }
        if (!(await canAccessRecitationCircle(env, auth, cid))) {
          return json({ error: "forbidden" }, 403);
        }

        const rawRows = body.rows;
        if (rawRows != null && !Array.isArray(rawRows)) {
          return json({ error: "rows_must_be_array" }, 400);
        }
        const rows = Array.isArray(rawRows) ? rawRows : [];
        const students = await studentsInCircle(env, auth.complexId, cid);
        const studentIds = new Set(students.map((s) => s.id));

        const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
        const stmts = rows
          .filter((r) => studentIds.has(Number(r.student_id)))
          .map((r) => {
            if (hasFace) {
              return env.DB.prepare(
                `INSERT INTO edu_daily_recitation
                  (student_id, teacher_user_id, circle_id, recitation_date, listened, repeated, revised, error_count, tune_errors, face_count, notes, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                 ON CONFLICT(student_id, recitation_date) DO UPDATE SET
                   teacher_user_id = excluded.teacher_user_id,
                   circle_id = excluded.circle_id,
                   listened = excluded.listened,
                   repeated = excluded.repeated,
                   revised = excluded.revised,
                   error_count = excluded.error_count,
                   tune_errors = excluded.tune_errors,
                   face_count = excluded.face_count,
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
                Math.max(0, Math.floor(Number(r.face_count ?? 0))),
                typeof r.notes === "string" ? r.notes.slice(0, 500) : null,
              );
            }
            return env.DB.prepare(
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
            );
          });

        if (stmts.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < stmts.length; i += chunkSize) {
            await env.DB.batch(stmts.slice(i, i + chunkSize));
          }
        }
        return json({ ok: true, saved: stmts.length, circle_id: cid });
      } catch (err) {
        return serverError("daily-recitation-post", err);
      }
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

  // --- Progress reports (supervisors) ---
  if (path === "/api/edu-dept/reports/progress" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const today = todayIso();
    const dateParam = url.searchParams.get("date")?.trim();
    const dateFromParam = url.searchParams.get("date_from")?.trim();
    const dateToParam = url.searchParams.get("date_to")?.trim();
    const dateFrom = dateFromParam || dateParam || today;
    const dateTo = dateToParam || dateParam || today;
    const circleIdParam = url.searchParams.get("circle_id");
    const circleFilter =
      circleIdParam != null && circleIdParam !== ""
        ? Number(circleIdParam)
        : null;

    const hasRabt = await tableHasColumn(env, "edu_settings", "rabt_weight");
    const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
    const settingsRow = await env.DB.prepare(
      hasRabt
        ? `SELECT weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error
           FROM edu_settings WHERE complex_id = ?`
        : `SELECT weight_listening, weight_revision, weight_repeat, penalty_per_error
           FROM edu_settings WHERE complex_id = ?`,
    )
      .bind(auth.complexId)
      .first<Record<string, number>>();

    const wL = Number(settingsRow?.weight_listening ?? 1);
    const wRev = Number(settingsRow?.weight_revision ?? 1);
    const wRep = Number(settingsRow?.weight_repeat ?? 1);
    const wRabt = hasRabt ? Number(settingsRow?.rabt_weight ?? 1) : 1;
    const pen = Number(settingsRow?.penalty_per_error ?? 0.5);
    const maxScore = wL + wRev + wRep + wRabt;

    const selectCols = hasFace
      ? `dr.student_id, dr.listened, dr.repeated, dr.revised,
         dr.error_count, dr.tune_errors, dr.face_count, dr.circle_id, dr.recitation_date,
         s.full_name_ar, c.name_ar AS circle_name`
      : `dr.student_id, dr.listened, dr.repeated, dr.revised,
         dr.error_count, dr.tune_errors, dr.circle_id, dr.recitation_date,
         s.full_name_ar, c.name_ar AS circle_name`;

    let sql = `
      SELECT ${selectCols}
      FROM edu_daily_recitation dr
      INNER JOIN students s ON s.id = dr.student_id AND s.complex_id = ?
      LEFT JOIN circles c ON c.id = dr.circle_id
      WHERE dr.recitation_date >= ? AND dr.recitation_date <= ?`;
    const binds: (string | number)[] = [auth.complexId, dateFrom, dateTo];
    if (circleFilter != null && Number.isFinite(circleFilter) && circleFilter > 0) {
      sql += ` AND dr.circle_id = ?`;
      binds.push(circleFilter);
    }
    sql += ` ORDER BY s.full_name_ar, dr.recitation_date`;

    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{
        student_id: number;
        listened: number;
        repeated: number;
        revised: number;
        error_count: number;
        tune_errors: number;
        face_count?: number;
        circle_id: number;
        recitation_date: string;
        full_name_ar: string;
        circle_name: string | null;
      }>();

    type StudentAgg = {
      student_id: number;
      full_name_ar: string;
      circle_id: number;
      circle_name: string;
      qualitySum: number;
      qualityCount: number;
      error_count: number;
      face_count: number;
      listened: boolean;
      repeated: boolean;
      revised: boolean;
    };

    type CircleAgg = { sum: number; count: number; name: string };
    const studentMap = new Map<number, StudentAgg>();
    const circleMap = new Map<number, CircleAgg>();
    let qualitySum = 0;
    let activeCount = 0;
    let rowCount = 0;

    for (const r of rows.results ?? []) {
      const quality_pct = computeQualityPct(r, wL, wRev, wRep, wRabt, pen, maxScore);
      const listened = Boolean(r.listened);
      const repeated = Boolean(r.repeated);
      const revised = Boolean(r.revised);
      const faces = hasFace ? Number(r.face_count ?? 0) : 0;

      if (listened || repeated || revised) activeCount += 1;
      qualitySum += quality_pct;
      rowCount += 1;

      const cid = r.circle_id;
      const cname = r.circle_name ?? "—";
      const prevCircle = circleMap.get(cid) ?? { sum: 0, count: 0, name: cname };
      prevCircle.sum += quality_pct;
      prevCircle.count += 1;
      prevCircle.name = cname;
      circleMap.set(cid, prevCircle);

      const prev = studentMap.get(r.student_id) ?? {
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        circle_id: r.circle_id,
        circle_name: cname,
        qualitySum: 0,
        qualityCount: 0,
        error_count: 0,
        face_count: 0,
        listened: false,
        repeated: false,
        revised: false,
      };
      prev.qualitySum += quality_pct;
      prev.qualityCount += 1;
      prev.error_count += Number(r.error_count);
      prev.face_count += faces;
      prev.listened = prev.listened || listened;
      prev.repeated = prev.repeated || repeated;
      prev.revised = prev.revised || revised;
      prev.circle_name = cname;
      studentMap.set(r.student_id, prev);
    }

    const items = [...studentMap.values()]
      .map((s) => ({
        student_id: s.student_id,
        full_name_ar: s.full_name_ar,
        circle_id: s.circle_id,
        circle_name: s.circle_name,
        quality_pct:
          s.qualityCount > 0
            ? Math.round((s.qualitySum / s.qualityCount) * 10) / 10
            : 0,
        listened: s.listened,
        repeated: s.repeated,
        revised: s.revised,
        error_count: s.error_count,
        face_count: s.face_count,
      }))
      .sort((a, b) => a.full_name_ar.localeCompare(b.full_name_ar, "ar"));

    const avgQuality =
      rowCount > 0 ? Math.round((qualitySum / rowCount) * 10) / 10 : 0;

    let topCircle: { circle_id: number; circle_name: string; avg_quality: number } | null =
      null;
    for (const [cid, agg] of circleMap) {
      if (agg.count === 0) continue;
      const avg = agg.sum / agg.count;
      if (!topCircle || avg > topCircle.avg_quality) {
        topCircle = {
          circle_id: cid,
          circle_name: agg.name,
          avg_quality: Math.round(avg * 10) / 10,
        };
      }
    }

    const semesterStart = semesterStartIso();
    let facesSemesterSql = `
      SELECT COALESCE(SUM(dr.face_count), 0) AS total
      FROM edu_daily_recitation dr
      INNER JOIN students s ON s.id = dr.student_id AND s.complex_id = ?
      WHERE dr.recitation_date >= ?`;
    const facesSemesterBinds: (string | number)[] = [auth.complexId, semesterStart];
    if (circleFilter != null && Number.isFinite(circleFilter) && circleFilter > 0) {
      facesSemesterSql += ` AND dr.circle_id = ?`;
      facesSemesterBinds.push(circleFilter);
    }

    let facesTodaySql = `
      SELECT COALESCE(SUM(dr.face_count), 0) AS total
      FROM edu_daily_recitation dr
      INNER JOIN students s ON s.id = dr.student_id AND s.complex_id = ?
      WHERE dr.recitation_date = ?`;
    const facesTodayBinds: (string | number)[] = [auth.complexId, today];
    if (circleFilter != null && Number.isFinite(circleFilter) && circleFilter > 0) {
      facesTodaySql += ` AND dr.circle_id = ?`;
      facesTodayBinds.push(circleFilter);
    }

    let totalFacesSemester = 0;
    let facesToday = 0;
    if (hasFace) {
      const semRow = await env.DB.prepare(facesSemesterSql)
        .bind(...facesSemesterBinds)
        .first<{ total: number }>();
      totalFacesSemester = Number(semRow?.total ?? 0);
      const todayRow = await env.DB.prepare(facesTodaySql)
        .bind(...facesTodayBinds)
        .first<{ total: number }>();
      facesToday = Number(todayRow?.total ?? 0);
    }

    const circles = await env.DB.prepare(
      `SELECT id, name_ar FROM circles WHERE complex_id = ? AND is_active = 1 ORDER BY name_ar`,
    )
      .bind(auth.complexId)
      .all<{ id: number; name_ar: string }>();

    return json({
      date: dateTo,
      date_from: dateFrom,
      date_to: dateTo,
      semester_start: semesterStart,
      summary: {
        avg_quality: avgQuality,
        top_circle: topCircle,
        active_students: activeCount,
        total_records: rowCount,
        total_faces_semester: totalFacesSemester,
        faces_today: facesToday,
      },
      circles: circles.results ?? [],
      items,
    });
  }

  return null;
}
