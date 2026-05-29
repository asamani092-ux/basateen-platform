import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
const TEACHER_ONLY = ["teacher"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function migrationRequired(): Response {
  return json({ error: "migration_required", migration: "027_edu_mega_update" }, 503);
}

async function teacherCircleIds(env: Env, userId: number): Promise<number[]> {
  const rows = await env.DB.prepare(
    `SELECT circle_id FROM teacher_assignments WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ circle_id: number }>();
  return (rows.results ?? []).map((r) => r.circle_id);
}

async function studentsForTeacher(
  env: Env,
  complexId: number,
  teacherUserId: number,
): Promise<Array<{ id: number; full_name_ar: string }>> {
  const circleIds = await teacherCircleIds(env, teacherUserId);
  if (circleIds.length === 0) return [];
  const hasFlat = await tableHasColumn(env, "students", "current_circle_id");
  const ph = circleIds.map(() => "?").join(",");
  if (hasFlat) {
    const rows = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students
       WHERE complex_id = ? AND is_active = 1 AND current_circle_id IN (${ph})
       ORDER BY full_name_ar`,
    )
      .bind(complexId, ...circleIds)
      .all<{ id: number; full_name_ar: string }>();
    return rows.results ?? [];
  }
  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.full_name_ar
     FROM students s
     INNER JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       AND h.circle_id IN (${ph})
     WHERE s.complex_id = ? AND s.is_active = 1
     ORDER BY s.full_name_ar`,
  )
    .bind(...circleIds, complexId)
    .all<{ id: number; full_name_ar: string }>();
  return rows.results ?? [];
}

async function assertTeacherOwnsCompetition(
  env: Env,
  competitionId: number,
  teacherUserId: number,
  complexId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM teacher_competitions
     WHERE id = ? AND teacher_user_id = ? AND complex_id = ?`,
  )
    .bind(competitionId, teacherUserId, complexId)
    .first();
  return Boolean(row);
}

export async function handleEduDeptMegaRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;

  // Teacher sandbox competitions
  if (path.startsWith("/api/edu-dept/teacher-competitions")) {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return authUnauthorizedResponse(request);
    if (!requireRoles(auth, [...TEACHER_ONLY])) return json({ error: "forbidden" }, 403);
    if (!(await hasTable(env, "teacher_competitions"))) return migrationRequired();

    if (path === "/api/edu-dept/teacher-competitions" && request.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT id, name_ar, start_date, end_date, created_at
         FROM teacher_competitions
         WHERE teacher_user_id = ? AND complex_id = ?
         ORDER BY created_at DESC`,
      )
        .bind(auth.userId, auth.complexId)
        .all();
      return json({ items: rows.results ?? [] });
    }

    if (path === "/api/edu-dept/teacher-competitions" && request.method === "POST") {
      let body: { name_ar?: string; start_date?: string; end_date?: string };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const name = String(body.name_ar ?? "").trim();
      if (!name) return json({ error: "name_required" }, 400);
      const ins = await env.DB.prepare(
        `INSERT INTO teacher_competitions (complex_id, teacher_user_id, name_ar, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          auth.complexId,
          auth.userId,
          name,
          body.start_date?.trim() || null,
          body.end_date?.trim() || null,
        )
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const detailMatch = path.match(/^\/api\/edu-dept\/teacher-competitions\/(\d+)$/);
    if (detailMatch && request.method === "GET") {
      const compId = Number(detailMatch[1]);
      if (!(await assertTeacherOwnsCompetition(env, compId, auth.userId, auth.complexId))) {
        return json({ error: "not_found" }, 404);
      }
      const comp = await env.DB.prepare(
        `SELECT id, name_ar, start_date, end_date FROM teacher_competitions WHERE id = ?`,
      )
        .bind(compId)
        .first();

      const tasks = await env.DB.prepare(
        `SELECT id, title_ar, weight_points, sort_order
         FROM competition_tasks WHERE competition_id = ? ORDER BY sort_order, id`,
      )
        .bind(compId)
        .all();

      const students = await studentsForTeacher(env, auth.complexId, auth.userId);
      const taskIds = (tasks.results ?? []).map((t: { id: number }) => t.id);
      let scores: Array<{ task_id: number; student_id: number; points: number }> = [];
      if (taskIds.length > 0) {
        const ph = taskIds.map(() => "?").join(",");
        const scoreRows = await env.DB.prepare(
          `SELECT task_id, student_id, points FROM student_comp_scores
           WHERE task_id IN (${ph})`,
        )
          .bind(...taskIds)
          .all<{ task_id: number; student_id: number; points: number }>();
        scores = scoreRows.results ?? [];
      }

      return json({
        competition: comp,
        tasks: tasks.results ?? [],
        students,
        scores,
      });
    }

    const taskMatch = path.match(/^\/api\/edu-dept\/teacher-competitions\/(\d+)\/tasks$/);
    if (taskMatch && request.method === "POST") {
      const compId = Number(taskMatch[1]);
      if (!(await assertTeacherOwnsCompetition(env, compId, auth.userId, auth.complexId))) {
        return json({ error: "not_found" }, 404);
      }
      let body: { title_ar?: string; weight_points?: number };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const title = String(body.title_ar ?? "").trim();
      if (!title) return json({ error: "title_required" }, 400);
      const w = Number(body.weight_points ?? 1);
      const maxRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(compId)
        .first<{ m: number }>();
      const sortOrder = (maxRow?.m ?? 0) + 1;
      const ins = await env.DB.prepare(
        `INSERT INTO competition_tasks (competition_id, title_ar, weight_points, sort_order)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(compId, title, w, sortOrder)
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const scoresMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/scores$/,
    );
    if (scoresMatch && request.method === "POST") {
      const compId = Number(scoresMatch[1]);
      if (!(await assertTeacherOwnsCompetition(env, compId, auth.userId, auth.complexId))) {
        return json({ error: "not_found" }, 404);
      }
      let body: {
        scores?: Array<{ task_id: number; student_id: number; points: number }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const list = body.scores ?? [];
      const taskRows = await env.DB.prepare(
        `SELECT id FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(compId)
        .all<{ id: number }>();
      const validTaskIds = new Set((taskRows.results ?? []).map((t) => t.id));

      const stmts = list
        .filter(
          (s) =>
            validTaskIds.has(Number(s.task_id)) &&
            Number.isFinite(Number(s.student_id)) &&
            Number.isFinite(Number(s.points)),
        )
        .map((s) =>
          env.DB.prepare(
            `INSERT INTO student_comp_scores (task_id, student_id, points, updated_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(task_id, student_id) DO UPDATE SET
               points = excluded.points,
               updated_at = datetime('now')`,
          ).bind(Number(s.task_id), Number(s.student_id), Number(s.points)),
        );

      if (stmts.length > 0) await env.DB.batch(stmts);
      return json({ ok: true, saved: stmts.length });
    }

    return json({ error: "not_found" }, 404);
  }

  return null;
}
