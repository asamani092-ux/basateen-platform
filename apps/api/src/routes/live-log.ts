import type { Env } from "../types";
import { todayRiyadhIso } from "../lib/today-riyadh-iso";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import {
  hasTable,
  studentIsActiveSql,
  tableHasColumn,
} from "../lib/db-schema";
import {
  countCompetitionDays,
  competitionTaskSelectSql,
  computeSirdPeriodScore,
  defaultActiveLogDate,
  enumerateActiveCompetitionDates,
  hasEngineTargets,
  hasEngineTasks,
  hasSirdPeriodRecords,
  hasTaskInputType,
  isMemorizationTrackingCategory,
  loadCompetitionDayLogsHydrated,
  loadCompetitionGradedLogDates,
  loadSirdPeriodsMatrix,
  parseActiveWeekdays,
  parseMemorizationUnit,
  parseSirdSettings,
  studentDailyFacesFromRules,
  targetHizbCount,
  upsertSirdPeriodRecord,
} from "../lib/competition-engine";
import { saveCompetitionGradingBulk } from "../lib/competition-grading-save";
import { FIELD_EDU_ROLES } from "../lib/roles";

type SessionKind = "yom_himma" | "competition";

type HimmaRules = {
  hizb_points: number;
  alert_penalty: number;
  error_penalty: number;
  alerts_per_error: number;
  fail_threshold_errors: number;
};

const DEFAULT_HIMMA_RULES: HimmaRules = {
  hizb_points: 1,
  alert_penalty: 0.5,
  error_penalty: 1,
  alerts_per_error: 5,
  fail_threshold_errors: 3,
};

function parseRulesJson(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === "") return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function resolveYomHimmaLiveSession(env: Env, token: string) {
  const hasRulesJson = await tableHasColumn(env, "yom_himma_sessions", "rules_json");
  const cols = [
    "id",
    "complex_id",
    "name_ar",
    "session_date",
    "status",
    "live_log_token",
    "tv_launch_key",
  ];
  if (hasRulesJson) cols.push("rules_json");

  const himma = await env.DB.prepare(
    `SELECT ${cols.join(", ")}
     FROM yom_himma_sessions
     WHERE live_log_token = ? OR tv_launch_key = ?
     LIMIT 1`,
  )
    .bind(token, token)
    .first<Record<string, unknown>>();

  if (!himma) return null;

  const himmaRules = hasRulesJson
    ? parseRulesJson(himma.rules_json)
    : {};
  const mergedRules = { ...DEFAULT_HIMMA_RULES, ...himmaRules } as HimmaRules;

  return {
    kind: "yom_himma" as SessionKind,
    id: Number(himma.id),
    complexId: Number(himma.complex_id),
    name_ar: String(himma.name_ar ?? ""),
    date: String(himma.session_date ?? ""),
    status: String(himma.status ?? "draft"),
    rules: mergedRules,
    access_pin: String(himmaRules.access_pin ?? "1234"),
    tv_key: String(himma.tv_launch_key ?? ""),
  };
}

async function resolveCompetitionLiveSession(env: Env, token: string) {
  const hasCategory = await tableHasColumn(env, "competitions", "category");
  const hasAccessPinCol = await tableHasColumn(env, "competitions", "access_pin");
  const hasRulesJson = await tableHasColumn(env, "competitions", "rules_json");
  const hasTelemetry = await tableHasColumn(env, "competitions", "telemetry_type");
  const hasStageId = await tableHasColumn(env, "competitions", "stage_id");

  const cols = [
    "id",
    "complex_id",
    "name_ar",
    "start_date",
    "end_date",
    "status",
    "live_log_token",
    "tv_launch_key",
  ];
  if (hasRulesJson) cols.push("rules_json");
  if (hasTelemetry) cols.push("telemetry_type");
  if (hasStageId) cols.push("stage_id");
  if (hasCategory) cols.push("category");
  if (hasAccessPinCol) cols.push("access_pin");

  const comp = await env.DB.prepare(
    `SELECT ${cols.join(", ")}
     FROM competitions
     WHERE live_log_token = ? OR tv_launch_key = ?
     LIMIT 1`,
  )
    .bind(token, token)
    .first<Record<string, unknown>>();

  if (!comp) return null;

  const compRules = hasRulesJson ? parseRulesJson(comp.rules_json) : {};
  const pinFromCol = hasAccessPinCol ? String(comp.access_pin ?? "") : "";

  return {
    kind: "competition" as SessionKind,
    id: Number(comp.id),
    complexId: Number(comp.complex_id),
    name_ar: String(comp.name_ar ?? ""),
    date: String(comp.start_date ?? ""),
    status: String(comp.status ?? "draft"),
    telemetry_type: hasTelemetry
      ? String(comp.telemetry_type ?? "intensive_routine")
      : "intensive_routine",
    rules: compRules,
    access_pin: pinFromCol || String(compRules.access_pin ?? "1234"),
    tv_key: String(comp.tv_launch_key ?? ""),
    stage_id: hasStageId ? (comp.stage_id as number | null) : null,
    category: hasCategory ? String(comp.category ?? "recitation") : "recitation",
  };
}

async function resolveLiveSession(env: Env, token: string) {
  const himma = await resolveYomHimmaLiveSession(env, token);
  if (himma) return himma;
  return resolveCompetitionLiveSession(env, token);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}


export async function handleLiveLogRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/live-log\/([^/]+)$/);
  if (!m) return null;
  const token = m[1];

  const session = await resolveLiveSession(env, token);
  if (!session) return json({ error: "invalid_token" }, 404);
  const pin = (request.headers.get("x-live-pin") ?? url.searchParams.get("pin_code") ?? "").trim();
  if (!pin) return json({ error: "pin_required" }, 401);
  if (pin !== String(session.access_pin ?? "1234")) {
    return json({ error: "invalid_pin" }, 401);
  }

  if (request.method === "GET") {
    if (session.kind === "yom_himma") {
      const targets = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar,
                t.target_juz, t.target_hizb
         FROM students s
         LEFT JOIN yom_himma_targets t
           ON t.student_id = s.id AND t.session_id = ?
         WHERE s.complex_id = ? AND s.is_active = 1
         ORDER BY s.full_name_ar`,
      )
        .bind(session.id, session.complexId)
        .all();

      const audit = await env.DB.prepare(
        `SELECT student_id, attendance, juz_done, hizb_done, alerts_count,
                errors_count, current_hizb_failed, updated_at
         FROM yom_himma_audit WHERE session_id = ?`,
      )
        .bind(session.id)
        .all();

      return json({
        kind: session.kind,
        session: {
          id: session.id,
          name_ar: session.name_ar,
          date: session.date,
          status: session.status,
          rules: session.rules,
          tv_key: session.tv_key,
        },
        students: targets.results ?? [],
        audit: audit.results ?? [],
      });
    }

    const engineTargets = await hasEngineTargets(env);
    const engineTasks = await hasEngineTasks(env);
    const compRow = await env.DB.prepare(
      `SELECT start_date, end_date, rules_json, category FROM competitions WHERE id = ?`,
    )
      .bind(session.id)
      .first<{
        start_date: string;
        end_date: string;
        rules_json: string;
        category: string;
      }>();
    const compRules = parseRulesJson(compRow?.rules_json);
    const memorizationUnit = parseMemorizationUnit(compRules.memorization_unit);
    const startDate = String(compRow?.start_date ?? session.date);
    const endDate = String(compRow?.end_date ?? session.date);
    const compCategory = String(
      compRow?.category ?? (session as { category?: string }).category ?? "recitation",
    );
    const activeWeekdays = parseActiveWeekdays(compRules);
    const activeDates = isMemorizationTrackingCategory(compCategory)
      ? enumerateActiveCompetitionDates(startDate, endDate, activeWeekdays)
      : [];
    const competitionDays =
      compCategory === "recitation"
        ? countCompetitionDays(startDate, endDate)
        : activeDates.length;
    const logDate = isMemorizationTrackingCategory(compCategory) && activeDates.length
      ? defaultActiveLogDate(
          activeDates,
          url.searchParams.get("log_date")?.trim() ||
            todayRiyadhIso(),
        )
      : todayRiyadhIso();
    const activeSql = await studentIsActiveSql(env, "s");

    let students: { results?: unknown[] };
    if (engineTargets) {
      students = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar,
                ct.current_memorization, ct.target_amount, ct.achieved_amount
         FROM competition_targets ct
         INNER JOIN students s ON s.id = ct.student_id
         WHERE ct.competition_id = ? AND ${activeSql}
         ORDER BY s.full_name_ar`,
      )
        .bind(session.id)
        .all();
    } else {
      students = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar,
                p.total_target_juz, p.daily_volume_juz, p.distributed_json
         FROM students s
         LEFT JOIN competition_student_plans p
           ON p.student_id = s.id AND p.competition_id = ?
         WHERE s.complex_id = ? AND ${activeSql}
         ORDER BY s.full_name_ar`,
      )
        .bind(session.id, session.complexId)
        .all();
    }

    const enrichedStudents = (students.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const targetAmount = Number(r.target_amount ?? r.total_target_juz ?? 0);
      return {
        ...r,
        target_hizb:
          compCategory === "recitation" ? targetHizbCount(targetAmount) : undefined,
        daily_faces: studentDailyFacesFromRules(
          compCategory,
          memorizationUnit,
          targetAmount,
          startDate,
          endDate,
          compRules,
        ),
        memorization_unit:
          compCategory === "new_memorization" ? memorizationUnit : undefined,
      };
    });

    const sirdSettings = parseSirdSettings(compRules);
    const isRecitation = compCategory === "recitation";

    const tasks =
      isRecitation && (await hasSirdPeriodRecords(env))
        ? { results: [] }
        : engineTasks
          ? await (async () => {
              const hasInputType = await hasTaskInputType(env);
              const taskCols = competitionTaskSelectSql(hasInputType).replace(
                ", created_at",
                "",
              );
              return env.DB.prepare(
                `SELECT ${taskCols}
                 FROM competition_tasks WHERE competition_id = ?
                 ORDER BY sort_order, id`,
              )
                .bind(session.id)
                .all();
            })()
          : { results: [] };

    let sirdPeriods: Record<string, Array<Record<string, unknown>>> | undefined;
    if (isRecitation && (await hasSirdPeriodRecords(env))) {
      const matrix = await loadSirdPeriodsMatrix(env, session.id);
      sirdPeriods = {};
      for (const [sid, periods] of matrix.entries()) {
        sirdPeriods[String(sid)] = periods.map((p) => ({
          period_index: p.period_index,
          hizb_number: p.hizb_number,
          mistakes_count: p.mistakes_count,
          warnings_count: p.warnings_count,
          is_passed: p.is_passed,
          score: p.score,
        }));
      }
    }

    const [hydrated, gradedDates] = await Promise.all([
      loadCompetitionDayLogsHydrated(env, session.id, logDate),
      loadCompetitionGradedLogDates(env, session.id),
    ]);
    const logs = {
      results: [...hydrated.values()].map((a) => ({
        student_id: a.student_id,
        log_date: logDate,
        metrics_json: JSON.stringify({
          juz_done: a.juz_done,
          task_points: a.task_points,
        }),
      })),
    };

    const sess = session as { category?: string };

    return json({
      kind: session.kind,
      session: {
        id: session.id,
        name_ar: session.name_ar,
        telemetry_type:
          "telemetry_type" in session ? session.telemetry_type : undefined,
        category: sess.category ?? compCategory,
        start_date: startDate,
        end_date: endDate,
        memorization_unit: memorizationUnit,
        competition_days: competitionDays,
        active_weekdays: isMemorizationTrackingCategory(compCategory)
          ? activeWeekdays
          : undefined,
        active_dates: activeDates.length ? activeDates : undefined,
        graded_dates: gradedDates.length ? gradedDates : undefined,
        log_date: logDate,
        sird_settings: isRecitation ? sirdSettings : undefined,
        rules: session.rules,
        tv_key: session.tv_key,
      },
      students: enrichedStudents,
      tasks: tasks.results ?? [],
      sird_periods: sirdPeriods,
      logs: logs.results ?? [],
    });
  }

  if (request.method === "POST") {
    let body: {
      student_id?: number;
      attendance?: string;
      juz_done?: number;
      hizb_done?: number;
      delta_alert?: number;
      delta_error?: number;
      delta_hizb?: number;
      delta_juz?: number;
      metrics?: Record<string, unknown>;
      recorder_label?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    if (!studentId) return json({ error: "student_id_required" }, 400);

    if (session.kind === "yom_himma") {
      const rules = session.rules as HimmaRules;
      const existing = await env.DB.prepare(
        `SELECT * FROM yom_himma_audit WHERE session_id = ? AND student_id = ?`,
      )
        .bind(session.id, studentId)
        .first<{
          alerts_count: number;
          errors_count: number;
          juz_done: number;
          hizb_done: number;
          current_hizb_failed: number;
          attendance: string | null;
        }>();

      let alerts = existing?.alerts_count ?? 0;
      let errors = existing?.errors_count ?? 0;
      let juz = existing?.juz_done ?? 0;
      let hizb = existing?.hizb_done ?? 0;
      let failed = existing?.current_hizb_failed ?? 0;
      let attendance = existing?.attendance ?? "present";

      if (body.attendance) attendance = body.attendance;
      if (body.delta_alert) alerts += body.delta_alert;
      if (body.delta_error) errors += body.delta_error;
      if (body.delta_hizb) hizb += body.delta_hizb;
      if (body.delta_juz) juz += body.delta_juz;
      if (body.juz_done != null) juz = body.juz_done;
      if (body.hizb_done != null) hizb = body.hizb_done;

      const effectiveErrors =
        errors + Math.floor(alerts / Math.max(rules.alerts_per_error, 1));
      if (effectiveErrors >= rules.fail_threshold_errors) failed = 1;

      await env.DB.prepare(
        `INSERT INTO yom_himma_audit
         (session_id, student_id, attendance, juz_done, hizb_done,
          alerts_count, errors_count, current_hizb_failed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(session_id, student_id) DO UPDATE SET
           attendance = excluded.attendance,
           juz_done = excluded.juz_done,
           hizb_done = excluded.hizb_done,
           alerts_count = excluded.alerts_count,
           errors_count = excluded.errors_count,
           current_hizb_failed = excluded.current_hizb_failed,
           updated_at = datetime('now')`,
      )
        .bind(session.id, studentId, attendance, juz, hizb, alerts, errors, failed)
        .run();

      return json({
        ok: true,
        failed: failed === 1,
        tv_key: session.tv_key,
      });
    }

    const compRowPost = await env.DB.prepare(
      `SELECT start_date, end_date, rules_json, category FROM competitions WHERE id = ?`,
    )
      .bind(session.id)
      .first<{
        start_date: string;
        end_date: string;
        rules_json: string;
        category: string;
      }>();
    const postRules = parseRulesJson(compRowPost?.rules_json);
    const postCategory = String(
      compRowPost?.category ??
        (session as { category?: string }).category ??
        "recitation",
    );
    let logDate =
      (body as { log_date?: string }).log_date?.trim() ||
      todayRiyadhIso();
    if (isMemorizationTrackingCategory(postCategory)) {
      const activeDates = enumerateActiveCompetitionDates(
        String(compRowPost?.start_date ?? session.date),
        String(compRowPost?.end_date ?? session.date),
        parseActiveWeekdays(postRules),
      );
      if (!activeDates.includes(logDate)) {
        return json({ error: "inactive_day", active_dates: activeDates }, 400);
      }
    }
    const metrics = body.metrics ?? {
      juz_done: body.juz_done,
      hizb_done: body.hizb_done,
      alerts: body.delta_alert,
      errors: body.delta_error,
      category: (session as { category?: string }).category,
    };

    const compCategory = String((session as { category?: string }).category ?? "recitation");
    if (compCategory === "recitation" && (await hasSirdPeriodRecords(env))) {
      const compRow = await env.DB.prepare(
        `SELECT rules_json FROM competitions WHERE id = ?`,
      )
        .bind(session.id)
        .first<{ rules_json: string }>();
      const sirdSettings = parseSirdSettings(parseRulesJson(compRow?.rules_json));
      const sirdPayload = metrics.sird_period as
        | {
            period_index?: number;
            hizb_number?: number;
            mistakes_count?: number;
            warnings_count?: number;
          }
        | undefined;
      const periodIndex = Number(sirdPayload?.period_index ?? metrics.period_index ?? 0);
      if (periodIndex > 0) {
        const mistakes = Number(sirdPayload?.mistakes_count ?? metrics.mistakes_count ?? 0);
        const warnings = Number(sirdPayload?.warnings_count ?? metrics.warnings_count ?? 0);
        const hizbNumber = Number(sirdPayload?.hizb_number ?? metrics.hizb_number ?? 0);
        const { score, is_passed } = computeSirdPeriodScore(
          mistakes,
          warnings,
          sirdSettings,
        );
        await upsertSirdPeriodRecord(env, session.id, studentId, periodIndex, {
          hizb_number: hizbNumber,
          mistakes_count: mistakes,
          warnings_count: warnings,
          is_passed,
          score,
        });
        if (await hasTable(env, "competition_audit_trail")) {
          await env.DB.prepare(
            `INSERT INTO competition_audit_trail
             (competition_id, student_id, action, payload_json, source, recorded_at)
             VALUES (?, ?, 'sird_period_upsert', ?, 'live_log', datetime('now'))`,
          )
            .bind(
              session.id,
              studentId,
              JSON.stringify({
                period_index: periodIndex,
                hizb_number: hizbNumber,
                mistakes_count: mistakes,
                warnings_count: warnings,
                is_passed,
                score,
              }),
            )
            .run();
        }
        return json({ ok: true, is_passed, score, tv_key: session.tv_key });
      }
    }

    const taskPointsRaw = metrics.task_points as Record<string, number> | undefined;
    const records: Array<{ task_id: number; points: number }> = [];
    if (taskPointsRaw && typeof taskPointsRaw === "object") {
      for (const [k, v] of Object.entries(taskPointsRaw)) {
        const tid = Number(k);
        if (tid) records.push({ task_id: tid, points: Number(v) || 0 });
      }
    }

    const engineTasksPost = await hasEngineTasks(env);
    if (engineTasksPost) {
      const hasCritId = await tableHasColumn(env, "competition_tasks", "criterion_id");
      const critCol = hasCritId ? ", criterion_id" : "";
      const taskRows = await env.DB.prepare(
        `SELECT id${critCol} FROM competition_tasks WHERE competition_id = ?`,
      )
        .bind(session.id)
        .all<{ id: number; criterion_id?: string }>();
      const memTask = (taskRows.results ?? []).find(
        (t) => t.criterion_id === "memorization",
      );
      const juzDone = Number(metrics.juz_done ?? body.juz_done ?? 0);
      if (memTask && juzDone > 0) {
        const existing = records.find((r) => r.task_id === memTask.id);
        if (existing) existing.points = Math.max(existing.points, juzDone);
        else records.push({ task_id: memTask.id, points: juzDone });
      }

      await saveCompetitionGradingBulk(
        env,
        session.id,
        [
          {
            student_id: studentId,
            records,
            juz_done: juzDone,
            metrics: { ...metrics, juz_done: juzDone },
          },
        ],
        {
          logDate,
          recordedByUserId: null,
          source: "live_log",
        },
      );
    }

    if (await hasTable(env, "competition_audit_trail")) {
      await env.DB.prepare(
        `INSERT INTO competition_audit_trail
         (competition_id, student_id, action, payload_json, source, recorded_at)
         VALUES (?, ?, 'live_upsert', ?, 'live_log', datetime('now'))`,
      )
        .bind(session.id, studentId, JSON.stringify(metrics))
        .run();
    }

    return json({ ok: true, tv_key: session.tv_key });
  }

  return json({ error: "method_not_allowed" }, 405);
}

/** توليد live_log_token لجلسة يوم الهمة */
export async function handleYomHimmaLiveLogToken(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/yom-himma\/(\d+)\/live-log-token$/);
  if (request.method !== "POST" || !m) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, FIELD_EDU_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const sessionId = Number(m[1]);
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  await env.DB.prepare(
    `UPDATE yom_himma_sessions SET live_log_token = ?, status = 'live'${(await tableHasColumn(env, "yom_himma_sessions", "updated_at")) ? ", updated_at = datetime('now')" : ""}
     WHERE id = ? AND complex_id = ?`,
  )
    .bind(token, sessionId, auth.complexId)
    .run();

  const hasRulesJson = await tableHasColumn(env, "yom_himma_sessions", "rules_json");
  let accessPin = "1234";
  if (hasRulesJson) {
    const row = await env.DB.prepare(
      `SELECT rules_json FROM yom_himma_sessions WHERE id = ? AND complex_id = ?`,
    )
      .bind(sessionId, auth.complexId)
      .first<{ rules_json: string }>();
    const rules = parseRulesJson(row?.rules_json);
    accessPin = String(rules.access_pin ?? "1234");
  }

  return json({
    ok: true,
    live_log_token: token,
    access_pin: accessPin,
    path: `/live-log/${token}`,
  });
}
