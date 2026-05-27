import type { Env } from "../types";
import { getAuth, requireAuth } from "../middleware/auth";
import {
  autoLinkFromMetrics,
  effectiveMatrixFlags,
  loadMatrixUserFlags,
  upsertMatrixAttendance,
} from "../lib/edu-matrix";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

type EntryContext = {
  context_type: "circle" | "track" | "competition";
  context_id: number;
  role_label: string;
};

export async function handleEduEntryRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const base = "/api/v1/education/entry";
  if (!url.pathname.startsWith(base)) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);

  const rawFlags = await loadMatrixUserFlags(env, auth.userId);
  if (!rawFlags) return json({ error: "forbidden" }, 403);
  const flags = effectiveMatrixFlags(rawFlags);

  if (request.method === "GET" && url.pathname === `${base}/my-grid`) {
    return handleMyGrid(request, env, url, auth.userId, flags);
  }

  if (request.method === "POST" && url.pathname === `${base}/upsert-log`) {
    return handleUpsertLog(request, env, auth.userId, flags);
  }

  return json({ error: "not_found" }, 404);
}

async function resolveEntryContext(
  env: Env,
  userId: number,
  flags: ReturnType<typeof effectiveMatrixFlags>,
  url: URL,
): Promise<EntryContext | Response> {
  const overrideType = url.searchParams.get("context_type");
  const overrideId = url.searchParams.get("context_id");

  if (overrideType === "competition" && overrideId) {
    const compId = Number(overrideId);
    const comp = await env.DB.prepare(
      "SELECT id FROM edu_matrix_competitions WHERE id = ? AND is_active = 1",
    )
      .bind(compId)
      .first();
    if (!comp) return json({ error: "invalid_competition" }, 400);
    return {
      context_type: "competition",
      context_id: compId,
      role_label: "منافسة",
    };
  }

  if (flags.is_teacher === 1) {
    const circle = await env.DB.prepare(
      `SELECT id, name FROM edu_matrix_circles
       WHERE teacher_id = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(userId)
      .first<{ id: number; name: string }>();
    if (!circle) {
      return json({ error: "no_circle_assigned" }, 404);
    }
    return {
      context_type: "circle",
      context_id: circle.id,
      role_label: `حلقة: ${circle.name}`,
    };
  }

  if (flags.is_track_supervisor === 1) {
    const track = await env.DB.prepare(
      `SELECT id, name FROM edu_matrix_tracks
       WHERE supervisor_id = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(userId)
      .first<{ id: number; name: string }>();
    if (!track) {
      return json({ error: "no_track_assigned" }, 404);
    }
    return {
      context_type: "track",
      context_id: track.id,
      role_label: `مسار: ${track.name}`,
    };
  }

  return json({ error: "forbidden_not_teacher_or_track_supervisor" }, 403);
}

async function handleMyGrid(
  request: Request,
  env: Env,
  url: URL,
  userId: number,
  flags: ReturnType<typeof effectiveMatrixFlags>,
): Promise<Response> {
  const ctxResult = await resolveEntryContext(env, userId, flags, url);
  if (ctxResult instanceof Response) return ctxResult;
  const ctx = ctxResult;

  const date =
    url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  let studentSql = "";
  if (ctx.context_type === "circle") {
    studentSql = "s.current_circle_id = ?";
  } else if (ctx.context_type === "track") {
    studentSql = "s.current_track_id = ?";
  } else {
    studentSql = `(
      s.current_circle_id IN (
        SELECT target_id FROM edu_matrix_competition_targets
        WHERE competition_id = ? AND target_type = 'circle'
      )
      OR s.current_track_id IN (
        SELECT target_id FROM edu_matrix_competition_targets
        WHERE competition_id = ? AND target_type = 'track'
      )
    )`;
  }

  const query =
    ctx.context_type === "competition"
      ? `SELECT
           s.id,
           s.name,
           s.national_id,
           s.stage,
           s.academic_grade,
           l.id AS log_id,
           l.has_memorized,
           l.has_repeated,
           l.has_reviewed,
           l.has_linked,
           l.memorization_errors,
           l.memorization_warnings,
           l.review_errors,
           a.status AS attendance_status
         FROM edu_matrix_students s
         LEFT JOIN edu_matrix_daily_logs l
           ON l.student_id = s.id
           AND l.date = ?
           AND l.context_type = ?
           AND l.context_id = ?
         LEFT JOIN edu_matrix_attendance a
           ON a.student_id = s.id
           AND a.date = ?
           AND a.context_type = ?
           AND a.context_id = ?
         WHERE ${studentSql} AND s.is_active = 1
         ORDER BY s.name`
      : `SELECT
           s.id,
           s.name,
           s.national_id,
           s.stage,
           s.academic_grade,
           l.id AS log_id,
           l.has_memorized,
           l.has_repeated,
           l.has_reviewed,
           l.has_linked,
           l.memorization_errors,
           l.memorization_warnings,
           l.review_errors,
           a.status AS attendance_status
         FROM edu_matrix_students s
         LEFT JOIN edu_matrix_daily_logs l
           ON l.student_id = s.id
           AND l.date = ?
           AND l.context_type = ?
           AND l.context_id = ?
         LEFT JOIN edu_matrix_attendance a
           ON a.student_id = s.id
           AND a.date = ?
           AND a.context_type = ?
           AND a.context_id = ?
         WHERE ${studentSql} AND s.is_active = 1
         ORDER BY s.name`;

  const binds =
    ctx.context_type === "competition"
      ? [
          date,
          ctx.context_type,
          ctx.context_id,
          date,
          ctx.context_type,
          ctx.context_id,
          ctx.context_id,
          ctx.context_id,
        ]
      : [
          date,
          ctx.context_type,
          ctx.context_id,
          date,
          ctx.context_type,
          ctx.context_id,
          ctx.context_id,
        ];

  const rows = await env.DB.prepare(query).bind(...binds).all<{
    id: number;
    name: string;
    national_id: string;
    stage: string;
    academic_grade: string;
    log_id: number | null;
    has_memorized: number | null;
    has_repeated: number | null;
    has_reviewed: number | null;
    has_linked: number | null;
    memorization_errors: number | null;
    memorization_warnings: number | null;
    review_errors: number | null;
    attendance_status: string | null;
  }>();

  const items = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    national_id: r.national_id,
    stage: r.stage,
    academic_grade: r.academic_grade,
    log: r.log_id
      ? {
          id: r.log_id,
          has_memorized: r.has_memorized ?? 0,
          has_repeated: r.has_repeated ?? 0,
          has_reviewed: r.has_reviewed ?? 0,
          has_linked: r.has_linked ?? 0,
          memorization_errors: r.memorization_errors ?? 0,
          memorization_warnings: r.memorization_warnings ?? 0,
          review_errors: r.review_errors ?? 0,
        }
      : null,
    attendance_status: r.attendance_status,
  }));

  return json({
    date,
    context: ctx,
    items,
    count: items.length,
  });
}

async function handleUpsertLog(
  request: Request,
  env: Env,
  userId: number,
  flags: ReturnType<typeof effectiveMatrixFlags>,
): Promise<Response> {
  let body: {
    student_id?: number;
    date?: string;
    context_type?: "circle" | "track" | "competition";
    context_id?: number;
    has_memorized?: number;
    has_repeated?: number;
    has_reviewed?: number;
    has_linked?: number;
    memorization_errors?: number;
    memorization_warnings?: number;
    review_errors?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const studentId = body.student_id;
  if (!studentId) return json({ error: "student_id_required" }, 400);

  const date = body.date ?? new Date().toISOString().slice(0, 10);

  let contextType = body.context_type;
  let contextId = body.context_id;

  if (!contextType || contextId == null) {
    const fakeUrl = new URL("http://local");
    const ctxResult = await resolveEntryContext(
      env,
      userId,
      flags,
      fakeUrl,
    );
    if (ctxResult instanceof Response) return ctxResult;
    contextType = ctxResult.context_type;
    contextId = ctxResult.context_id;
  }

  const hasMem = body.has_memorized === 1 ? 1 : 0;
  const hasRep = body.has_repeated === 1 ? 1 : 0;
  const hasRev = body.has_reviewed === 1 ? 1 : 0;
  const hasLink = autoLinkFromMetrics({
    has_memorized: hasMem,
    has_repeated: hasRep,
    has_reviewed: hasRev,
    has_linked: body.has_linked,
  });
  const memErr = Math.max(0, Number(body.memorization_errors ?? 0));
  const memWarn = Math.max(0, Number(body.memorization_warnings ?? 0));
  const revErr = Math.max(0, Number(body.review_errors ?? 0));

  await env.DB.prepare(
    `INSERT INTO edu_matrix_daily_logs (
       student_id, date, context_type, context_id, recorded_by,
       has_memorized, has_repeated, has_reviewed, has_linked,
       memorization_errors, memorization_warnings, review_errors, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(student_id, date, context_type, context_id) DO UPDATE SET
       has_memorized = excluded.has_memorized,
       has_repeated = excluded.has_repeated,
       has_reviewed = excluded.has_reviewed,
       has_linked = excluded.has_linked,
       memorization_errors = excluded.memorization_errors,
       memorization_warnings = excluded.memorization_warnings,
       review_errors = excluded.review_errors,
       recorded_by = excluded.recorded_by,
       updated_at = datetime('now')`,
  )
    .bind(
      studentId,
      date,
      contextType,
      contextId,
      userId,
      hasMem,
      hasRep,
      hasRev,
      hasLink,
      memErr,
      memWarn,
      revErr,
    )
    .run();

  const anyMetric =
    hasMem === 1 || hasRep === 1 || hasRev === 1 || hasLink === 1;
  if (anyMetric) {
    await upsertMatrixAttendance(env, {
      studentId,
      date,
      contextType,
      contextId,
      recordedBy: userId,
    });
  }

  return json({
    ok: true,
    student_id: studentId,
    date,
    context_type: contextType,
    context_id: contextId,
    attendance_auto: anyMetric ? true : false,
  });
}
