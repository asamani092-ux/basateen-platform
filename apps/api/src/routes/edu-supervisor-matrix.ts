import type { Env } from "../types";
import { getAuth, requireAuth } from "../middleware/auth";
import {
  MATRIX_STAGE_LABELS,
  MATRIX_STAGES,
  autoLinkFromMetrics,
  loadMatrixUserFlags,
  matrixStageFilterFromScope,
  matrixSupervisorScope,
  supervisorCanAccessMatrix,
} from "../lib/edu-matrix";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const SUPERVISOR_ROLES = [
  "edu_supervisor",
  "general_manager",
  "general_supervisor",
] as const;

export async function handleEduSupervisorMatrixRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const base = "/api/v1/education/supervisor";
  if (!url.pathname.startsWith(base)) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);

  const flags = await loadMatrixUserFlags(env, auth.userId);
  const allowed =
    flags &&
    (SUPERVISOR_ROLES.includes(
      flags.role as (typeof SUPERVISOR_ROLES)[number],
    ) ||
      (await supervisorCanAccessMatrix(env, auth.userId)));

  if (!allowed) return json({ error: "forbidden" }, 403);

  if (request.method === "GET" && url.pathname === `${base}/master-grid`) {
    return handleMasterGrid(request, env, url, auth.userId);
  }

  if (request.method === "POST" && url.pathname === `${base}/transfer`) {
    return handleTransfer(request, env, auth.userId);
  }

  if (
    request.method === "POST" &&
    url.pathname === `${base}/competition-create`
  ) {
    return handleCompetitionCreate(request, env, auth.userId);
  }

  const historyMatch = url.pathname.match(
    /^\/api\/v1\/education\/supervisor\/student-history\/(\d+)$/,
  );
  if (request.method === "GET" && historyMatch) {
    return handleStudentHistory(env, Number(historyMatch[1]));
  }

  return json({ error: "not_found" }, 404);
}

async function handleMasterGrid(
  request: Request,
  env: Env,
  url: URL,
  userId: number,
): Promise<Response> {
  const scope = await matrixSupervisorScope(env, userId);
  const stageParam = url.searchParams.get("stage");
  const q = url.searchParams.get("q")?.trim();
  const { sql: stageSql, binds: stageBinds } = matrixStageFilterFromScope(
    scope,
    stageParam,
  );

  let searchSql = "";
  const binds: (string | number)[] = [...stageBinds];
  if (q) {
    searchSql =
      " AND (s.name LIKE ? OR s.national_id LIKE ? OR s.guardian_phone LIKE ?)";
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const rows = await env.DB.prepare(
    `SELECT
       s.id,
       s.name,
       s.student_phone,
       s.guardian_phone,
       s.national_id,
       s.stage,
       s.academic_grade,
       s.current_circle_id,
       s.current_track_id,
       s.is_active,
       c.name AS circle_name,
       t.name AS track_name
     FROM edu_matrix_students s
     LEFT JOIN edu_matrix_circles c ON c.id = s.current_circle_id
     LEFT JOIN edu_matrix_tracks t ON t.id = s.current_track_id
     WHERE s.is_active = 1 AND ${stageSql}${searchSql}
     ORDER BY s.name`,
  )
    .bind(...binds)
    .all<{
      id: number;
      name: string;
      student_phone: string | null;
      guardian_phone: string;
      national_id: string;
      stage: string;
      academic_grade: string;
      current_circle_id: number | null;
      current_track_id: number | null;
      is_active: number;
      circle_name: string | null;
      track_name: string | null;
    }>();

  const circles = await env.DB.prepare(
    `SELECT id, name, stage, teacher_id, is_active
     FROM edu_matrix_circles WHERE is_active = 1 ORDER BY name`,
  ).all<{
    id: number;
    name: string;
    stage: string;
    teacher_id: number;
    is_active: number;
  }>();

  const tracks = await env.DB.prepare(
    `SELECT id, name, supervisor_id, is_active
     FROM edu_matrix_tracks WHERE is_active = 1 ORDER BY name`,
  ).all<{
    id: number;
    name: string;
    supervisor_id: number;
    is_active: number;
  }>();

  const items = (rows.results ?? []).map((r) => ({
    ...r,
    stage_label:
      MATRIX_STAGE_LABELS[r.stage as keyof typeof MATRIX_STAGE_LABELS] ??
      r.stage,
    placement:
      r.current_circle_id && r.current_track_id
        ? "hybrid"
        : r.current_circle_id
          ? "circle"
          : r.current_track_id
            ? "track"
            : "unassigned",
  }));

  return json({
    items,
    count: items.length,
    stages: MATRIX_STAGES.map((s) => ({
      id: s,
      label: MATRIX_STAGE_LABELS[s],
    })),
    circles: circles.results ?? [],
    tracks: tracks.results ?? [],
  });
}

async function handleTransfer(
  request: Request,
  env: Env,
  userId: number,
): Promise<Response> {
  let body: {
    student_id?: number;
    target_circle_id?: number | null;
    target_track_id?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const studentId = body.student_id;
  if (!studentId) return json({ error: "student_id_required" }, 400);

  const student = await env.DB.prepare(
    `SELECT id, current_circle_id, current_track_id
     FROM edu_matrix_students WHERE id = ? AND is_active = 1`,
  )
    .bind(studentId)
    .first<{
      id: number;
      current_circle_id: number | null;
      current_track_id: number | null;
    }>();

  if (!student) return json({ error: "student_not_found" }, 404);

  const targetCircle =
    body.target_circle_id === undefined
      ? student.current_circle_id
      : body.target_circle_id;
  const targetTrack =
    body.target_track_id === undefined
      ? student.current_track_id
      : body.target_track_id;

  if (targetCircle != null) {
    const circle = await env.DB.prepare(
      "SELECT id FROM edu_matrix_circles WHERE id = ? AND is_active = 1",
    )
      .bind(targetCircle)
      .first();
    if (!circle) return json({ error: "invalid_circle" }, 400);
  }

  if (targetTrack != null) {
    const track = await env.DB.prepare(
      "SELECT id FROM edu_matrix_tracks WHERE id = ? AND is_active = 1",
    )
      .bind(targetTrack)
      .first();
    if (!track) return json({ error: "invalid_track" }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO edu_matrix_transfers
       (student_id, from_circle_id, to_circle_id, from_track_id, to_track_id, transferred_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      studentId,
      student.current_circle_id,
      targetCircle,
      student.current_track_id,
      targetTrack,
      userId,
    )
    .run();

  await env.DB.prepare(
    `UPDATE edu_matrix_students
     SET current_circle_id = ?, current_track_id = ?
     WHERE id = ?`,
  )
    .bind(targetCircle, targetTrack, studentId)
    .run();

  return json({
    ok: true,
    student_id: studentId,
    current_circle_id: targetCircle,
    current_track_id: targetTrack,
    message:
      "تم النقل — السجلات التاريخية في daily_logs محفوظة عبر context_type/context_id",
  });
}

async function handleCompetitionCreate(
  request: Request,
  env: Env,
  userId: number,
): Promise<Response> {
  let body: {
    name?: string;
    start_date?: string;
    end_date?: string;
    targets?: Array<{ target_type: "circle" | "track"; target_id: number }>;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.name?.trim() || !body.start_date || !body.end_date) {
    return json({ error: "name_and_dates_required" }, 400);
  }

  const insert = await env.DB.prepare(
    `INSERT INTO edu_matrix_competitions (name, start_date, end_date, is_active)
     VALUES (?, ?, ?, 1)`,
  )
    .bind(body.name.trim(), body.start_date, body.end_date)
    .run();

  const competitionId = Number(insert.meta.last_row_id);

  for (const t of body.targets ?? []) {
    if (t.target_type !== "circle" && t.target_type !== "track") continue;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO edu_matrix_competition_targets
         (competition_id, target_type, target_id)
       VALUES (?, ?, ?)`,
    )
      .bind(competitionId, t.target_type, t.target_id)
      .run();
  }

  return json({
    ok: true,
    id: competitionId,
    created_by: userId,
  });
}

async function handleStudentHistory(
  env: Env,
  studentId: number,
): Promise<Response> {
  const student = await env.DB.prepare(
    `SELECT s.id, s.name, s.current_circle_id, s.current_track_id,
            c.name AS circle_name, t.name AS track_name
     FROM edu_matrix_students s
     LEFT JOIN edu_matrix_circles c ON c.id = s.current_circle_id
     LEFT JOIN edu_matrix_tracks t ON t.id = s.current_track_id
     WHERE s.id = ?`,
  )
    .bind(studentId)
    .first<{
      id: number;
      name: string;
      current_circle_id: number | null;
      current_track_id: number | null;
      circle_name: string | null;
      track_name: string | null;
    }>();

  if (!student) return json({ error: "student_not_found" }, 404);

  const logs = await env.DB.prepare(
    `SELECT
       context_type,
       context_id,
       COUNT(*) AS log_days,
       SUM(has_memorized) AS sum_memorized,
       SUM(has_repeated) AS sum_repeated,
       SUM(has_reviewed) AS sum_reviewed,
       SUM(has_linked) AS sum_linked,
       SUM(memorization_errors) AS sum_mem_errors,
       SUM(memorization_warnings) AS sum_mem_warnings,
       SUM(review_errors) AS sum_review_errors,
       MIN(date) AS first_date,
       MAX(date) AS last_date
     FROM edu_matrix_daily_logs
     WHERE student_id = ?
     GROUP BY context_type, context_id
     ORDER BY last_date DESC`,
  )
    .bind(studentId)
    .all<{
      context_type: string;
      context_id: number;
      log_days: number;
      sum_memorized: number;
      sum_repeated: number;
      sum_reviewed: number;
      sum_linked: number;
      sum_mem_errors: number;
      sum_mem_warnings: number;
      sum_review_errors: number;
      first_date: string;
      last_date: string;
    }>();

  const contexts = await Promise.all(
    (logs.results ?? []).map(async (row) => {
      let context_name = `#${row.context_id}`;
      if (row.context_type === "circle") {
        const c = await env.DB.prepare(
          "SELECT name FROM edu_matrix_circles WHERE id = ?",
        )
          .bind(row.context_id)
          .first<{ name: string }>();
        context_name = c?.name ?? context_name;
      } else if (row.context_type === "track") {
        const t = await env.DB.prepare(
          "SELECT name FROM edu_matrix_tracks WHERE id = ?",
        )
          .bind(row.context_id)
          .first<{ name: string }>();
        context_name = t?.name ?? context_name;
      } else if (row.context_type === "competition") {
        const c = await env.DB.prepare(
          "SELECT name FROM edu_matrix_competitions WHERE id = ?",
        )
          .bind(row.context_id)
          .first<{ name: string }>();
        context_name = c?.name ?? context_name;
      }
      return { ...row, context_name };
    }),
  );

  const transfers = await env.DB.prepare(
    `SELECT id, from_circle_id, to_circle_id, from_track_id, to_track_id, transferred_at
     FROM edu_matrix_transfers
     WHERE student_id = ?
     ORDER BY transferred_at DESC`,
  )
    .bind(studentId)
    .all();

  return json({
    student,
    contexts,
    transfers: transfers.results ?? [],
  });
}
