import type { Env } from "../types";
import { refreshDailyAttendanceSnapshot } from "../lib/attendance-snapshot";
import {
  normalizeDailyMetrics,
  scoreFromMetrics,
} from "../lib/plan-estimator";
import { recordTeacherAutoAttendance } from "../lib/teacher-attendance";
import { teacherCanAccessStudent } from "../lib/dept-scope";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

const TEACHER_ROLES = ["teacher"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function activePlanForStudent(
  env: Env,
  studentId: number,
): Promise<{ id: number; daily_rabt_faces: number } | null> {
  const row = await env.DB.prepare(
    `SELECT id, daily_rabt_faces FROM student_semester_plans
     WHERE student_id = ? AND is_active = 1
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first<{ id: number; daily_rabt_faces: number }>();
  return row ?? null;
}

export async function handleTeacherDailyList(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...TEACHER_ROLES])) {
    return json({ error: "forbidden" }, 403);
  }

  const date =
    url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const rows = await env.DB.prepare(
    `SELECT
       tdm.id,
       tdm.student_id,
       tdm.plan_id,
       tdm.mark_date,
       tdm.score,
       tdm.notes,
       tdm.metrics_json,
       tdm.attendance_auto,
       tdm.logged_at,
       tdm.updated_at,
       s.full_name_ar
     FROM teacher_daily_marks tdm
     JOIN students s ON s.id = tdm.student_id
     JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     JOIN teacher_assignments ta ON ta.circle_id = h.circle_id AND ta.user_id = ?
     WHERE tdm.logged_by_user_id = ? AND tdm.mark_date = ?
     ORDER BY s.full_name_ar`,
  )
    .bind(auth.userId, auth.userId, date)
    .all<{
      id: number;
      student_id: number;
      plan_id: number | null;
      mark_date: string;
      score: number | null;
      notes: string | null;
      metrics_json: string | null;
      attendance_auto: number;
      logged_at: string;
      updated_at: string;
      full_name_ar: string;
    }>();

  const items = (rows.results ?? []).map((row) => ({
    ...row,
    metrics: row.metrics_json ? JSON.parse(row.metrics_json) : null,
  }));

  return json({ items, date });
}

export async function handleTeacherDailyUpsert(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...TEACHER_ROLES])) {
    return json({ error: "forbidden" }, 403);
  }

  let body: {
    student_id?: number;
    mark_date?: string;
    score?: number | null;
    notes?: string | null;
    plan_id?: number | null;
    metrics?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.student_id) return json({ error: "student_id_required" }, 400);

  if (!(await teacherCanAccessStudent(env, auth.userId, body.student_id))) {
    return json({ error: "forbidden_student" }, 403);
  }

  const markDate =
    body.mark_date?.trim() || new Date().toISOString().slice(0, 10);

  const plan =
    body.plan_id != null
      ? await env.DB.prepare(
          `SELECT id, daily_rabt_faces FROM student_semester_plans
           WHERE id = ? AND student_id = ? AND is_active = 1`,
        )
          .bind(body.plan_id, body.student_id)
          .first<{ id: number; daily_rabt_faces: number }>()
      : await activePlanForStudent(env, body.student_id);

  const rabtFaces = plan?.daily_rabt_faces ?? 0;
  const metrics = normalizeDailyMetrics(body.metrics, rabtFaces);
  const metricsJson = JSON.stringify(metrics);
  const score = body.score ?? scoreFromMetrics(metrics);
  const planId = plan?.id ?? body.plan_id ?? null;

  await env.DB.prepare(
    `DELETE FROM teacher_daily_marks
     WHERE student_id = ? AND mark_date = ? AND logged_by_user_id = ?`,
  )
    .bind(body.student_id, markDate, auth.userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO teacher_daily_marks
     (student_id, plan_id, mark_date, score, notes, metrics_json, logged_by_user_id, attendance_auto)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      body.student_id,
      planId,
      markDate,
      score,
      body.notes?.trim() ?? null,
      metricsJson,
      auth.userId,
    )
    .run();

  await recordTeacherAutoAttendance(
    env,
    auth.complexId,
    body.student_id,
    markDate,
    auth.userId,
  );
  await refreshDailyAttendanceSnapshot(env, auth.complexId, markDate);

  return json({
    ok: true,
    attendance_recorded: true,
    mark_date: markDate,
    student_id: body.student_id,
    score,
    metrics,
    plan_id: planId,
    updated_at: new Date().toISOString(),
  });
}
