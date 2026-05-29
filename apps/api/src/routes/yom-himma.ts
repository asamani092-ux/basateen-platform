import type { Env } from "../types";
import { FIELD_EDU_ROLES } from "../lib/roles";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type HimmaRules = {
  hizb_points: number;
  alert_penalty: number;
  error_penalty: number;
  alerts_per_error: number;
  fail_threshold_errors: number;
  access_pin?: string;
};

type SessionRow = {
  id: number;
  name_ar: string;
  session_date: string;
  status: string;
  tv_launch_key: string;
  rules_json: string;
  scope_json: string;
  stage_id: number | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function randomKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function canAccessHimma(role: string): boolean {
  return role === "super_admin" || role === "edu_supervisor";
}

export async function handleYomHimmaList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!canAccessHimma(auth.role)) return json({ error: "forbidden" }, 403);

  const rows = await env.DB.prepare(
    `SELECT id, name_ar, session_date, status, tv_launch_key, stage_id
     FROM yom_himma_sessions WHERE complex_id = ?
     ORDER BY session_date DESC, id DESC LIMIT 50`,
  )
    .bind(auth.complexId)
    .all<SessionRow>();

  return json({ items: rows.results ?? [] });
}

export async function handleYomHimmaCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, FIELD_EDU_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  let body: {
    name_ar?: string;
    session_date?: string;
    rules?: Partial<HimmaRules>;
    scope?: { circle_ids?: number[]; track_ids?: number[] };
    stage_id?: number | null;
    targets?: Array<{ student_id: number; target_juz?: number; target_hizb?: number }>;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.name_ar?.trim() || !body.session_date) {
    return json({ error: "name_and_date_required" }, 400);
  }

  const rules: HimmaRules = {
    hizb_points: Number(body.rules?.hizb_points ?? 1),
    alert_penalty: Number(body.rules?.alert_penalty ?? 1),
    error_penalty: Number(body.rules?.error_penalty ?? 2),
    alerts_per_error: Number(body.rules?.alerts_per_error ?? 5),
    fail_threshold_errors: Number(body.rules?.fail_threshold_errors ?? 3),
    access_pin: String((body.rules as Record<string, unknown> | undefined)?.access_pin ?? "1234"),
  };

  const scope = {
    circle_ids: body.scope?.circle_ids ?? [],
    track_ids: body.scope?.track_ids ?? [],
  };

  const key = randomKey();
  const ins = await env.DB.prepare(
    `INSERT INTO yom_himma_sessions
     (complex_id, name_ar, session_date, status, tv_launch_key, rules_json, scope_json, stage_id, created_by_user_id)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
  )
    .bind(
      auth.complexId,
      body.name_ar.trim(),
      body.session_date,
      key,
      JSON.stringify(rules),
      JSON.stringify(scope),
      body.stage_id ?? null,
      auth.userId,
    )
    .run();

  const sessionId = ins.meta.last_row_id as number;

  for (const t of body.targets ?? []) {
    if (!t.student_id) continue;
    await env.DB.prepare(
      `INSERT INTO yom_himma_targets (session_id, student_id, target_juz, target_hizb)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(
        sessionId,
        t.student_id,
        Number(t.target_juz ?? 0),
        Number(t.target_hizb ?? 0),
      )
      .run();
  }

  return json({ ok: true, id: sessionId, tv_launch_key: key });
}

export async function handleYomHimmaDetail(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!canAccessHimma(auth.role)) return json({ error: "forbidden" }, 403);

  const m = url.pathname.match(/^\/api\/yom-himma\/(\d+)$/);
  const sessionId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(sessionId)) return json({ error: "invalid_id" }, 400);

  const session = await env.DB.prepare(
    `SELECT * FROM yom_himma_sessions WHERE id = ? AND complex_id = ?`,
  )
    .bind(sessionId, auth.complexId)
    .first<SessionRow>();

  if (!session) return json({ error: "not_found" }, 404);

  const targets = await env.DB.prepare(
    `SELECT t.student_id, t.target_juz, t.target_hizb, s.full_name_ar
     FROM yom_himma_targets t
     JOIN students s ON s.id = t.student_id
     WHERE t.session_id = ?`,
  )
    .bind(sessionId)
    .all();

  const audit = await env.DB.prepare(
    `SELECT * FROM yom_himma_audit WHERE session_id = ?`,
  )
    .bind(sessionId)
    .all();

  return json({
    session: {
      ...session,
      rules: JSON.parse(session.rules_json) as HimmaRules,
      scope: JSON.parse(session.scope_json),
    },
    targets: targets.results ?? [],
    audit: audit.results ?? [],
  });
}

export async function handleYomHimmaUpsertAudit(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, FIELD_EDU_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const m = url.pathname.match(/^\/api\/yom-himma\/(\d+)\/audit$/);
  const sessionId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(sessionId)) return json({ error: "invalid_id" }, 400);

  let body: {
    student_id?: number;
    attendance?: "present" | "absent";
    juz_done?: number;
    hizb_done?: number;
    alerts_count?: number;
    errors_count?: number;
    current_hizb_failed?: number;
    delta_alert?: number;
    delta_error?: number;
    delta_juz?: number;
    delta_hizb?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const studentId = Number(body.student_id);
  if (!studentId) return json({ error: "student_id_required" }, 400);

  const session = await env.DB.prepare(
    `SELECT rules_json FROM yom_himma_sessions WHERE id = ? AND complex_id = ?`,
  )
    .bind(sessionId, auth.complexId)
    .first<{ rules_json: string }>();

  if (!session) return json({ error: "not_found" }, 404);

  const rules = JSON.parse(session.rules_json) as HimmaRules;

  const existing = await env.DB.prepare(
    `SELECT * FROM yom_himma_audit WHERE session_id = ? AND student_id = ?`,
  )
    .bind(sessionId, studentId)
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
  let attendance = existing?.attendance ?? null;

  if (body.attendance) attendance = body.attendance;
  if (body.alerts_count != null) alerts = body.alerts_count;
  if (body.errors_count != null) errors = body.errors_count;
  if (body.juz_done != null) juz = body.juz_done;
  if (body.hizb_done != null) hizb = body.hizb_done;
  if (body.delta_alert) alerts += body.delta_alert;
  if (body.delta_error) errors += body.delta_error;
  if (body.delta_juz) juz += body.delta_juz;
  if (body.delta_hizb) hizb += body.delta_hizb;

  const effectiveErrors =
    errors + Math.floor(alerts / Math.max(rules.alerts_per_error, 1));
  if (effectiveErrors >= rules.fail_threshold_errors) failed = 1;
  if (body.current_hizb_failed != null) failed = body.current_hizb_failed;

  await env.DB.prepare(
    `INSERT INTO yom_himma_audit
     (session_id, student_id, attendance, juz_done, hizb_done, alerts_count, errors_count, current_hizb_failed, updated_at)
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
    .bind(sessionId, studentId, attendance, juz, hizb, alerts, errors, failed)
    .run();

  return json({
    ok: true,
    failed: failed === 1,
    effective_errors: effectiveErrors,
    threshold: rules.fail_threshold_errors,
  });
}

export async function handleYomHimmaTv(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "key_required" }, 400);

  const session = await env.DB.prepare(
    `SELECT id, name_ar, session_date, status, rules_json
     FROM yom_himma_sessions WHERE tv_launch_key = ? LIMIT 1`,
  )
    .bind(key)
    .first<SessionRow>();

  if (!session) return json({ error: "invalid_key" }, 404);

  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN attendance = 'present' THEN 1 ELSE 0 END) AS present,
       SUM(juz_done) AS juz_total,
       SUM(hizb_done) AS hizb_total
     FROM yom_himma_audit WHERE session_id = ?`,
  )
    .bind(session.id)
    .first<{
      total: number;
      present: number;
      juz_total: number;
      hizb_total: number;
    }>();

  return json({
    session: {
      id: session.id,
      name_ar: session.name_ar,
      session_date: session.session_date,
      status: session.status,
    },
    stats: stats ?? { total: 0, present: 0, juz_total: 0, hizb_total: 0 },
  });
}
