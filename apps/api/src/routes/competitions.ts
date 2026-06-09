import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import {
  computeAchievedByStudent,
  formatMemorizationJuz,
  hasCompetitionCategory,
  hasEngineLogs,
  hasEngineTargets,
  hasEngineTasks,
  parseMemorizationJuz,
  parseTargetScope,
  queryPreviewStudents,
  type CompetitionCategory,
  type StudentTargetInput,
  type TargetScope,
  upsertStudentTargets,
} from "../lib/competition-engine";
import {
  loadUserScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  type ScopeMode,
} from "../lib/dept-scope";
import { DEFAULT_COMPETITION } from "../lib/edu-settings-defaults";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultRules(): Record<string, unknown> {
  return { scoring: { ...DEFAULT_COMPETITION } };
}

const VALID_CATEGORIES: CompetitionCategory[] = [
  "recitation",
  "review",
  "new_memorization",
  "other",
];

type CompetitionSchema = {
  description: boolean;
  telemetry_type: boolean;
  scope_json: boolean;
  created_by_user_id: boolean;
  updated_at: boolean;
  stage_id: boolean;
  category: boolean;
  custom_category: boolean;
  target_scope: boolean;
};

async function competitionSchema(env: Env): Promise<CompetitionSchema> {
  const t = "competitions";
  const [
    description,
    telemetry_type,
    scope_json,
    created_by_user_id,
    updated_at,
    stage_id,
    category,
    custom_category,
    target_scope,
  ] = await Promise.all([
    tableHasColumn(env, t, "description"),
    tableHasColumn(env, t, "telemetry_type"),
    tableHasColumn(env, t, "scope_json"),
    tableHasColumn(env, t, "created_by_user_id"),
    tableHasColumn(env, t, "updated_at"),
    tableHasColumn(env, t, "stage_id"),
    tableHasColumn(env, t, "category"),
    tableHasColumn(env, t, "custom_category"),
    tableHasColumn(env, t, "target_scope"),
  ]);
  return {
    description,
    telemetry_type,
    scope_json,
    created_by_user_id,
    updated_at,
    stage_id,
    category,
    custom_category,
    target_scope,
  };
}

function competitionsScopeClause(
  scope: ScopeMode,
  hasStageId: boolean,
): { where: string; binds: number[] } {
  if (!hasStageId || scope.type === "global") {
    return { where: "1=1", binds: [] };
  }
  const stageWhere = stageFilterWhere(scope, "c.stage_id");
  return {
    where: `(${stageWhere} OR c.stage_id IS NULL)`,
    binds: stageFilterBinds(scope),
  };
}

function validateCategoryBody(
  category: string | undefined,
  customCategory: string | undefined,
): CompetitionCategory | Response {
  const cat = (category ?? "recitation") as CompetitionCategory;
  if (!VALID_CATEGORIES.includes(cat)) {
    return json({ error: "invalid_category" }, 400);
  }
  if (cat === "other" && !customCategory?.trim()) {
    return json({ error: "custom_category_required" }, 400);
  }
  return cat;
}

async function insertCompetitionRow(
  env: Env,
  schema: CompetitionSchema,
  params: {
    complexId: number;
    name_ar: string;
    description?: string;
    start_date: string;
    end_date: string;
    rules_json: string;
    tv_launch_key: string;
    userId: number;
    category?: CompetitionCategory;
    custom_category?: string;
    target_scope?: TargetScope;
  },
) {
  const cols = [
    "complex_id",
    "name_ar",
    "start_date",
    "end_date",
    "status",
    "rules_json",
    "tv_launch_key",
  ];
  const placeholders = ["?", "?", "?", "?", "'draft'", "?", "?"];
  const binds: (string | number)[] = [
    params.complexId,
    params.name_ar,
    params.start_date,
    params.end_date,
    params.rules_json,
    params.tv_launch_key,
  ];

  if (schema.description) {
    cols.splice(2, 0, "description");
    placeholders.splice(2, 0, "?");
    binds.splice(2, 0, params.description ?? "");
  }
  if (schema.category) {
    cols.push("category");
    placeholders.push("?");
    binds.push(params.category ?? "recitation");
  }
  if (schema.custom_category) {
    cols.push("custom_category");
    placeholders.push("?");
    binds.push(params.custom_category ?? "");
  }
  if (schema.target_scope) {
    cols.push("target_scope");
    placeholders.push("?");
    binds.push(JSON.stringify(params.target_scope ?? {}));
  }
  if (schema.telemetry_type) {
    cols.push("telemetry_type");
    placeholders.push("'intensive_routine'");
  }
  if (schema.scope_json) {
    cols.push("scope_json");
    placeholders.push("'{}'");
  }
  if (schema.created_by_user_id) {
    cols.push("created_by_user_id");
    placeholders.push("?");
    binds.push(params.userId);
  }

  return env.DB.prepare(
    `INSERT INTO competitions (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
  )
    .bind(...binds)
    .run();
}

async function patchCompetitionRow(
  env: Env,
  schema: CompetitionSchema,
  id: number,
  complexId: number,
  body: {
    name_ar?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    category?: CompetitionCategory;
    custom_category?: string;
    target_scope?: TargetScope;
  },
  rulesJson: string,
) {
  const sets = [
    "name_ar = COALESCE(?, name_ar)",
    "start_date = COALESCE(?, start_date)",
    "end_date = COALESCE(?, end_date)",
    "status = COALESCE(?, status)",
    "rules_json = ?",
  ];
  const binds: (string | number | null)[] = [
    body.name_ar?.trim() ?? null,
    body.start_date ?? null,
    body.end_date ?? null,
    body.status ?? null,
    rulesJson,
  ];

  if (schema.description) {
    sets.splice(1, 0, "description = COALESCE(?, description)");
    binds.splice(1, 0, body.description ?? null);
  }
  if (schema.category) {
    sets.push("category = COALESCE(?, category)");
    binds.push(body.category ?? null);
  }
  if (schema.custom_category) {
    sets.push("custom_category = COALESCE(?, custom_category)");
    binds.push(body.custom_category ?? null);
  }
  if (schema.target_scope) {
    sets.push("target_scope = COALESCE(?, target_scope)");
    binds.push(body.target_scope ? JSON.stringify(body.target_scope) : null);
  }
  if (schema.updated_at) {
    sets.push("updated_at = datetime('now')");
  }
  binds.push(id, complexId);

  await env.DB.prepare(
    `UPDATE competitions SET ${sets.join(", ")} WHERE id = ? AND complex_id = ?`,
  )
    .bind(...binds)
    .run();
}

async function setCompetitionStatus(
  env: Env,
  schema: CompetitionSchema,
  id: number,
  complexId: number,
  status: string,
  liveLogToken?: string,
) {
  const sets = liveLogToken
    ? ["live_log_token = ?", "status = ?"]
    : ["status = ?"];
  const binds: (string | number)[] = liveLogToken
    ? [liveLogToken, status, id, complexId]
    : [status, id, complexId];
  if (schema.updated_at) sets.push("updated_at = datetime('now')");

  await env.DB.prepare(
    `UPDATE competitions SET ${sets.join(", ")} WHERE id = ? AND complex_id = ?`,
  )
    .bind(...binds)
    .run();
}

async function competitionExists(
  env: Env,
  id: number,
  complexId: number,
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(`SELECT * FROM competitions WHERE id = ? AND complex_id = ?`)
    .bind(id, complexId)
    .first<Record<string, unknown>>();
}

function serializeCompetition(
  row: Record<string, unknown>,
  schema: CompetitionSchema,
): Record<string, unknown> {
  return {
    ...row,
    description: schema.description ? row.description ?? "" : "",
    category: schema.category ? row.category ?? "recitation" : "recitation",
    custom_category: schema.custom_category ? row.custom_category ?? "" : "",
    target_scope: schema.target_scope
      ? parseTargetScope(String(row.target_scope ?? "{}"))
      : {},
    telemetry_type: schema.telemetry_type
      ? row.telemetry_type ?? "intensive_routine"
      : "intensive_routine",
    rules: JSON.parse(String(row.rules_json ?? "{}")),
    scope: schema.scope_json ? JSON.parse(String(row.scope_json ?? "{}")) : {},
  };
}

export async function handleEduCompetitionsRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  let path = url.pathname;
  if (path.startsWith("/api/competitions")) {
    path = path.replace("/api/competitions", "/api/edu-dept/competitions");
  }
  if (!path.startsWith("/api/edu-dept/competitions")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["edu_supervisor", "super_admin"])) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);
  const schema = await competitionSchema(env);
  const hasCompAttendance = await hasTable(env, "competition_attendance");
  const engineTargets = await hasEngineTargets(env);
  const engineTasks = await hasEngineTasks(env);
  const engineLogs = await hasEngineLogs(env);

  if (request.method === "GET" && path === "/api/edu-dept/competitions") {
    const scopeClause = competitionsScopeClause(scope, schema.stage_id);
    const descCol = schema.description ? ", c.description" : "";
    const catCol = schema.category ? ", c.category, c.custom_category" : "";
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name_ar${descCol}${catCol}, c.start_date, c.end_date, c.status,
              c.live_log_token, c.tv_launch_key
       FROM competitions c
       WHERE c.complex_id = ? AND ${scopeClause.where}
       ORDER BY c.start_date DESC LIMIT 100`,
    )
      .bind(auth.complexId, ...scopeClause.binds)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (
    request.method === "POST" &&
    path === "/api/edu-dept/competitions/preview-targets"
  ) {
    if (!(await hasCompetitionCategory(env))) {
      return json({ error: "migration_required", hint: "db:remote:048" }, 503);
    }
    let body: { target_scope?: TargetScope };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const students = await queryPreviewStudents(
      env,
      auth.complexId,
      scope,
      body.target_scope ?? {},
    );
    return json({ items: students });
  }

  if (request.method === "POST" && path === "/api/edu-dept/competitions") {
    let body: {
      name_ar?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      category?: CompetitionCategory;
      custom_category?: string;
      target_scope?: TargetScope;
      targets?: StudentTargetInput[];
      rules?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!body.name_ar?.trim() || !body.start_date || !body.end_date) {
      return json({ error: "name_and_dates_required" }, 400);
    }

    const catResult = validateCategoryBody(body.category, body.custom_category);
    if (catResult instanceof Response) return catResult;

    if (engineTargets && (!body.targets?.length)) {
      return json({ error: "targets_required" }, 400);
    }

    const tvKey = randomKey();
    const rules = { ...defaultRules(), ...(body.rules ?? {}) };
    const ins = await insertCompetitionRow(env, schema, {
      complexId: auth.complexId,
      name_ar: body.name_ar.trim(),
      description: body.description?.trim(),
      start_date: body.start_date,
      end_date: body.end_date,
      rules_json: JSON.stringify(rules),
      tv_launch_key: tvKey,
      userId: auth.userId,
      category: catResult,
      custom_category: body.custom_category?.trim(),
      target_scope: body.target_scope ?? {},
    });

    const competitionId = ins.meta.last_row_id as number;
    if (engineTargets && body.targets?.length) {
      await upsertStudentTargets(env, competitionId, body.targets);
    }

    return json({ ok: true, id: competitionId, tv_launch_key: tvKey });
  }

  const taskDeleteMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/tasks\/(\d+)$/,
  );
  if (request.method === "DELETE" && taskDeleteMatch && engineTasks) {
    const competitionId = Number(taskDeleteMatch[1]);
    const taskId = Number(taskDeleteMatch[2]);
    const row = await competitionExists(env, competitionId, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);
    await env.DB.prepare(
      `DELETE FROM competition_tasks WHERE id = ? AND competition_id = ?`,
    )
      .bind(taskId, competitionId)
      .run();
    return json({ ok: true });
  }

  const tasksMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)\/tasks$/);
  if (tasksMatch && engineTasks) {
    const competitionId = Number(tasksMatch[1]);
    const row = await competitionExists(env, competitionId, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      const tasks = await env.DB.prepare(
        `SELECT id, name_ar, weight, type, sort_order, created_at
         FROM competition_tasks WHERE competition_id = ?
         ORDER BY sort_order, id`,
      )
        .bind(competitionId)
        .all();
      return json({ items: tasks.results ?? [] });
    }

    if (request.method === "POST") {
      let body: { name_ar?: string; weight?: number; type?: string };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      if (!body.name_ar?.trim()) return json({ error: "name_required" }, 400);
      const taskType = body.type === "deduction" ? "deduction" : "addition";
      const maxSort = await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(competitionId)
        .first<{ m: number }>();
      const ins = await env.DB.prepare(
        `INSERT INTO competition_tasks (competition_id, name_ar, weight, type, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          competitionId,
          body.name_ar.trim(),
          Number(body.weight ?? 1) || 1,
          taskType,
          Number(maxSort?.m ?? 0) + 1,
        )
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }
  }

  const syncMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/sync-memorization$/,
  );
  if (request.method === "POST" && syncMatch && engineTargets) {
    const competitionId = Number(syncMatch[1]);
    const row = await competitionExists(env, competitionId, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    const category = String(row.category ?? "recitation");
    if (category !== "new_memorization") {
      return json({ error: "sync_only_for_new_memorization" }, 400);
    }

    const achievedMap = await computeAchievedByStudent(env, competitionId);
    const targets = await env.DB.prepare(
      `SELECT id, student_id, current_memorization, target_amount, achieved_amount, synced_at
       FROM competition_targets WHERE competition_id = ?`,
    )
      .bind(competitionId)
      .all<{
        id: number;
        student_id: number;
        current_memorization: number;
        target_amount: number;
        achieved_amount: number;
        synced_at: string | null;
      }>();

    const hasMemCol = await tableHasColumn(env, "students", "memorization_amount");
    const updated: Array<{ student_id: number; new_memorization: number }> = [];

    for (const t of targets.results ?? []) {
      const fromLogs = achievedMap.get(t.student_id) ?? 0;
      const achieved = Math.min(
        Number(t.target_amount) || 0,
        Math.max(Number(t.achieved_amount) || 0, fromLogs),
      );
      if (achieved <= 0) continue;

      const newJuz = Math.round((Number(t.current_memorization) + achieved) * 100) / 100;
      if (hasMemCol) {
        await env.DB.prepare(
          `UPDATE students SET memorization_amount = ? WHERE id = ? AND complex_id = ?`,
        )
          .bind(formatMemorizationJuz(newJuz), t.student_id, auth.complexId)
          .run();
      }

      await env.DB.prepare(
        `UPDATE competition_targets
         SET achieved_amount = ?, synced_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(achieved, t.id)
        .run();

      updated.push({ student_id: t.student_id, new_memorization: newJuz });
    }

    await setCompetitionStatus(env, schema, competitionId, auth.complexId, "closed");

    return json({ ok: true, updated_count: updated.length, updated });
  }

  const detailMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)$/);
  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      let targets: Array<Record<string, unknown>> = [];
      if (engineTargets) {
        const tRows = await env.DB.prepare(
          `SELECT ct.*, s.full_name_ar
           FROM competition_targets ct
           JOIN students s ON s.id = ct.student_id
           WHERE ct.competition_id = ?
           ORDER BY s.full_name_ar`,
        )
          .bind(id)
          .all();
        targets = (tRows.results ?? []) as Array<Record<string, unknown>>;
      }

      let tasks: Array<Record<string, unknown>> = [];
      if (engineTasks) {
        const taskRows = await env.DB.prepare(
          `SELECT id, name_ar, weight, type, sort_order FROM competition_tasks
           WHERE competition_id = ? ORDER BY sort_order, id`,
        )
          .bind(id)
          .all();
        tasks = (taskRows.results ?? []) as Array<Record<string, unknown>>;
      }

      let logs: Array<Record<string, unknown>> = [];
      if (engineLogs) {
        const logRows = await env.DB.prepare(
          `SELECT cl.*, s.full_name_ar, ct.name_ar AS task_name
           FROM competition_logs cl
           JOIN students s ON s.id = cl.student_id
           LEFT JOIN competition_tasks ct ON ct.id = cl.task_id
           WHERE cl.competition_id = ?
           ORDER BY cl.log_date DESC, cl.recorded_at DESC LIMIT 200`,
        )
          .bind(id)
          .all();
        logs = (logRows.results ?? []) as Array<Record<string, unknown>>;
      } else if (await hasTable(env, "quran_daily_ledger")) {
        const logRows = await env.DB.prepare(
          `SELECT l.student_id, l.mark_date AS log_date, l.notes AS metrics_json,
                  'ledger' AS source, l.recorded_at, s.full_name_ar
           FROM quran_daily_ledger l
           JOIN students s ON s.id = l.student_id
           WHERE l.context_type = 'competition' AND l.context_id = ?
           ORDER BY l.mark_date DESC, l.recorded_at DESC`,
        )
          .bind(id)
          .all();
        logs = (logRows.results ?? []) as Array<Record<string, unknown>>;
      }

      return json({
        competition: serializeCompetition(row, schema),
        targets,
        tasks,
        logs,
      });
    }

    if (request.method === "PATCH") {
      let body: {
        name_ar?: string;
        description?: string;
        start_date?: string;
        end_date?: string;
        status?: string;
        category?: CompetitionCategory;
        custom_category?: string;
        target_scope?: TargetScope;
        targets?: StudentTargetInput[];
        rules?: Record<string, unknown>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      if (body.category) {
        const catResult = validateCategoryBody(body.category, body.custom_category);
        if (catResult instanceof Response) return catResult;
      }

      const currentRules = JSON.parse(String(row.rules_json ?? "{}"));
      const nextRules = body.rules ? { ...currentRules, ...body.rules } : currentRules;

      await patchCompetitionRow(env, schema, id, auth.complexId, body, JSON.stringify(nextRules));

      if (engineTargets && body.targets?.length) {
        await upsertStudentTargets(env, id, body.targets);
      }

      return json({ ok: true });
    }
  }

  const liveTokenMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/live-log-token$/,
  );
  if (request.method === "POST" && liveTokenMatch) {
    const id = Number(liveTokenMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);
    const token = randomKey();
    await setCompetitionStatus(env, schema, id, auth.complexId, "active", token);
    return json({ ok: true, live_log_token: token, path: `/live-log/${token}` });
  }

  const activateMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/activate$/,
  );
  if (request.method === "POST" && activateMatch) {
    const id = Number(activateMatch[1]);
    await setCompetitionStatus(env, schema, id, auth.complexId, "active");
    return json({ ok: true });
  }

  const attendanceMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/attendance$/,
  );
  if (attendanceMatch && hasCompAttendance) {
    const id = Number(attendanceMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      const date =
        url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const studentIds = await resolveCompetitionStudents(
        env,
        auth.complexId,
        id,
        scope,
      );
      if (!studentIds.length) {
        return json({ date, items: [], present_count: 0, total: 0 });
      }
      const placeholders = studentIds.map(() => "?").join(",");
      const students = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar
         FROM students s
         WHERE s.id IN (${placeholders})
         ORDER BY s.full_name_ar`,
      )
        .bind(...studentIds)
        .all<{ student_id: number; full_name_ar: string }>();

      const attRows = await env.DB.prepare(
        `SELECT student_id, present FROM competition_attendance
         WHERE competition_id = ? AND attendance_date = ?`,
      )
        .bind(id, date)
        .all<{ student_id: number; present: number }>();
      const attMap = new Map(
        (attRows.results ?? []).map((r) => [r.student_id, r.present === 1]),
      );

      const items = (students.results ?? []).map((s) => ({
        student_id: s.student_id,
        full_name_ar: s.full_name_ar,
        present: attMap.has(s.student_id) ? attMap.get(s.student_id)! : true,
      }));
      const presentCount = items.filter((i) => i.present).length;
      return json({
        date,
        items,
        present_count: presentCount,
        total: items.length,
      });
    }

    if (request.method === "POST") {
      let body: {
        date?: string;
        records?: Array<{ student_id: number; present: boolean }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const date = body.date ?? new Date().toISOString().slice(0, 10);
      for (const rec of body.records ?? []) {
        await env.DB.prepare(
          `INSERT INTO competition_attendance
           (competition_id, student_id, attendance_date, present, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(competition_id, student_id, attendance_date) DO UPDATE SET
             present = excluded.present,
             recorded_by_user_id = excluded.recorded_by_user_id,
             recorded_at = datetime('now')`,
        )
          .bind(id, rec.student_id, date, rec.present ? 1 : 0, auth.userId)
          .run();
      }
      return json({ ok: true });
    }
  }

  const dashboardMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/dashboard$/,
  );
  if (request.method === "GET" && dashboardMatch) {
    const id = Number(dashboardMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    const dateFrom = url.searchParams.get("date_from") ?? String(row.start_date);
    const dateTo = url.searchParams.get("date_to") ?? String(row.end_date);

    const studentIds = await resolveCompetitionStudents(
      env,
      auth.complexId,
      id,
      scope,
    );
    const totalStudents = studentIds.length;

    let disciplinePct = 0;
    if (hasCompAttendance && totalStudents > 0) {
      const att = await env.DB.prepare(
        `SELECT COUNT(*) AS total_marks,
                SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) AS present_marks
         FROM competition_attendance
         WHERE competition_id = ? AND attendance_date BETWEEN ? AND ?`,
      )
        .bind(id, dateFrom, dateTo)
        .first<{ total_marks: number; present_marks: number }>();
      const totalMarks = Number(att?.total_marks ?? 0);
      const presentMarks = Number(att?.present_marks ?? 0);
      disciplinePct =
        totalMarks > 0 ? Math.round((presentMarks / totalMarks) * 100) : 0;
    }

    const achievedByStudent = await computeAchievedByStudent(env, id);
    let targetSum = 0;
    let achievedSum = 0;

    if (engineTargets) {
      const targets = await env.DB.prepare(
        `SELECT student_id, target_amount, achieved_amount
         FROM competition_targets WHERE competition_id = ?`,
      )
        .bind(id)
        .all<{
          student_id: number;
          target_amount: number;
          achieved_amount: number;
        }>();

      for (const t of targets.results ?? []) {
        targetSum += Number(t.target_amount) || 0;
        const achieved = Math.max(
          Number(t.achieved_amount) || 0,
          achievedByStudent.get(t.student_id) ?? 0,
        );
        achievedSum += achieved;
        achievedByStudent.set(t.student_id, achieved);
      }
    }

    const achievementPct =
      targetSum > 0
        ? Math.min(100, Math.round((achievedSum / targetSum) * 100))
        : achievedSum > 0
          ? 100
          : 0;

    const leaders = [...achievedByStudent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([student_id, score]) => ({ student_id, score }));

    if (leaders.length) {
      const placeholders = leaders.map(() => "?").join(",");
      const names = await env.DB.prepare(
        `SELECT id, full_name_ar FROM students WHERE id IN (${placeholders})`,
      )
        .bind(...leaders.map((l) => l.student_id))
        .all<{ id: number; full_name_ar: string }>();
      const nameMap = new Map(
        (names.results ?? []).map((n) => [n.id, n.full_name_ar]),
      );
      for (const l of leaders) {
        (l as { full_name_ar?: string }).full_name_ar = nameMap.get(l.student_id);
      }
    }

    return json({
      date_from: dateFrom,
      date_to: dateTo,
      kpis: {
        discipline_pct: disciplinePct,
        achievement_pct: achievementPct,
        participants: totalStudents,
        target_juz: Math.round(targetSum * 100) / 100,
        achieved_juz: Math.round(achievedSum * 100) / 100,
      },
      leaders,
    });
  }

  return json({ error: "Not Found", path }, 404);
}

export async function resolveCompetitionStudents(
  env: Env,
  complexId: number,
  competitionId: number,
  scope: ScopeMode,
): Promise<number[]> {
  if (await hasEngineTargets(env)) {
    const rows = await env.DB.prepare(
      `SELECT student_id FROM competition_targets WHERE competition_id = ?`,
    )
      .bind(competitionId)
      .all<{ student_id: number }>();
    if (rows.results?.length) {
      return rows.results.map((r) => r.student_id);
    }
  }

  const scopeWhere = studentsInScopeWhere(scope);
  const all = await env.DB.prepare(
    `SELECT s.id FROM students s WHERE ${scopeWhere}`,
  )
    .bind(...studentsInScopeBinds(complexId, scope))
    .all<{ id: number }>();
  return (all.results ?? []).map((r) => r.id);
}
