import type { Env } from "../types";
import { FIELD_EDU_ROLES } from "../lib/roles";
import { upsertQuranLedgerRow } from "../lib/quran-ledger";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleEduSupervisorGridRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const isGrid =
    request.method === "GET" &&
    url.pathname === "/api/v1/education/supervisor/master-grid";
  const isUpsert =
    request.method === "POST" &&
    url.pathname === "/api/v1/education/supervisor/upsert-log";
  if (!isGrid && !isUpsert) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, FIELD_EDU_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  if (isGrid) {
    const date =
      url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const stageId = url.searchParams.get("stage_id");
    const circleId = url.searchParams.get("circle_id");
    let sql = `
      SELECT s.id AS student_id, s.full_name_ar, s.school_grade,
             c.id AS circle_id, c.name_ar AS circle_name,
             l.has_memorized, l.has_repeated, l.has_reviewed, l.has_linked,
             l.memorization_errors, l.memorization_warnings, l.review_errors
      FROM students s
      LEFT JOIN student_circle_history h
        ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
      LEFT JOIN circles c ON c.id = h.circle_id
      LEFT JOIN quran_daily_ledger l
        ON l.student_id = s.id AND l.mark_date = ?
       AND l.context_type = 'circle' AND l.context_id = COALESCE(h.circle_id, 0)
      WHERE s.complex_id = ? AND s.is_active = 1`;
    const binds: (string | number)[] = [date, auth.complexId];
    if (stageId) {
      sql += ` AND c.stage_id = ?`;
      binds.push(Number(stageId));
    }
    if (circleId) {
      sql += ` AND c.id = ?`;
      binds.push(Number(circleId));
    }
    sql += ` ORDER BY s.full_name_ar`;
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({ date, rows: rows.results ?? [] });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const studentId = Number(body.student_id);
  const circleId = Number(body.circle_id);
  if (!studentId || !circleId) {
    return json({ error: "student_id_and_circle_id_required" }, 400);
  }
  const markDate = String(body.mark_date ?? new Date().toISOString().slice(0, 10));

  await upsertQuranLedgerRow(env, {
    studentId,
    markDate,
    contextType: "circle",
    contextId: circleId,
    loggedByUserId: auth.userId,
    hasMemorized: Number(body.has_memorized ?? 0),
    hasRepeated: Number(body.has_repeated ?? 0),
    hasReviewed: Number(body.has_reviewed ?? 0),
    hasLinked: Number(body.has_linked ?? 0),
    memorizationErrors: Number(body.memorization_errors ?? 0),
    memorizationWarnings: Number(body.memorization_warnings ?? 0),
    reviewErrors: Number(body.review_errors ?? 0),
    notes: body.notes != null ? String(body.notes) : null,
  });

  return json({ ok: true });
}
