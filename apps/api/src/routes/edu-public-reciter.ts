import type { Env } from "../types";
import { liveContextType, resolveLiveSessionByToken } from "../lib/live-session";
import {
  applyReciterAttendance,
  mergeLedgerNotes,
  parseLedgerNotes,
  upsertQuranLedgerRow,
} from "../lib/quran-ledger";
import {
  createReciterToken,
  getReciterAuth,
  type ReciterAuthContext,
} from "../lib/reciter-auth";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function jwtSecret(env: Env): string {
  return env.JWT_SECRET || "dev-only-change-in-production";
}

async function loadActiveStudents(env: Env, complexId: number) {
  const rows = await env.DB.prepare(
    `SELECT id, full_name_ar, school_grade
     FROM students
     WHERE complex_id = ? AND is_active = 1
     ORDER BY full_name_ar`,
  )
    .bind(complexId)
    .all<{ id: number; full_name_ar: string; school_grade: string | null }>();
  return rows.results ?? [];
}

export async function handleValidateReciterGate(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { token?: string; pin_code?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const token = body.token?.trim() ?? "";
  const pin = body.pin_code?.trim() ?? "";
  if (!token) return json({ error: "token_required" }, 400);
  if (!pin) return json({ error: "pin_required" }, 400);

  const session = await resolveLiveSessionByToken(env, token);
  if (!session) return json({ error: "invalid_token" }, 404);
  if (session.access_pin.trim() !== pin) {
    return json({ error: "invalid_pin" }, 403);
  }

  const loggedBy = session.created_by_user_id ?? 1;
  const reciterCtx: ReciterAuthContext = {
    role: "reciter_live",
    sessionKind: session.kind,
    sessionId: session.id,
    complexId: session.complexId,
    liveToken: token,
    markDate: session.date,
    loggedByUserId: loggedBy,
  };

  const sessionJwt = await createReciterToken(reciterCtx, jwtSecret(env));
  const students = await loadActiveStudents(env, session.complexId);

  return json({
    ok: true,
    session_token: sessionJwt,
    session: {
      kind: session.kind,
      id: session.id,
      name_ar: session.name_ar,
      date: session.date,
      status: session.status,
      rules: session.rules,
      tv_key: session.tv_key,
    },
    students,
  });
}

export async function handleReciterStudentSnapshot(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = await getReciterAuth(request, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const m = url.pathname.match(
    /^\/api\/v1\/education\/public\/student-snapshot\/(\d+)$/,
  );
  if (!m) return json({ error: "not_found" }, 404);
  const studentId = Number(m[1]);
  if (!Number.isFinite(studentId)) return json({ error: "invalid_id" }, 400);

  const student = await env.DB.prepare(
    `SELECT id, full_name_ar, school_grade, memorization_amount
     FROM students
     WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(studentId, auth.complexId)
    .first<{
      id: number;
      full_name_ar: string;
      school_grade: string | null;
      memorization_amount: string | null;
    }>();

  if (!student) return json({ error: "student_not_found" }, 404);

  const cumulative = await env.DB.prepare(
    `SELECT
       COUNT(CASE WHEN has_memorized = 1 THEN 1 END) AS total_memorized_days,
       COALESCE(SUM(memorization_errors), 0) AS aggregate_errors,
       COALESCE(SUM(memorization_warnings), 0) AS aggregate_warnings
     FROM quran_daily_ledger
     WHERE student_id = ?`,
  )
    .bind(studentId)
    .first<{
      total_memorized_days: number;
      aggregate_errors: number;
      aggregate_warnings: number;
    }>();

  const plan = await env.DB.prepare(
    `SELECT daily_hifz_pages, daily_muraja_pages, daily_rabt_faces, plan_kind
     FROM student_semester_plans
     WHERE student_id = ? AND is_active = 1
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first<{
      daily_hifz_pages: number;
      daily_muraja_pages: number;
      daily_rabt_faces: number;
      plan_kind: string;
    }>();

  const contextType = liveContextType(auth.sessionKind);
  const todayRow = await env.DB.prepare(
    `SELECT has_memorized, memorization_errors, memorization_warnings, notes
     FROM quran_daily_ledger
     WHERE student_id = ? AND mark_date = ? AND context_type = ? AND context_id = ?`,
  )
    .bind(studentId, auth.markDate, contextType, auth.sessionId)
    .first<{
      has_memorized: number;
      memorization_errors: number;
      memorization_warnings: number;
      notes: string | null;
    }>();

  const target =
    auth.sessionKind === "yom_himma"
      ? await env.DB.prepare(
          `SELECT target_juz, target_hizb FROM yom_himma_targets
           WHERE session_id = ? AND student_id = ?`,
        )
          .bind(auth.sessionId, studentId)
          .first<{ target_juz: number; target_hizb: number }>()
      : await env.DB.prepare(
          `SELECT total_target_juz AS target_juz, daily_volume_juz AS target_hizb
           FROM competition_student_plans
           WHERE competition_id = ? AND student_id = ?`,
        )
          .bind(auth.sessionId, studentId)
          .first<{ target_juz: number; target_hizb: number }>();

  const meta = parseLedgerNotes(todayRow?.notes ?? null);

  return json({
    student: {
      id: student.id,
      full_name_ar: student.full_name_ar,
      school_grade: student.school_grade,
      memorization_amount: student.memorization_amount,
    },
    cumulative: {
      total_memorized_days: cumulative?.total_memorized_days ?? 0,
      aggregate_errors: cumulative?.aggregate_errors ?? 0,
      aggregate_warnings: cumulative?.aggregate_warnings ?? 0,
    },
    plan: plan ?? null,
    session_today: {
      has_memorized: todayRow?.has_memorized ?? 0,
      memorization_errors: todayRow?.memorization_errors ?? 0,
      memorization_warnings: todayRow?.memorization_warnings ?? 0,
      juz_done: meta.juz_done ?? 0,
      hizb_done: meta.hizb_done ?? 0,
      current_hizb_failed: meta.current_hizb_failed ?? 0,
    },
    target: target ?? { target_juz: 0, target_hizb: 0 },
  });
}

export async function handleReciterSubmitLog(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await getReciterAuth(request, env);
  if (!auth) return json({ error: "unauthorized" }, 401);

  let body: {
    student_id?: number;
    has_memorized?: number;
    memorization_errors?: number;
    memorization_warnings?: number;
    delta_error?: number;
    delta_warning?: number;
    juz_done?: number;
    hizb_done?: number;
    current_hizb_failed?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const studentId = Number(body.student_id);
  if (!studentId) return json({ error: "student_id_required" }, 400);

  const owned = await env.DB.prepare(
    `SELECT id FROM students WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(studentId, auth.complexId)
    .first();
  if (!owned) return json({ error: "student_not_found" }, 404);

  const contextType = liveContextType(auth.sessionKind);
  const existing = await env.DB.prepare(
    `SELECT memorization_errors, memorization_warnings, has_memorized, notes
     FROM quran_daily_ledger
     WHERE student_id = ? AND mark_date = ? AND context_type = ? AND context_id = ?`,
  )
    .bind(studentId, auth.markDate, contextType, auth.sessionId)
    .first<{
      memorization_errors: number;
      memorization_warnings: number;
      has_memorized: number;
      notes: string | null;
    }>();

  let errors = existing?.memorization_errors ?? 0;
  let warnings = existing?.memorization_warnings ?? 0;
  if (body.memorization_errors != null) errors = body.memorization_errors;
  if (body.memorization_warnings != null) warnings = body.memorization_warnings;
  if (body.delta_error) errors += body.delta_error;
  if (body.delta_warning) warnings += body.delta_warning;

  const hasMemorized =
    body.has_memorized != null ? body.has_memorized : (existing?.has_memorized ?? 0);

  const meta = parseLedgerNotes(existing?.notes ?? null);
  if (body.juz_done != null) meta.juz_done = body.juz_done;
  if (body.hizb_done != null) meta.hizb_done = body.hizb_done;
  if (body.current_hizb_failed != null) {
    meta.current_hizb_failed = body.current_hizb_failed;
  }

  if (auth.sessionKind === "yom_himma") {
    const rulesRow = await env.DB.prepare(
      `SELECT rules_json FROM yom_himma_sessions WHERE id = ?`,
    )
      .bind(auth.sessionId)
      .first<{ rules_json: string }>();
    if (rulesRow) {
      const r = JSON.parse(rulesRow.rules_json) as {
        alerts_per_error?: number;
        fail_threshold_errors?: number;
      };
      const effective =
        errors + Math.floor(warnings / Math.max(r.alerts_per_error ?? 5, 1));
      if (effective >= (r.fail_threshold_errors ?? 3)) {
        meta.current_hizb_failed = 1;
      }
    }
  }

  const notes = mergeLedgerNotes(existing?.notes ?? null, meta);

  await upsertQuranLedgerRow(env, {
    studentId,
    markDate: auth.markDate,
    contextType,
    contextId: auth.sessionId,
    loggedByUserId: auth.loggedByUserId,
    hasMemorized: hasMemorized,
    memorizationErrors: errors,
    memorizationWarnings: warnings,
    notes,
  });

  await applyReciterAttendance(
    env,
    auth.complexId,
    studentId,
    auth.markDate,
    hasMemorized,
    auth.loggedByUserId,
  );

  const session = await resolveLiveSessionByToken(env, auth.liveToken);

  return json({
    ok: true,
    failed: meta.current_hizb_failed === 1,
    tv_key: session?.tv_key ?? null,
  });
}

export async function handleEduPublicReciterRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/education/public/validate-gate"
  ) {
    return handleValidateReciterGate(request, env);
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/education/public/submit-log"
  ) {
    return handleReciterSubmitLog(request, env);
  }

  const snap = url.pathname.match(
    /^\/api\/v1\/education\/public\/student-snapshot\/(\d+)$/,
  );
  if (snap && request.method === "GET") {
    return handleReciterStudentSnapshot(request, env, url);
  }

  return null;
}
