import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { randomMagicToken } from "../lib/magic-link";

const EDU_SUPERVISOR_ROLES = ["edu_supervisor", "super_admin"] as const;
const TEACHER_ONLY = ["teacher"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function migrationRequired(): Response {
  return json({ error: "migration_required", migration: "027_edu_mega_update" }, 503);
}

function parseDeductionRules(raw: string | null | undefined): {
  mistake_penalty: number;
  alert_penalty: number;
} {
  try {
    const o = JSON.parse(raw ?? "{}") as Record<string, number>;
    return {
      mistake_penalty: Number(o.mistake_penalty ?? 1),
      alert_penalty: Number(o.alert_penalty ?? 0.5),
    };
  } catch {
    return { mistake_penalty: 1, alert_penalty: 0.5 };
  }
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

/** Public quranic day — no auth */
export async function handlePublicQuranicDayRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/public\/quranic-day\/([^/]+)$/);
  if (!match) return null;
  if (!(await hasTable(env, "quranic_days"))) return migrationRequired();

  const token = decodeURIComponent(match[1]);

  const day = await env.DB.prepare(
    `SELECT id, complex_id, name_ar, event_date, deduction_rules, is_active
     FROM quranic_days WHERE magic_token = ? LIMIT 1`,
  )
    .bind(token)
    .first<{
      id: number;
      complex_id: number;
      name_ar: string;
      event_date: string;
      deduction_rules: string;
      is_active: number;
    }>();

  if (!day) return json({ error: "invalid_token" }, 404);
  if (day.is_active !== 1) return json({ error: "link_inactive" }, 403);

  if (request.method === "GET") {
    const hasFlat = await tableHasColumn(env, "students", "current_circle_id");
    let students: Array<{ student_id: number; full_name_ar: string }>;
    if (hasFlat) {
      const rows = await env.DB.prepare(
        `SELECT id AS student_id, full_name_ar FROM students
         WHERE complex_id = ? AND is_active = 1
         ORDER BY full_name_ar`,
      )
        .bind(day.complex_id)
        .all<{ student_id: number; full_name_ar: string }>();
      students = rows.results ?? [];
    } else {
      const rows = await env.DB.prepare(
        `SELECT id AS student_id, full_name_ar FROM students
         WHERE complex_id = ? AND is_active = 1
         ORDER BY full_name_ar`,
      )
        .bind(day.complex_id)
        .all<{ student_id: number; full_name_ar: string }>();
      students = rows.results ?? [];
    }

    return json({
      token,
      day: {
        id: day.id,
        name_ar: day.name_ar,
        event_date: day.event_date,
        deduction_rules: parseDeductionRules(day.deduction_rules),
      },
      students,
    });
  }

  if (request.method === "POST") {
    if (!(await hasTable(env, "quranic_day_records"))) return migrationRequired();

    let body: {
      student_id?: number;
      hizb_number?: number;
      mistakes?: number;
      alerts?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    const hizb = Number(body.hizb_number);
    const mistakes = Math.max(0, Math.floor(Number(body.mistakes ?? 0)));
    const alerts = Math.max(0, Math.floor(Number(body.alerts ?? 0)));

    if (!Number.isFinite(studentId) || studentId <= 0) {
      return json({ error: "student_id_required" }, 400);
    }
    if (!Number.isFinite(hizb) || hizb <= 0) {
      return json({ error: "hizb_number_required" }, 400);
    }

    const st = await env.DB.prepare(
      `SELECT id FROM students WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(studentId, day.complex_id)
      .first();
    if (!st) return json({ error: "student_not_found" }, 404);

    await env.DB.prepare(
      `INSERT INTO quranic_day_records (quranic_day_id, student_id, hizb_number, mistakes, alerts, recorded_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(quranic_day_id, student_id, hizb_number) DO UPDATE SET
         mistakes = excluded.mistakes,
         alerts = excluded.alerts,
         recorded_at = datetime('now')`,
    )
      .bind(day.id, studentId, hizb, mistakes, alerts)
      .run();

    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
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

  // Quranic days (supervisors)
  if (path.startsWith("/api/edu-dept/quranic-days")) {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return authUnauthorizedResponse(request);
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "quranic_days"))) return migrationRequired();

    if (path === "/api/edu-dept/quranic-days" && request.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT id, name_ar, event_date, deduction_rules, magic_token, is_active, created_at
         FROM quranic_days WHERE complex_id = ? ORDER BY event_date DESC, id DESC`,
      )
        .bind(auth.complexId)
        .all();
      const items = (rows.results ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        deduction_rules: parseDeductionRules(r.deduction_rules as string),
        has_magic_link: Boolean(r.magic_token),
      }));
      return json({ items });
    }

    if (path === "/api/edu-dept/quranic-days" && request.method === "POST") {
      let body: {
        name_ar?: string;
        event_date?: string;
        mistake_penalty?: number;
        alert_penalty?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const name = String(body.name_ar ?? "").trim();
      const eventDate = String(body.event_date ?? todayIso()).slice(0, 10);
      if (!name) return json({ error: "name_required" }, 400);
      const rules = JSON.stringify({
        mistake_penalty: Number(body.mistake_penalty ?? 1),
        alert_penalty: Number(body.alert_penalty ?? 0.5),
      });
      const ins = await env.DB.prepare(
        `INSERT INTO quranic_days (complex_id, name_ar, event_date, deduction_rules, created_by_user_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(auth.complexId, name, eventDate, rules, auth.userId)
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const magicMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)\/magic-link$/);
    if (magicMatch && request.method === "POST") {
      const dayId = Number(magicMatch[1]);
      const row = await env.DB.prepare(
        `SELECT id, magic_token FROM quranic_days WHERE id = ? AND complex_id = ?`,
      )
        .bind(dayId, auth.complexId)
        .first<{ id: number; magic_token: string | null }>();
      if (!row) return json({ error: "not_found" }, 404);

      let token = row.magic_token;
      if (!token) {
        token = randomMagicToken();
        await env.DB.prepare(
          `UPDATE quranic_days SET magic_token = ? WHERE id = ?`,
        )
          .bind(token, dayId)
          .run();
      }

      const publicPath = `/public/quranic-day/${token}`;
      return json({
        ok: true,
        token,
        public_path: publicPath,
        api_get: `/api/public/quranic-day/${token}`,
        api_post: `/api/public/quranic-day/${token}`,
      });
    }

    const patchMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)$/);
    if (patchMatch && request.method === "PATCH") {
      const dayId = Number(patchMatch[1]);
      let body: {
        name_ar?: string;
        event_date?: string;
        is_active?: number;
        mistake_penalty?: number;
        alert_penalty?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const existing = await env.DB.prepare(
        `SELECT deduction_rules FROM quranic_days WHERE id = ? AND complex_id = ?`,
      )
        .bind(dayId, auth.complexId)
        .first<{ deduction_rules: string }>();
      if (!existing) return json({ error: "not_found" }, 404);

      const rules = parseDeductionRules(existing.deduction_rules);
      if (body.mistake_penalty != null) rules.mistake_penalty = Number(body.mistake_penalty);
      if (body.alert_penalty != null) rules.alert_penalty = Number(body.alert_penalty);

      await env.DB.prepare(
        `UPDATE quranic_days SET
           name_ar = COALESCE(?, name_ar),
           event_date = COALESCE(?, event_date),
           is_active = COALESCE(?, is_active),
           deduction_rules = ?
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          body.name_ar?.trim() || null,
          body.event_date?.slice(0, 10) || null,
          body.is_active != null ? (body.is_active ? 1 : 0) : null,
          JSON.stringify(rules),
          dayId,
          auth.complexId,
        )
        .run();
      return json({ ok: true });
    }

    return json({ error: "not_found" }, 404);
  }

  return null;
}
