import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { hasEngineTargets, hasEngineTasks } from "../lib/competition-engine";
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
  const hasCustomCategory = await tableHasColumn(env, "competitions", "custom_category");
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
  if (hasCustomCategory) cols.push("custom_category");
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
    custom_category: hasCustomCategory ? String(comp.custom_category ?? "") : "",
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

    const logDate = new Date().toISOString().slice(0, 10);
    const engineTargets = await hasEngineTargets(env);
    const engineTasks = await hasEngineTasks(env);

    let students: { results?: unknown[] };
    if (engineTargets) {
      students = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar,
                ct.current_memorization, ct.target_amount, ct.achieved_amount
         FROM competition_targets ct
         INNER JOIN students s ON s.id = ct.student_id
         WHERE ct.competition_id = ? AND s.is_active = 1
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
         WHERE s.complex_id = ? AND s.is_active = 1
         ORDER BY s.full_name_ar`,
      )
        .bind(session.id, session.complexId)
        .all();
    }

    const tasks = engineTasks
      ? await env.DB.prepare(
          `SELECT id, name_ar, weight, type, sort_order
           FROM competition_tasks WHERE competition_id = ?
           ORDER BY sort_order, id`,
        )
          .bind(session.id)
          .all()
      : { results: [] };

    const hasMetricsJson = await tableHasColumn(env, "competition_logs", "metrics_json");
    const hasPoints = await tableHasColumn(env, "competition_logs", "points");
    let logs: { results?: unknown[] };
    if (hasMetricsJson) {
      logs = await env.DB.prepare(
        `SELECT student_id, log_date, metrics_json, recorded_at
         FROM competition_logs WHERE competition_id = ? AND log_date = ?`,
      )
        .bind(session.id, logDate)
        .all();
    } else if (hasPoints) {
      logs = await env.DB.prepare(
        `SELECT cl.student_id, cl.log_date, cl.points, cl.notes, cl.task_id,
                ct.name_ar AS task_name, cl.recorded_at
         FROM competition_logs cl
         LEFT JOIN competition_tasks ct ON ct.id = cl.task_id
         WHERE cl.competition_id = ? AND cl.log_date = ?`,
      )
        .bind(session.id, logDate)
        .all();
    } else {
      logs = { results: [] };
    }

    const sess = session as {
      category?: string;
      custom_category?: string;
    };

    return json({
      kind: session.kind,
      session: {
        id: session.id,
        name_ar: session.name_ar,
        telemetry_type: session.telemetry_type,
        category: sess.category ?? "recitation",
        custom_category: sess.custom_category ?? "",
        rules: session.rules,
        tv_key: session.tv_key,
      },
      students: students.results ?? [],
      tasks: tasks.results ?? [],
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

    const logDate = new Date().toISOString().slice(0, 10);
    const metrics = body.metrics ?? {
      juz_done: body.juz_done,
      hizb_done: body.hizb_done,
      alerts: body.delta_alert,
      errors: body.delta_error,
      category: (session as { category?: string }).category,
    };

    const hasMetricsJson = await tableHasColumn(env, "competition_logs", "metrics_json");
    const hasPoints = await tableHasColumn(env, "competition_logs", "points");

    if (hasMetricsJson) {
      await env.DB.prepare(
        `INSERT INTO competition_logs
         (competition_id, student_id, log_date, metrics_json, source, recorded_by_user_id)
         VALUES (?, ?, ?, ?, 'live_log', NULL)
         ON CONFLICT(competition_id, student_id, log_date) DO UPDATE SET
           metrics_json = excluded.metrics_json,
           recorded_at = datetime('now')`,
      )
        .bind(session.id, studentId, logDate, JSON.stringify(metrics))
        .run();
    } else if (hasPoints) {
      const taskId = body.metrics?.task_id != null ? Number(body.metrics.task_id) : null;
      const points = Number(body.metrics?.points ?? body.juz_done ?? body.hizb_done ?? 0);
      await env.DB.prepare(
        `INSERT INTO competition_logs
         (competition_id, student_id, task_id, log_date, points, notes, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
        .bind(
          session.id,
          studentId,
          taskId,
          logDate,
          points,
          JSON.stringify(metrics),
        )
        .run();
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
