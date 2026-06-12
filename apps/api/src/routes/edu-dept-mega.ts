import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import {
  resolveTeacherPrimaryCircle,
  studentsInTeacherCircle,
  TEACHER_NO_CIRCLE_ACCOUNT_MSG,
} from "../lib/teacher-circle";
import { loadEventDefaults } from "../lib/edu-settings-defaults";
import { saveCompetitionGradingBulk } from "../lib/competition-grading-save";
import {
  assertTeacherOwnsUnifiedCompetition,
  createTeacherCircleCompetition,
  isTeacherCircleCompetition,
  loadTeacherCompetitionScores,
  teacherCompetitionLeaderboard,
  useUnifiedTeacherCompetitions,
} from "../lib/teacher-competition-unified";

const TEACHER_ONLY = ["teacher", "track_supervisor"] as const;

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

/** Teacher sandbox tasks — renamed in migration 048 to avoid platform competition_tasks. */
async function teacherTasksTable(env: Env): Promise<string | null> {
  if (await hasTable(env, "teacher_competition_tasks")) {
    return "teacher_competition_tasks";
  }
  if (await hasTable(env, "competition_tasks")) {
    const hasTitle = await tableHasColumn(env, "competition_tasks", "title_ar");
    const hasType = await tableHasColumn(env, "competition_tasks", "type");
    if (hasTitle && !hasType) return "competition_tasks";
  }
  return null;
}

async function assertTeacherOwnsCompetition(
  env: Env,
  competitionId: number,
  teacherUserId: number,
  complexId: number,
  unifiedEngine: boolean,
): Promise<boolean> {
  if (unifiedEngine) {
    return assertTeacherOwnsUnifiedCompetition(
      env,
      competitionId,
      teacherUserId,
      complexId,
    );
  }
  const row = await env.DB.prepare(
    `SELECT id FROM teacher_competitions
     WHERE id = ? AND teacher_user_id = ? AND complex_id = ?`,
  )
    .bind(competitionId, teacherUserId, complexId)
    .first();
  return Boolean(row);
}

async function seedDefaultTasks(env: Env, compId: number): Promise<void> {
  const tasksTable = await teacherTasksTable(env);
  if (!tasksTable) return;
  const hasSort = await tableHasColumn(env, tasksTable, "sort_order");
  for (let i = 0; i < DEFAULT_COMPETITION_TASKS.length; i++) {
    const t = DEFAULT_COMPETITION_TASKS[i];
    try {
      if (hasSort) {
        await env.DB.prepare(
          `INSERT INTO ${tasksTable} (competition_id, title_ar, weight_points, sort_order)
           VALUES (?, ?, ?, ?)`,
        )
          .bind(compId, t.title_ar, t.weight_points, i + 1)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO ${tasksTable} (competition_id, title_ar, weight_points)
           VALUES (?, ?, ?)`,
        )
          .bind(compId, t.title_ar, t.weight_points)
          .run();
      }
    } catch (e) {
      console.error("[edu-dept-mega] seedDefaultTasks row:", e);
    }
  }
}

type TeacherAuth = { userId: number; complexId: number; role: string };

async function loadTeacherStudents(
  env: Env,
  auth: TeacherAuth,
): Promise<{ students: Array<{ id: number; full_name_ar: string }> } | Response> {
  const students = await studentsInTeacherCircle(
    env,
    auth.complexId,
    auth.userId,
    auth.role,
  );
  if (students === null) {
    return json({ error: TEACHER_NO_CIRCLE_ACCOUNT_MSG }, 400);
  }
  return { students };
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
  const unifiedEngine = await useUnifiedTeacherCompetitions(env);
  if (!unifiedEngine && !(await hasTable(env, "teacher_competitions"))) {
    return migrationRequired();
  }

  const teacherAuth: TeacherAuth = {
    userId: auth.userId,
    complexId: auth.complexId,
    role: auth.role,
  };

  try {
    if (path === "/api/edu-dept/teacher-competitions" && request.method === "GET") {
      const hasCreatedBy = unifiedEngine
        ? await tableHasColumn(env, "competitions", "created_by_user_id")
        : false;
      const rows = unifiedEngine
        ? hasCreatedBy
          ? await env.DB.prepare(
              `SELECT id, name_ar, start_date, end_date, created_at, rules_json
               FROM competitions
               WHERE complex_id = ? AND created_by_user_id = ?
               ORDER BY created_at DESC`,
            )
              .bind(auth.complexId, auth.userId)
              .all<{
                id: number;
                name_ar: string;
                start_date: string;
                end_date: string;
                created_at: string;
                rules_json: string;
              }>()
          : await env.DB.prepare(
              `SELECT id, name_ar, start_date, end_date, created_at, rules_json
               FROM competitions
               WHERE complex_id = ?
               ORDER BY created_at DESC`,
            )
              .bind(auth.complexId)
              .all<{
                id: number;
                name_ar: string;
                start_date: string;
                end_date: string;
                created_at: string;
                rules_json: string;
              }>()
        : await env.DB.prepare(
            `SELECT id, name_ar, start_date, end_date, created_at
             FROM teacher_competitions
             WHERE teacher_user_id = ? AND complex_id = ?
             ORDER BY created_at DESC`,
          )
            .bind(auth.userId, auth.complexId)
            .all();
      const items = unifiedEngine
        ? (rows.results ?? []).filter((r) => isTeacherCircleCompetition(r.rules_json))
        : (rows.results ?? []);
      const circle = await resolveTeacherPrimaryCircle(
        env,
        auth.userId,
        auth.complexId,
      );
      const eventDefaults = await loadEventDefaults(env, auth.complexId);
      return json({
        items,
        circle_id: circle?.id ?? null,
        circle_name: circle?.name_ar ?? null,
        default_task_weight: eventDefaults.competition.default_task_weight,
      });
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

      const circle = await resolveTeacherPrimaryCircle(
        env,
        auth.userId,
        auth.complexId,
      );
      if (!circle) {
        return json({ error: TEACHER_NO_CIRCLE_ACCOUNT_MSG }, 400);
      }

      const today = new Date().toISOString().slice(0, 10);
      const startDate = body.start_date?.trim() || today;
      const endDate =
        body.end_date?.trim() ||
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      if (unifiedEngine) {
        const compId = await createTeacherCircleCompetition(
          env,
          auth.complexId,
          auth.userId,
          auth.role,
          name,
          startDate,
          endDate,
          circle.id,
        );
        return json({ ok: true, id: compId, circle_id: circle.id });
      }

      const ins = await env.DB.prepare(
        `INSERT INTO teacher_competitions (complex_id, teacher_user_id, name_ar, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(auth.complexId, auth.userId, name, startDate, endDate)
        .run();
      const compId = Number(ins.meta.last_row_id);
      await seedDefaultTasks(env, compId);
      return json({ ok: true, id: compId, circle_id: circle.id });
    }

    const detailMatch = path.match(/^\/api\/edu-dept\/teacher-competitions\/(\d+)$/);
    if (detailMatch) {
      const compId = Number(detailMatch[1]);
      if (
        !(await assertTeacherOwnsCompetition(
          env,
          compId,
          auth.userId,
          auth.complexId,
          unifiedEngine,
        ))
      ) {
        return json({ error: "not_found" }, 404);
      }

      if (request.method === "PATCH") {
        let body: { name_ar?: string; start_date?: string | null; end_date?: string | null };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const name = body.name_ar != null ? String(body.name_ar).trim() : null;
        if (name !== null && !name) return json({ error: "name_required" }, 400);
        const start =
          body.start_date === undefined
            ? undefined
            : body.start_date == null || body.start_date === ""
              ? null
              : String(body.start_date).trim();
        const end =
          body.end_date === undefined
            ? undefined
            : body.end_date == null || body.end_date === ""
              ? null
              : String(body.end_date).trim();
        const table = unifiedEngine ? "competitions" : "teacher_competitions";
        if (name !== null) {
          await env.DB.prepare(`UPDATE ${table} SET name_ar = ? WHERE id = ?`)
            .bind(name, compId)
            .run();
        }
        if (start !== undefined || end !== undefined) {
          const row = await env.DB.prepare(
            `SELECT start_date, end_date FROM ${table} WHERE id = ?`,
          )
            .bind(compId)
            .first<{ start_date: string | null; end_date: string | null }>();
          await env.DB.prepare(
            `UPDATE ${table} SET start_date = ?, end_date = ? WHERE id = ?`,
          )
            .bind(
              start !== undefined ? start : (row?.start_date ?? null),
              end !== undefined ? end : (row?.end_date ?? null),
              compId,
            )
            .run();
        }
        return json({ ok: true });
      }

      if (request.method === "DELETE") {
        if (unifiedEngine) {
          const hasCreatedBy = await tableHasColumn(env, "competitions", "created_by_user_id");
          if (hasCreatedBy) {
            await env.DB.prepare(
              `DELETE FROM competitions WHERE id = ? AND complex_id = ? AND created_by_user_id = ?`,
            )
              .bind(compId, auth.complexId, auth.userId)
              .run();
          } else {
            await env.DB.prepare(
              `DELETE FROM competitions WHERE id = ? AND complex_id = ?`,
            )
              .bind(compId, auth.complexId)
              .run();
          }
        } else {
          await env.DB.prepare(`DELETE FROM teacher_competitions WHERE id = ?`)
            .bind(compId)
            .run();
        }
        return json({ ok: true });
      }

      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405);
      }

      const loaded = await loadTeacherStudents(env, teacherAuth);
      if (loaded instanceof Response) return loaded;
      const { students } = loaded;

      const compTable = unifiedEngine ? "competitions" : "teacher_competitions";
      const comp = await env.DB.prepare(
        `SELECT id, name_ar, start_date, end_date FROM ${compTable} WHERE id = ?`,
      )
        .bind(compId)
        .first();

      let taskRows: Array<{
        id: number;
        title_ar: string;
        weight_points: number;
        sort_order?: number;
      }> = [];

      if (unifiedEngine) {
        const platformTasks = await env.DB.prepare(
          `SELECT id, name_ar AS title_ar, weight AS weight_points, sort_order
           FROM competition_tasks WHERE competition_id = ?
           ORDER BY sort_order, id`,
        )
          .bind(compId)
          .all<{
            id: number;
            title_ar: string;
            weight_points: number;
            sort_order: number;
          }>();
        taskRows = platformTasks.results ?? [];
      } else {
        const tasksTable = await teacherTasksTable(env);
        if (tasksTable) {
          const hasSort = await tableHasColumn(env, tasksTable, "sort_order");
          const orderCol = hasSort ? "sort_order, id" : "id";
          const tasks = await env.DB.prepare(
            `SELECT id, title_ar, weight_points${hasSort ? ", sort_order" : ""}
             FROM ${tasksTable} WHERE competition_id = ? ORDER BY ${orderCol}`,
          )
            .bind(compId)
            .all<{
              id: number;
              title_ar: string;
              weight_points: number;
              sort_order?: number;
            }>();
          taskRows = tasks.results ?? [];
        }
      }

      let scores: Array<{ task_id: number; student_id: number; points: number }> = [];
      if (unifiedEngine && comp) {
        const anchor = String(comp.start_date ?? new Date().toISOString().slice(0, 10));
        scores = await loadTeacherCompetitionScores(env, compId, anchor);
      } else {
        const taskIds = taskRows.map((t) => t.id);
        if (taskIds.length > 0 && (await hasTable(env, "student_comp_scores"))) {
          const ph = taskIds.map(() => "?").join(",");
          const scoreRows = await env.DB.prepare(
            `SELECT task_id, student_id, points FROM student_comp_scores
             WHERE task_id IN (${ph})`,
          )
            .bind(...taskIds)
            .all<{ task_id: number; student_id: number; points: number }>();
          scores = scoreRows.results ?? [];
        }
      }

      const circle = await resolveTeacherPrimaryCircle(
        env,
        auth.userId,
        auth.complexId,
      );

      return json({
        competition: comp,
        tasks: taskRows,
        students,
        scores,
        circle_id: circle?.id ?? null,
      });
    }

    const leaderboardMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/leaderboard$/,
    );
    if (leaderboardMatch && request.method === "GET") {
      const compId = Number(leaderboardMatch[1]);
      if (
        !(await assertTeacherOwnsCompetition(
          env,
          compId,
          auth.userId,
          auth.complexId,
          unifiedEngine,
        ))
      ) {
        return json({ error: "not_found" }, 404);
      }

      const loaded = await loadTeacherStudents(env, teacherAuth);
      if (loaded instanceof Response) return loaded;
      const { students } = loaded;

      if (unifiedEngine) {
        const compRow = await env.DB.prepare(
          `SELECT start_date, end_date FROM competitions WHERE id = ?`,
        )
          .bind(compId)
          .first<{ start_date: string; end_date: string }>();
        const items = await teacherCompetitionLeaderboard(
          env,
          compId,
          students,
          String(compRow?.start_date ?? new Date().toISOString().slice(0, 10)),
          String(compRow?.end_date ?? new Date().toISOString().slice(0, 10)),
        );
        return json({ items });
      }

      const scoreMap = new Map<number, number>();
      const tasksTableLb = await teacherTasksTable(env);
      if (tasksTableLb && (await hasTable(env, "student_comp_scores"))) {
        const rows = await env.DB.prepare(
          `SELECT scs.student_id,
                  SUM(scs.points * COALESCE(ct.weight_points, 1)) AS total_points
           FROM student_comp_scores scs
           INNER JOIN ${tasksTableLb} ct ON ct.id = scs.task_id
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
        .map((s) => ({
          rank: 0,
          student_id: s.id,
          full_name_ar: s.full_name_ar,
          total_points: scoreMap.get(s.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.total_points - a.total_points ||
            a.full_name_ar.localeCompare(b.full_name_ar, "ar"),
        )
        .map((row, i) => ({ ...row, rank: i + 1 }));

      return json({ items });
    }

    const taskMatch = path.match(/^\/api\/edu-dept\/teacher-competitions\/(\d+)\/tasks$/);
    if (taskMatch && request.method === "POST") {
      const compId = Number(taskMatch[1]);
      if (
        !(await assertTeacherOwnsCompetition(
          env,
          compId,
          auth.userId,
          auth.complexId,
          unifiedEngine,
        ))
      ) {
        return json({ error: "not_found" }, 404);
      }

      if (unifiedEngine) {
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
        const ins = await env.DB.prepare(
          `INSERT INTO competition_tasks
           (competition_id, name_ar, weight, type, sort_order)
           VALUES (?, ?, ?, 'addition', ?)`,
        )
          .bind(compId, title, Number.isFinite(w) ? w : 1, (maxRow?.m ?? 0) + 1)
          .run();
        return json({ ok: true, id: ins.meta.last_row_id });
      }

      const tasksTable = await teacherTasksTable(env);
      if (!tasksTable) return migrationRequired();

      const circle = await resolveTeacherPrimaryCircle(
        env,
        auth.userId,
        auth.complexId,
      );
      if (!circle) {
        return json({ error: TEACHER_NO_CIRCLE_ACCOUNT_MSG }, 400);
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
      const hasSort = await tableHasColumn(env, tasksTable, "sort_order");
      let sortOrder = 1;
      if (hasSort) {
        const maxRow = await env.DB.prepare(
          `SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${tasksTable} WHERE competition_id = ?`,
        )
          .bind(compId)
          .first<{ m: number }>();
        sortOrder = (maxRow?.m ?? 0) + 1;
      }
      const ins = hasSort
        ? await env.DB.prepare(
            `INSERT INTO ${tasksTable} (competition_id, title_ar, weight_points, sort_order)
             VALUES (?, ?, ?, ?)`,
          )
            .bind(compId, title, Number.isFinite(w) ? w : 1, sortOrder)
            .run()
        : await env.DB.prepare(
            `INSERT INTO ${tasksTable} (competition_id, title_ar, weight_points)
             VALUES (?, ?, ?)`,
          )
            .bind(compId, title, Number.isFinite(w) ? w : 1)
            .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const taskDelMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/tasks\/(\d+)$/,
    );
    if (taskDelMatch && request.method === "DELETE") {
      const tasksTable = await teacherTasksTable(env);
      if (!tasksTable) return migrationRequired();
      const compId = Number(taskDelMatch[1]);
      const taskId = Number(taskDelMatch[2]);
      if (
        !(await assertTeacherOwnsCompetition(
          env,
          compId,
          auth.userId,
          auth.complexId,
          unifiedEngine,
        ))
      ) {
        return json({ error: "not_found" }, 404);
      }

      if (unifiedEngine) {
        const owned = await env.DB.prepare(
          `SELECT id FROM competition_tasks WHERE id = ? AND competition_id = ?`,
        )
          .bind(taskId, compId)
          .first();
        if (!owned) return json({ error: "not_found" }, 404);
        await env.DB.prepare(
          `DELETE FROM competition_tasks WHERE id = ? AND competition_id = ?`,
        )
          .bind(taskId, compId)
          .run();
        return json({ ok: true });
      }

      const owned = await env.DB.prepare(
        `SELECT id FROM ${tasksTable} WHERE id = ? AND competition_id = ?`,
      )
        .bind(taskId, compId)
        .first();
      if (!owned) return json({ error: "not_found" }, 404);
      if (await hasTable(env, "student_comp_scores")) {
        await env.DB.prepare(`DELETE FROM student_comp_scores WHERE task_id = ?`)
          .bind(taskId)
          .run();
      }
      await env.DB.prepare(`DELETE FROM ${tasksTable} WHERE id = ?`).bind(taskId).run();
      return json({ ok: true });
    }

    const scoresMatch = path.match(
      /^\/api\/edu-dept\/teacher-competitions\/(\d+)\/scores$/,
    );
    if (scoresMatch && request.method === "POST") {
      const compId = Number(scoresMatch[1]);
      if (
        !(await assertTeacherOwnsCompetition(
          env,
          compId,
          auth.userId,
          auth.complexId,
          unifiedEngine,
        ))
      ) {
        return json({ error: "not_found" }, 404);
      }

      const loaded = await loadTeacherStudents(env, teacherAuth);
      if (loaded instanceof Response) return loaded;
      const { students } = loaded;

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

      if (unifiedEngine) {
        const compRow = await env.DB.prepare(
          `SELECT start_date FROM competitions WHERE id = ?`,
        )
          .bind(compId)
          .first<{ start_date: string }>();
        const logDate = String(
          compRow?.start_date ?? new Date().toISOString().slice(0, 10),
        );
        const taskRows = await env.DB.prepare(
          `SELECT id FROM competition_tasks WHERE competition_id = ?`,
        )
          .bind(compId)
          .all<{ id: number }>();
        const validTaskIds = new Set((taskRows.results ?? []).map((t) => t.id));
        const validStudentIds = new Set(students.map((s) => s.id));

        const byStudent = new Map<
          number,
          { student_id: number; records: Array<{ task_id: number; points: number }> }
        >();
        for (const s of list) {
          if (
            !validTaskIds.has(Number(s.task_id)) ||
            !validStudentIds.has(Number(s.student_id))
          ) {
            continue;
          }
          const sid = Number(s.student_id);
          const cur = byStudent.get(sid) ?? { student_id: sid, records: [] };
          cur.records.push({
            task_id: Number(s.task_id),
            points: Number(s.points),
          });
          byStudent.set(sid, cur);
        }

        const saved = await saveCompetitionGradingBulk(
          env,
          compId,
          [...byStudent.values()],
          {
            logDate,
            recordedByUserId: auth.userId,
            source: "edu_supervisor",
          },
        );
        return json({ ok: true, saved });
      }

      if (!(await hasTable(env, "student_comp_scores"))) return migrationRequired();
      const scoresTasksTable = await teacherTasksTable(env);
      if (!scoresTasksTable) return migrationRequired();
      const taskRows = await env.DB.prepare(
        `SELECT id FROM ${scoresTasksTable} WHERE competition_id = ?`,
      )
        .bind(compId)
        .all<{ id: number }>();
      const validTaskIds = new Set((taskRows.results ?? []).map((t) => t.id));
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
