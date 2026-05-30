import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";

const TEACHER_ONLY = ["teacher"] as const;

const DEFAULT_COMPETITION_TASKS = [
  { title_ar: "حفظ إضافي", weight_points: 2 },
  { title_ar: "مراجعة", weight_points: 2 },
  { title_ar: "حضور مبكر", weight_points: 1 },
  { title_ar: "أدب وسلوك", weight_points: 1 },
  { title_ar: "مهمة إضافية", weight_points: 1 },
] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function migrationRequired(): Response {
  return json({ error: "migration_required", migration: "027_edu_mega_update" }, 503);
}

function serverError(scope: string, err: unknown): Response {
  console.error(`[edu-dept-mega] ${scope}:`, err);
  return json(
    {
      error: "api_internal_crash",
      message: err instanceof Error ? err.message : "internal_error",
    },
    500,
  );
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

async function seedDefaultTasks(env: Env, compId: number): Promise<void> {
  if (!(await hasTable(env, "competition_tasks"))) return;
  const stmts = DEFAULT_COMPETITION_TASKS.map((t, i) =>
    env.DB.prepare(
      `INSERT INTO competition_tasks (competition_id, title_ar, weight_points, sort_order)
       VALUES (?, ?, ?, ?)`,
    ).bind(compId, t.title_ar, t.weight_points, i + 1),
  );
  if (stmts.length > 0) await env.DB.batch(stmts);
}

export async function handleEduDeptMegaRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;

  if (!path.startsWith("/api/edu-dept/teacher-competitions")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return authUnauthorizedResponse(request);
  if (!requireRoles(auth, [...TEACHER_ONLY])) return json({ error: "forbidden" }, 403);
  if (!(await hasTable(env, "teacher_competitions"))) return migrationRequired();

  try {
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
      const compId = Number(ins.meta.last_row_id);
      await seedDefaultTasks(env, compId);
      return json({ ok: true, id: compId });
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

      let tasks: { results?: unknown[] } = { results: [] };
      if (await hasTable(env, "competition_tasks")) {
        tasks = await env.DB.prepare(
          `SELECT id, title_ar, weight_points, sort_order
           FROM competition_tasks WHERE competition_id = ? ORDER BY sort_order, id`,
        )
          .bind(compId)
          .all();
      }

      const students = await studentsForTeacher(env, auth.complexId, auth.userId);
      const taskIds = (tasks.results ?? []).map((t: { id: number }) => t.id);
      let scores: Array<{ task_id: number; student_id: number; points: number }> = [];
      if (
        taskIds.length > 0 &&
        (await hasTable(env, "student_comp_scores"))
      ) {
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

    const leaderboardMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/leaderboard$/,
    );
    if (leaderboardMatch && request.method === "GET") {
      const compId = Number(leaderboardMatch[1]);
      if (!(await assertTeacherOwnsCompetition(env, compId, auth.userId, auth.complexId))) {
        return json({ error: "not_found" }, 404);
      }
      const students = await studentsForTeacher(env, auth.complexId, auth.userId);
      const scoreMap = new Map<number, number>();

      if (
        (await hasTable(env, "competition_tasks")) &&
        (await hasTable(env, "student_comp_scores"))
      ) {
        const rows = await env.DB.prepare(
          `SELECT scs.student_id, SUM(scs.points) AS total_points
           FROM student_comp_scores scs
           INNER JOIN competition_tasks ct ON ct.id = scs.task_id
           WHERE ct.competition_id = ?
           GROUP BY scs.student_id`,
        )
          .bind(compId)
          .all<{ student_id: number; total_points: number }>();
        for (const r of rows.results ?? []) {
          scoreMap.set(r.student_id, Number(r.total_points ?? 0));
        }
      }

      const items = students
        .map((s, idx) => ({
          rank: 0,
          student_id: s.id,
          full_name_ar: s.full_name_ar,
          total_points: scoreMap.get(s.id) ?? 0,
        }))
        .sort((a, b) => b.total_points - a.total_points || a.full_name_ar.localeCompare(b.full_name_ar, "ar"))
        .map((row, i) => ({ ...row, rank: i + 1 }));

      return json({ items });
    }

    const taskMatch = path.match(/^\/api\/edu-dept\/teacher-competitions\/(\d+)\/tasks$/);
    if (taskMatch && request.method === "POST") {
      if (!(await hasTable(env, "competition_tasks"))) return migrationRequired();
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
        .bind(compId, title, Number.isFinite(w) ? w : 1, sortOrder)
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const taskDelMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/tasks\/(\d+)$/,
    );
    if (taskDelMatch && request.method === "DELETE") {
      if (!(await hasTable(env, "competition_tasks"))) return migrationRequired();
      const compId = Number(taskDelMatch[1]);
      const taskId = Number(taskDelMatch[2]);
      if (!(await assertTeacherOwnsCompetition(env, compId, auth.userId, auth.complexId))) {
        return json({ error: "not_found" }, 404);
      }
      const owned = await env.DB.prepare(
        `SELECT id FROM competition_tasks WHERE id = ? AND competition_id = ?`,
      )
        .bind(taskId, compId)
        .first();
      if (!owned) return json({ error: "not_found" }, 404);
      if (await hasTable(env, "student_comp_scores")) {
        await env.DB.prepare(`DELETE FROM student_comp_scores WHERE task_id = ?`)
          .bind(taskId)
          .run();
      }
      await env.DB.prepare(`DELETE FROM competition_tasks WHERE id = ?`).bind(taskId).run();
      return json({ ok: true });
    }

    const scoresMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/scores$/,
    );
    if (scoresMatch && request.method === "POST") {
      if (!(await hasTable(env, "student_comp_scores"))) return migrationRequired();
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
      const rawList = body.scores;
      if (rawList != null && !Array.isArray(rawList)) {
        return json({ error: "scores_must_be_array" }, 400);
      }
      const list = Array.isArray(rawList) ? rawList : [];

      const taskRows = await env.DB.prepare(
        `SELECT id FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(compId)
        .all<{ id: number }>();
      const validTaskIds = new Set((taskRows.results ?? []).map((t) => t.id));
      const students = await studentsForTeacher(env, auth.complexId, auth.userId);
      const validStudentIds = new Set(students.map((s) => s.id));

      const stmts = list
        .filter(
          (s) =>
            validTaskIds.has(Number(s.task_id)) &&
            validStudentIds.has(Number(s.student_id)) &&
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

      if (stmts.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < stmts.length; i += chunkSize) {
          await env.DB.batch(stmts.slice(i, i + chunkSize));
        }
      }
      return json({ ok: true, saved: stmts.length });
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return serverError(path, err);
  }
}
