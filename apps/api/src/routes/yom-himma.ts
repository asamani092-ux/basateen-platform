import type { Env } from "../types";
import {
  fetchHimmaAuditFromLedger,
  upsertHimmaAuditToLedger,
} from "../lib/himma-ledger-view";
import { FIELD_EDU_ROLES } from "../lib/roles";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type HimmaRules = {
  hizb_points: number;
  alert_penalty: number;
  error_penalty: number;
  alerts_per_error: number;
  fail_threshold_errors: number;
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
  return role === "general_manager" || role === "edu_supervisor";
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

  const audit = await fetchHimmaAuditFromLedger(
    env,
    sessionId,
    session.session_date,
  );

  return json({
    session: {
      ...session,
      rules: JSON.parse(session.rules_json) as HimmaRules,
      scope: JSON.parse(session.scope_json),
    },
    targets: targets.results ?? [],
    audit,
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
    `SELECT rules_json, session_date FROM yom_himma_sessions WHERE id = ? AND complex_id = ?`,
  )
    .bind(sessionId, auth.complexId)
    .first<{ rules_json: string; session_date: string }>();

  if (!session) return json({ error: "not_found" }, 404);

  const rules = JSON.parse(session.rules_json) as HimmaRules;

  const result = await upsertHimmaAuditToLedger(env, {
    sessionId,
    sessionDate: session.session_date,
    studentId,
    loggedByUserId: auth.userId,
    attendance: body.attendance,
    juz_done: body.juz_done,
    hizb_done: body.hizb_done,
    alerts_count: body.alerts_count,
    errors_count: body.errors_count,
    current_hizb_failed: body.current_hizb_failed,
    delta_alert: body.delta_alert,
    delta_error: body.delta_error,
    delta_juz: body.delta_juz,
    delta_hizb: body.delta_hizb,
    rules,
  });

  return json({
    ok: true,
    failed: result.failed,
    effective_errors: result.effective_errors,
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

  const auditRows = await fetchHimmaAuditFromLedger(
    env,
    session.id,
    session.session_date,
  );
  const stats = {
    total: auditRows.length,
    present: auditRows.filter((a) => a.attendance === "present").length,
    juz_total: auditRows.reduce((s, a) => s + a.juz_done, 0),
    hizb_total: auditRows.reduce((s, a) => s + a.hizb_done, 0),
  };

  return json({
    session: {
      id: session.id,
      name_ar: session.name_ar,
      session_date: session.session_date,
      status: session.status,
    },
    stats,
  });
}
