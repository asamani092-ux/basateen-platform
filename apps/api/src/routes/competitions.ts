import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import {
  computeAchievedByStudent,
  deleteCompetitionCascade,
  deleteCompetitionTask,
  deleteStudentTarget,
  formatMemorizationJuz,
  hasCompetitionCategory,
  hasEngineLogs,
  hasEngineTargets,
  hasEngineTasks,
  loadCompetitionDetailBundle,
  loadCompetitionFilterOptions,
  loadCompetitionTargetRows,
  parseMemorizationJuz,
  parseMemorizationUnit,
  parseTargetScope,
  normalizeTargetScope,
  queryPreviewStudents,
  countCompetitionDays,
  countActiveCompetitionDays,
  enumerateActiveCompetitionDates,
  parseActiveWeekdays,
  defaultActiveLogDate,
  seedCompetitionTasksFromCriteria,
  studentDailyFaces,
  studentDailyFacesFromRules,
  isMemorizationTrackingCategory,
  targetHizbCount,
  hasTaskInputType,
  hasCriterionId,
  competitionTaskSelectSql,
  parseTaskInputType,
  buildCompetitionLeaderboard,
  loadCompetitionLogsForLeaderboard,
  loadCompetitionTaskMeta,
  memorizationPointsToJuz,
  sumMemorizationLogPoints,
  parseSirdSettings,
  computeSirdPeriodScore,
  loadSirdPeriodsMatrix,
  upsertSirdPeriodRecord,
  aggregateSirdStudentStats,
  aggregateTargetVolumeMetrics,
  disciplinePctFromAttendanceLogs,
  hasSirdPeriodRecords,
  sumReadFacesFromTaskLogs,
  sumSirdReadFaces,
  loadCompetitionDayLogsHydrated,
  upsertCompetitionDayMetrics,
  DEFAULT_SIRD_SETTINGS,
  type CompetitionCategory,
  type MemorizationUnit,
  type StudentTargetInput,
  type TargetScope,
  patchStudentTargets,
  upsertStudentTargets,
  updateStudentTargetAmount,
} from "../lib/competition-engine";
import {
  loadUserScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  type ScopeMode,
} from "../lib/dept-scope";
import { saveCompetitionGradingBulk } from "../lib/competition-grading-save";
import { DEFAULT_COMPETITION } from "../lib/edu-settings-defaults";
import { loadEvaluationCriteria } from "../lib/evaluation-criteria";
import { COMPETITION_MANAGER_ROLES } from "../lib/roles";

function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers });
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
];

type CompetitionSchema = {
  description: boolean;
  telemetry_type: boolean;
  scope_json: boolean;
  created_by_user_id: boolean;
  updated_at: boolean;
  stage_id: boolean;
  category: boolean;
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
    target_scope,
  ] = await Promise.all([
    tableHasColumn(env, t, "description"),
    tableHasColumn(env, t, "telemetry_type"),
    tableHasColumn(env, t, "scope_json"),
    tableHasColumn(env, t, "created_by_user_id"),
    tableHasColumn(env, t, "updated_at"),
    tableHasColumn(env, t, "stage_id"),
    tableHasColumn(env, t, "category"),
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
): CompetitionCategory | Response {
  const cat = (category ?? "recitation") as CompetitionCategory;
  if (!VALID_CATEGORIES.includes(cat)) {
    return json({ error: "invalid_category" }, 400);
  }
  return cat;
}

function memorizationUnitFromRules(rules: Record<string, unknown>): MemorizationUnit {
  return parseMemorizationUnit(rules.memorization_unit);
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

function normalizeCompAttendanceStatus(raw: string | undefined): "present" | "excused" | "absent" {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "excused" || t === "مستأذن" || t === "معتذر") return "excused";
  if (t === "absent" || t === "غائب") return "absent";
  return "present";
}

function presentFromStatus(status: string): number {
  return status === "present" ? 1 : 0;
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
  if (!requireRoles(auth, COMPETITION_MANAGER_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);
  const schema = await competitionSchema(env);
  const hasCompAttendance = await hasTable(env, "competition_attendance");
  const engineTargets = await hasEngineTargets(env);
  const engineTasks = await hasEngineTasks(env);
  const engineLogs = await hasEngineLogs(env);

  if (request.method === "GET" && path === "/api/edu-dept/competitions/filter-options") {
    const options = await loadCompetitionFilterOptions(env, auth.complexId);
    return json(
      { circles: options.circles, tracks: options.tracks },
      200,
      { "Cache-Control": "no-cache, no-store, must-revalidate" },
    );
  }

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
    let body: { target_scope?: TargetScope; competition_id?: number };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const competitionId =
      body.competition_id != null && Number(body.competition_id) > 0
        ? Number(body.competition_id)
        : undefined;
    try {
      const targetScope = normalizeTargetScope(body.target_scope ?? {});
      const students = await queryPreviewStudents(
        env,
        auth.complexId,
        scope,
        targetScope,
        competitionId,
      );
      return json(
        { items: Array.isArray(students) ? students : [] },
        200,
        { "Cache-Control": "no-cache, no-store, must-revalidate" },
      );
    } catch (err) {
      console.error("preview-targets failed:", err);
      return json(
        {
          error: "preview_failed",
          message: err instanceof Error ? err.message : "preview_query_error",
          items: [],
        },
        500,
        { "Cache-Control": "no-cache, no-store, must-revalidate" },
      );
    }
  }

  if (request.method === "POST" && path === "/api/edu-dept/competitions") {
    let body: {
      name_ar?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      category?: CompetitionCategory;
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

    const catResult = validateCategoryBody(body.category);
    if (catResult instanceof Response) return catResult;

    if (engineTargets && (!body.targets?.length)) {
      return json({ error: "targets_required" }, 400);
    }

    const tvKey = randomKey();
    const rules = { ...defaultRules(), ...(body.rules ?? {}) };
    if (catResult === "new_memorization" && body.rules?.memorization_unit) {
      rules.memorization_unit = parseMemorizationUnit(body.rules.memorization_unit);
    }
    if (catResult === "recitation") {
      const sirdRaw = (body.rules?.sird ?? {}) as Record<string, unknown>;
      rules.sird = {
        ...DEFAULT_SIRD_SETTINGS,
        ...parseSirdSettings({ sird: sirdRaw }),
      };
    }
    if (catResult === "new_memorization" || catResult === "review") {
      rules.active_weekdays = parseActiveWeekdays({
        active_weekdays: body.rules?.active_weekdays,
      });
    }
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
      target_scope: body.target_scope ?? {},
    });

    const competitionId = ins.meta.last_row_id as number;
    if (engineTargets && body.targets?.length) {
      await upsertStudentTargets(env, competitionId, body.targets);
    }

    if (
      (catResult === "new_memorization" || catResult === "review") &&
      engineTasks &&
      body.targets?.length
    ) {
      const evalCriteria = await loadEvaluationCriteria(env, auth.complexId);
      await seedCompetitionTasksFromCriteria(env, competitionId, evalCriteria);
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
    await deleteCompetitionTask(env, competitionId, taskId);
    return json({ ok: true, deleted: true });
  }

  const tasksMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)\/tasks$/);
  if (tasksMatch && engineTasks) {
    const competitionId = Number(tasksMatch[1]);
    const row = await competitionExists(env, competitionId, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      const hasInputType = await hasTaskInputType(env);
      const hasCritId = await hasCriterionId(env);
      const taskCols = competitionTaskSelectSql(hasInputType, hasCritId);
      const tasks = await env.DB.prepare(
        `SELECT ${taskCols.replace(", created_at", "")}, created_at
         FROM competition_tasks WHERE competition_id = ?
         ORDER BY sort_order, id`,
      )
        .bind(competitionId)
        .all();
      return json({ items: tasks.results ?? [] });
    }

    if (request.method === "POST") {
      let body: {
        name_ar?: string;
        weight?: number;
        type?: string;
        input_type?: string;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      if (!body.name_ar?.trim()) return json({ error: "name_required" }, 400);
      const taskType = body.type === "deduction" ? "deduction" : "addition";
      const inputType = parseTaskInputType(body.input_type, taskType);
      const hasInputType = await hasTaskInputType(env);
      const maxSort = await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(competitionId)
        .first<{ m: number }>();
      const ins = hasInputType
        ? await env.DB.prepare(
            `INSERT INTO competition_tasks
             (competition_id, name_ar, weight, type, input_type, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              competitionId,
              body.name_ar.trim(),
              Number(body.weight ?? 1) || 1,
              taskType,
              inputType,
              Number(maxSort?.m ?? 0) + 1,
            )
            .run()
        : await env.DB.prepare(
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

    const targetRows = await loadCompetitionTargetRows(env, competitionId);
    const taskMeta = await loadCompetitionTaskMeta(env, competitionId);
    const memTask = taskMeta.find((t) => t.criterion_id === "memorization");

    const allLogs = await loadCompetitionLogsForLeaderboard(env, competitionId);
    const memByStudent = memTask
      ? sumMemorizationLogPoints(allLogs, memTask.id)
      : new Map<number, number>();

    const achievedMap = memTask
      ? new Map(
          [...memByStudent.entries()].map(([sid, pts]) => [
            sid,
            memorizationPointsToJuz(pts),
          ]),
        )
      : await computeAchievedByStudent(env, competitionId);

    const hasMemCol = await tableHasColumn(env, "students", "memorization_amount");
    const updated: Array<{ student_id: number; new_memorization: number }> = [];
    const targetUpdates: ReturnType<typeof env.DB.prepare>[] = [];
    const studentUpdates: ReturnType<typeof env.DB.prepare>[] = [];

    for (const t of targetRows) {
      const fromLogs = achievedMap.get(t.student_id) ?? 0;
      const achieved = Math.min(
        Number(t.target_amount) || 0,
        Math.max(Number(t.achieved_amount) || 0, fromLogs),
      );
      if (achieved <= 0) continue;

      const newJuz =
        Math.round((Number(t.current_memorization ?? 0) + achieved) * 100) / 100;

      if (hasMemCol) {
        studentUpdates.push(
          env.DB.prepare(
            `UPDATE students SET memorization_amount = ? WHERE id = ? AND complex_id = ?`,
          ).bind(formatMemorizationJuz(newJuz), t.student_id, auth.complexId),
        );
      }

      targetUpdates.push(
        env.DB.prepare(
          `UPDATE competition_targets
           SET achieved_amount = ?, synced_at = datetime('now')
           WHERE competition_id = ? AND student_id = ?`,
        ).bind(achieved, competitionId, t.student_id),
      );

      updated.push({ student_id: t.student_id, new_memorization: newJuz });
    }

    const allStmts = [...studentUpdates, ...targetUpdates];
    for (let i = 0; i < allStmts.length; i += 50) {
      await env.DB.batch(allStmts.slice(i, i + 50));
    }

    await setCompetitionStatus(env, schema, competitionId, auth.complexId, "closed");

    return json({ ok: true, updated_count: updated.length, updated });
  }

  const detailMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)$/);
  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "DELETE") {
      const deleted = await deleteCompetitionCascade(env, id, auth.complexId);
      if (!deleted) return json({ error: "not_found" }, 404);
      return json({ ok: true, deleted: true });
    }

    if (request.method === "GET") {
      const bundle = await loadCompetitionDetailBundle(env, id, {
        engineTargets,
        engineTasks,
        engineLogs,
      });

      return json({
        competition: serializeCompetition(row, schema),
        targets: bundle.targets,
        tasks: bundle.tasks,
        logs: bundle.logs,
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
        const catResult = validateCategoryBody(body.category);
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
  if (liveTokenMatch) {
    const id = Number(liveTokenMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "DELETE") {
      await env.DB.prepare(
        `UPDATE competitions SET live_log_token = NULL WHERE id = ? AND complex_id = ?`,
      )
        .bind(id, auth.complexId)
        .run();
      return json({ ok: true, deleted: true });
    }

    if (request.method === "POST") {
      let body: { access_pin?: string };
      try {
        body = await request.json().catch(() => ({}));
      } catch {
        body = {};
      }
      const token = randomKey();
      const pin = String(body.access_pin ?? "").trim() || "1234";
      const currentRules = JSON.parse(String(row.rules_json ?? "{}")) as Record<
        string,
        unknown
      >;
      const nextRules = { ...currentRules, access_pin: pin };

      const hasAccessPinCol = await tableHasColumn(env, "competitions", "access_pin");
      const hasUpdatedAt = schema.updated_at;
      const sets = ["live_log_token = ?", "status = 'active'", "rules_json = ?"];
      const binds: (string | number)[] = [token, JSON.stringify(nextRules)];
      if (hasAccessPinCol) {
        sets.push("access_pin = ?");
        binds.push(pin);
      }
      if (hasUpdatedAt) sets.push("updated_at = datetime('now')");
      binds.push(id, auth.complexId);
      await env.DB.prepare(
        `UPDATE competitions SET ${sets.join(", ")} WHERE id = ? AND complex_id = ?`,
      )
        .bind(...binds)
        .run();

      return json({
        ok: true,
        live_log_token: token,
        access_pin: pin,
        path: `/live-log/${token}`,
      });
    }
  }

  const targetStudentMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/targets\/(\d+)$/,
  );
  if (targetStudentMatch && engineTargets) {
    const competitionId = Number(targetStudentMatch[1]);
    const studentId = Number(targetStudentMatch[2]);
    const row = await competitionExists(env, competitionId, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "PATCH") {
      let body: { target_amount?: number };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const amount = Number(body.target_amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return json({ error: "invalid_target_amount" }, 400);
      }
      const ok = await updateStudentTargetAmount(
        env,
        competitionId,
        studentId,
        amount,
      );
      if (!ok) return json({ error: "target_not_found" }, 404);
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      const ok = await deleteStudentTarget(env, competitionId, studentId);
      if (!ok) return json({ error: "target_not_found" }, 404);
      return json({ ok: true, deleted: true });
    }
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

      const hasAttStatus = await tableHasColumn(env, "competition_attendance", "status");
      const attRows = await env.DB.prepare(
        hasAttStatus
          ? `SELECT student_id, present, status FROM competition_attendance
             WHERE competition_id = ? AND attendance_date = ?`
          : `SELECT student_id, present FROM competition_attendance
             WHERE competition_id = ? AND attendance_date = ?`,
      )
        .bind(id, date)
        .all<{ student_id: number; present: number; status?: string }>();
      const attMap = new Map(
        (attRows.results ?? []).map((r) => [
          r.student_id,
          hasAttStatus
            ? normalizeCompAttendanceStatus(r.status ?? (r.present === 1 ? "present" : "absent"))
            : r.present === 1
              ? "present"
              : "absent",
        ]),
      );

      const items = (students.results ?? []).map((s) => ({
        student_id: s.student_id,
        full_name_ar: s.full_name_ar,
        status: attMap.get(s.student_id) ?? "present",
        present: (attMap.get(s.student_id) ?? "present") === "present",
      }));
      const presentCount = items.filter((i) => i.status === "present").length;
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
        records?: Array<{
          student_id: number;
          present?: boolean;
          status?: string;
        }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const date = body.date ?? new Date().toISOString().slice(0, 10);
      const records = body.records ?? [];
      const hasAttStatus = await tableHasColumn(env, "competition_attendance", "status");
      const stmts = records.map((rec) => {
        const status =
          rec.status != null
            ? normalizeCompAttendanceStatus(rec.status)
            : rec.present === false
              ? "absent"
              : "present";
        const presentVal = presentFromStatus(status);
        if (hasAttStatus) {
          return env.DB.prepare(
            `INSERT INTO competition_attendance
             (competition_id, student_id, attendance_date, present, status, recorded_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(competition_id, student_id, attendance_date) DO UPDATE SET
               present = excluded.present,
               status = excluded.status,
               recorded_by_user_id = excluded.recorded_by_user_id,
               recorded_at = datetime('now')`,
          ).bind(id, rec.student_id, date, presentVal, status, auth.userId);
        }
        return env.DB.prepare(
          `INSERT INTO competition_attendance
           (competition_id, student_id, attendance_date, present, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(competition_id, student_id, attendance_date) DO UPDATE SET
             present = excluded.present,
             recorded_by_user_id = excluded.recorded_by_user_id,
             recorded_at = datetime('now')`,
        ).bind(id, rec.student_id, date, presentVal, auth.userId);
      });
      for (let i = 0; i < stmts.length; i += 50) {
        await env.DB.batch(stmts.slice(i, i + 50));
      }
      return json({ ok: true });
    }
  }

  const gradingMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/grading$/,
  );
  if (gradingMatch && (engineLogs || (await hasSirdPeriodRecords(env)))) {
    const id = Number(gradingMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    const hasTaskId = await tableHasColumn(env, "competition_logs", "task_id");
    const hasPoints = await tableHasColumn(env, "competition_logs", "points");

    if (request.method === "GET") {
      const category = String(row.category ?? "recitation");
      const compRules = JSON.parse(String(row.rules_json ?? "{}")) as Record<
        string,
        unknown
      >;
      const memorizationUnit = memorizationUnitFromRules(compRules);
      const startDate = String(row.start_date);
      const endDate = String(row.end_date);
      const activeWeekdays = parseActiveWeekdays(compRules);
      const activeDates = isMemorizationTrackingCategory(category)
        ? enumerateActiveCompetitionDates(startDate, endDate, activeWeekdays)
        : [];
      const competitionDays =
        category === "recitation"
          ? countCompetitionDays(startDate, endDate)
          : countActiveCompetitionDays(startDate, endDate, activeWeekdays);
      const logDate = isMemorizationTrackingCategory(category) && activeDates.length
        ? defaultActiveLogDate(
            activeDates,
            url.searchParams.get("log_date")?.trim() ||
              new Date().toISOString().slice(0, 10),
          )
        : url.searchParams.get("log_date")?.trim() ||
          new Date().toISOString().slice(0, 10);
      const sirdSettings = parseSirdSettings(compRules);

      const targetRows = engineTargets
        ? await loadCompetitionTargetRows(env, id)
        : [];

      if (category === "recitation" && (await hasSirdPeriodRecords(env))) {
        const matrix = await loadSirdPeriodsMatrix(env, id);
        const periodsByStudent: Record<string, Array<Record<string, unknown>>> = {};
        for (const t of targetRows) {
          periodsByStudent[String(t.student_id)] = (
            matrix.get(t.student_id) ?? []
          ).map((p) => ({
            period_index: p.period_index,
            hizb_number: p.hizb_number,
            mistakes_count: p.mistakes_count,
            warnings_count: p.warnings_count,
            is_passed: p.is_passed,
            score: p.score,
          }));
        }
        return json({
          log_date: logDate,
          category,
          competition_days: competitionDays,
          start_date: row.start_date,
          end_date: row.end_date,
          sird_settings: sirdSettings,
          tasks: [],
          students: targetRows.map((t) => ({
            student_id: t.student_id,
            full_name_ar: t.full_name_ar,
            target_amount: Number(t.target_amount ?? 0),
            achieved_amount: Number(t.achieved_amount ?? 0),
            current_memorization: Number(t.current_memorization ?? 0),
          })),
          sird_periods: periodsByStudent,
          scores: {},
        });
      }

      const tasksRes = engineTasks
        ? await (async () => {
            const hasInputType = await hasTaskInputType(env);
            const hasCritId = await hasCriterionId(env);
            const taskCols = competitionTaskSelectSql(hasInputType, hasCritId).replace(
              ", created_at",
              "",
            );
            return env.DB.prepare(
              `SELECT ${taskCols}
               FROM competition_tasks WHERE competition_id = ?
               ORDER BY sort_order, id`,
            )
              .bind(id)
              .all<{
                id: number;
                name_ar: string;
                weight: number;
                type: string;
                input_type?: string;
                sort_order: number;
              }>();
          })()
        : { results: [] };

      const hydrated = await loadCompetitionDayLogsHydrated(env, id, logDate);
      const scores = new Map<string, number>();
      for (const [sid, audit] of hydrated.entries()) {
        for (const [taskId, pts] of Object.entries(audit.task_points)) {
          scores.set(`${sid}:${taskId}`, Number(pts) || 0);
        }
      }
      const dayAchievement: Record<string, number> = {};
      for (const [sid, audit] of hydrated.entries()) {
        dayAchievement[String(sid)] = Number(audit.juz_done ?? 0);
      }

      return json({
        log_date: logDate,
        category,
        memorization_unit: memorizationUnit,
        competition_days: competitionDays,
        active_weekdays: activeWeekdays,
        active_dates: activeDates,
        start_date: row.start_date,
        end_date: row.end_date,
        tasks: tasksRes.results ?? [],
        students: targetRows.map((t) => {
          const targetAmount = Number(t.target_amount ?? 0);
          return {
            student_id: t.student_id,
            full_name_ar: t.full_name_ar,
            target_amount: targetAmount,
            achieved_amount: Number(t.achieved_amount ?? 0),
            current_memorization: Number(t.current_memorization ?? 0),
            daily_faces: studentDailyFacesFromRules(
              category,
              memorizationUnit,
              targetAmount,
              startDate,
              endDate,
              compRules,
            ),
          };
        }),
        scores: Object.fromEntries(scores),
        day_achievement: dayAchievement,
      });
    }

    if (request.method === "POST") {
      let body: {
        log_date?: string;
        records?: Array<{
          student_id: number;
          task_id: number;
          points: number;
          hizb_index?: number;
        }>;
        targets?: Array<{ student_id: number; target_amount: number }>;
        day_achievement?: Array<{ student_id: number; juz_done: number }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const logDate =
        body.log_date?.trim() || new Date().toISOString().slice(0, 10);
      const records = body.records ?? [];
      const category = String(row.category ?? "recitation");
      const compRules = JSON.parse(String(row.rules_json ?? "{}")) as Record<
        string,
        unknown
      >;
      if (isMemorizationTrackingCategory(category)) {
        const activeDates = enumerateActiveCompetitionDates(
          String(row.start_date),
          String(row.end_date),
          parseActiveWeekdays(compRules),
        );
        if (!activeDates.includes(logDate)) {
          return json({ error: "inactive_day", active_dates: activeDates }, 400);
        }
      }
      const sirdSettings = parseSirdSettings(compRules);
      const hasNotes = await tableHasColumn(env, "competition_logs", "notes");

      const sirdRecords = (
        body as {
          sird_records?: Array<{
            student_id: number;
            period_index: number;
            hizb_number: number;
            mistakes_count: number;
            warnings_count: number;
          }>;
        }
      ).sird_records;

      if (
        category === "recitation" &&
        sirdRecords?.length &&
        (await hasSirdPeriodRecords(env))
      ) {
        for (const rec of sirdRecords) {
          const { score, is_passed } = computeSirdPeriodScore(
            rec.mistakes_count,
            rec.warnings_count,
            sirdSettings,
          );
          await upsertSirdPeriodRecord(
            env,
            id,
            rec.student_id,
            rec.period_index,
            {
              hizb_number: Number(rec.hizb_number) || 0,
              mistakes_count: rec.mistakes_count,
              warnings_count: rec.warnings_count,
              is_passed,
              score,
            },
            auth.userId,
          );
          if (await hasTable(env, "competition_audit_trail")) {
            await env.DB.prepare(
              `INSERT INTO competition_audit_trail
               (competition_id, student_id, action, payload_json, source, recorded_at)
               VALUES (?, ?, 'sird_period_upsert', ?, 'edu_supervisor', datetime('now'))`,
            )
              .bind(
                id,
                rec.student_id,
                JSON.stringify({
                  period_index: rec.period_index,
                  hizb_number: rec.hizb_number,
                  mistakes_count: rec.mistakes_count,
                  warnings_count: rec.warnings_count,
                  is_passed,
                  score,
                }),
              )
              .run();
          }
        }
        return json({ ok: true, saved: sirdRecords.length });
      }

      const dayAchievement = body.day_achievement ?? [];
      const dayByStudent = new Map(
        dayAchievement.map((e) => [Number(e.student_id), Number(e.juz_done ?? 0)]),
      );

      const byStudent = new Map<
        number,
        { student_id: number; records: Array<{ task_id: number; points: number }>; juz_done?: number }
      >();

      for (const rec of records) {
        const sid = Number(rec.student_id);
        if (!sid) continue;
        const cur = byStudent.get(sid) ?? { student_id: sid, records: [] };
        cur.records.push({
          task_id: Number(rec.task_id),
          points: Number(rec.points ?? 0),
        });
        byStudent.set(sid, cur);
      }

      for (const [sid, juz] of dayByStudent) {
        if (!sid) continue;
        const cur = byStudent.get(sid) ?? { student_id: sid, records: [] };
        cur.juz_done = juz;
        byStudent.set(sid, cur);
      }

      let saved = 0;
      if (byStudent.size > 0 && engineTasks) {
        saved = await saveCompetitionGradingBulk(
          env,
          id,
          [...byStudent.values()],
          {
            logDate,
            recordedByUserId: auth.userId,
            source: "edu_supervisor",
          },
        );
      }

      return json({
        ok: true,
        saved,
      });
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
    const leaderboardMode = url.searchParams.get("leaderboard_mode") ?? "top";

    const studentIds = await resolveCompetitionStudents(
      env,
      auth.complexId,
      id,
      scope,
    );
    const totalStudents = studentIds.length;

    const category = String(row.category ?? "recitation");
    const compRules = JSON.parse(String(row.rules_json ?? "{}")) as Record<string, unknown>;
    const memorizationUnit = memorizationUnitFromRules(compRules);
    const sirdSettings = parseSirdSettings(compRules);

    let targetRowsEarly: Awaited<ReturnType<typeof loadCompetitionTargetRows>> = [];
    if (engineTargets) {
      targetRowsEarly = await loadCompetitionTargetRows(env, id);
    }
    const volumeTargets = aggregateTargetVolumeMetrics(
      category,
      memorizationUnit,
      targetRowsEarly.map((t) => ({ target_amount: Number(t.target_amount ?? 0) })),
    );

    const taskMetaEarly = engineTasks
      ? await loadCompetitionTaskMeta(env, id)
      : [];
    const attendanceTaskId =
      taskMetaEarly.find((t) => t.criterion_id === "attendance")?.id ?? null;
    const memorizationTaskId =
      taskMetaEarly.find((t) => t.criterion_id === "memorization")?.id ?? null;
    const logsForMetrics = engineLogs
      ? await loadCompetitionLogsForLeaderboard(env, id, dateFrom, dateTo)
      : [];

    let disciplinePct = disciplinePctFromAttendanceLogs(
      logsForMetrics,
      attendanceTaskId,
    );
    if (disciplinePct === 0 && hasCompAttendance && totalStudents > 0) {
      const hasAttStatus = await tableHasColumn(env, "competition_attendance", "status");
      const att = await env.DB.prepare(
        hasAttStatus
          ? `SELECT COUNT(*) AS total_marks,
                    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_marks
             FROM competition_attendance
             WHERE competition_id = ? AND attendance_date BETWEEN ? AND ?
               AND status IN ('present', 'absent')`
          : `SELECT COUNT(*) AS total_marks,
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

    let metricsJuzFallback = 0;
    if (
      !memorizationTaskId &&
      (await tableHasColumn(env, "competition_logs", "metrics_json"))
    ) {
      const mjRows = await env.DB.prepare(
        `SELECT metrics_json
         FROM competition_logs
         WHERE competition_id = ? AND log_date >= ? AND log_date <= ?`,
      )
        .bind(id, dateFrom, dateTo)
        .all<{ metrics_json: string }>();
      for (const r of mjRows.results ?? []) {
        try {
          const m = JSON.parse(String(r.metrics_json ?? "{}")) as Record<
            string,
            unknown
          >;
          metricsJuzFallback += Math.max(0, Number(m.juz_done ?? 0));
        } catch {
          /* skip */
        }
      }
    }

    if (category === "recitation" && (await hasSirdPeriodRecords(env))) {
      const targetRows = engineTargets ? await loadCompetitionTargetRows(env, id) : [];
      const matrix = await loadSirdPeriodsMatrix(env, id);
      const sirdRows = targetRows.map((t) =>
        aggregateSirdStudentStats(
          t.student_id,
          t.full_name_ar,
          matrix.get(t.student_id) ?? [],
        ),
      );
      const sorted = [...sirdRows].sort((a, b) => b.mastery_pct - a.mastery_pct);
      const leaders =
        leaderboardMode === "all" ? sorted : sorted.slice(0, 5);
      const totalRead = sirdRows.reduce((s, r) => s + r.read_count, 0);
      const totalPassed = sirdRows.reduce((s, r) => s + r.passed_count, 0);
      const masteryPct =
        totalRead > 0 ? Math.round((totalPassed / totalRead) * 100) : 0;

      const sirdReadFaces = sumSirdReadFaces(matrix);

      return json({
        date_from: dateFrom,
        date_to: dateTo,
        category,
        sird_settings: sirdSettings,
        kpis: {
          discipline_pct: disciplinePct,
          achievement_pct: masteryPct,
          participants: totalStudents,
          target_juz: volumeTargets.target_juz,
          target_hizb: volumeTargets.target_hizb,
          target_faces: volumeTargets.target_faces,
          read_faces: sirdReadFaces,
          achieved_juz: 0,
          mastery_pct: masteryPct,
          total_read: totalRead,
          total_passed: totalPassed,
        },
        sird_students: sorted,
        leaders: sorted.map((r) => ({
          student_id: r.student_id,
          full_name_ar: r.full_name_ar,
          read_count: r.read_count,
          passed_count: r.passed_count,
          failed_count: r.failed_count,
          total_mistakes: r.total_mistakes,
          total_warnings: r.total_warnings,
          mastery_pct: r.mastery_pct,
        })),
      });
    }

    let targetRows: Awaited<ReturnType<typeof loadCompetitionTargetRows>> = [];
    if (engineTargets) {
      targetRows = await loadCompetitionTargetRows(env, id);
    }

    const leaderboardMap = await buildCompetitionLeaderboard(env, id, dateFrom, dateTo);
    const hasGuardianPhone = await tableHasColumn(env, "students", "guardian_phone");

    const guardianRows =
      hasGuardianPhone && targetRows.length
        ? await env.DB.prepare(
            `SELECT id, guardian_phone FROM students
             WHERE complex_id = ? AND id IN (${targetRows.map(() => "?").join(",")})`,
          )
            .bind(
              auth.complexId,
              ...targetRows.map((t) => t.student_id),
            )
            .all<{ id: number; guardian_phone: string | null }>()
        : { results: [] as Array<{ id: number; guardian_phone: string | null }> };

    const guardianMap = new Map(
      (guardianRows.results ?? []).map((r) => [r.id, r.guardian_phone]),
    );

    const nameMap = new Map(
      targetRows.map((t) => [t.student_id, t.full_name_ar]),
    );
    const targetByStudent = new Map(
      targetRows.map((t) => [t.student_id, Number(t.target_amount ?? 0)]),
    );

    const leaderStudentIds =
      targetRows.length > 0
        ? targetRows.map((t) => t.student_id)
        : [...leaderboardMap.keys()];

    const allLeaders = leaderStudentIds
      .map((student_id) => {
        const lb = leaderboardMap.get(student_id);
        const overallPct = lb?.overall_pct ?? 0;
        return {
          student_id,
          score: lb?.earned_score ?? 0,
          overall_pct: overallPct,
          grading_days: lb?.grading_days ?? 0,
          full_name_ar: nameMap.get(student_id),
          guardian_phone: guardianMap.get(student_id) ?? null,
          target_amount: targetByStudent.get(student_id) ?? 0,
          achievement_pct: overallPct,
        };
      })
      .sort((a, b) => (b.overall_pct ?? 0) - (a.overall_pct ?? 0));

    const avgOverall =
      allLeaders.length > 0
        ? Math.round(
            (allLeaders.reduce((s, r) => s + (r.overall_pct ?? 0), 0) /
              allLeaders.length) *
              10,
          ) / 10
        : 0;

    const leaders =
      leaderboardMode === "all" ? allLeaders : allLeaders.slice(0, 5);

    let targetSum = 0;
    let achievedSum = 0;
    for (const t of targetRows) {
      targetSum += Number(t.target_amount) || 0;
    }
    if (category === "new_memorization" && memorizationTaskId) {
      const memPts = sumMemorizationLogPoints(logsForMetrics, memorizationTaskId);
      for (const t of targetRows) {
        achievedSum += memorizationPointsToJuz(memPts.get(t.student_id) ?? 0);
      }
    }

    const readFaces = sumReadFacesFromTaskLogs(
      logsForMetrics,
      memorizationTaskId,
      metricsJuzFallback,
    );

    return json({
      date_from: dateFrom,
      date_to: dateTo,
      category,
      kpis: {
        discipline_pct: disciplinePct,
        achievement_pct: avgOverall,
        overall_pct: avgOverall,
        participants: totalStudents,
        target_juz: volumeTargets.target_juz,
        target_hizb: volumeTargets.target_hizb,
        target_faces: volumeTargets.target_faces,
        read_faces: readFaces,
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
