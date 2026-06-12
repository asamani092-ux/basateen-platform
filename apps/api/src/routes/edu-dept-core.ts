import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { resolveCircleTrackId } from "../lib/circle-track";
import {
  buildStudentsInScopeWhere,
  loadUserScope,
  studentsInScopeBinds,
  teacherCanAccessStudent,
} from "../lib/dept-scope";
import { circleTrackSelectSql } from "../lib/admin-gm-schema";
import {
  createEduNotification,
  logTransferEvent,
  notifyTransferRecipients,
  resolvePlacementLabels,
  resolveTransferNotificationRecipientUserIds,
} from "../lib/edu-transfer-log";
import { fetchStudentForAdminReport } from "../lib/admin-student-report";
import { resolveMemorizationFields } from "../lib/quran-memorization";
import { resolveAttendanceTableName } from "../lib/student-attendance-db";
import {
  transferStudentCircle,
  transferStudentPlacement,
} from "../lib/edu-transfer";
import { applyStudentPlacement } from "../lib/students-admin";
import { todayLocalIso } from "../lib/local-iso-date";
import {
  queryStudentsInCircle,
  queryStudentsInTracks,
  resolveTrackSupervisorCircles,
  resolveTrackSupervisorTrackIds,
} from "../lib/student-placement";
import {
  buildTasksSnapshot,
  computeQualityForRecord,
  computeQualityFromCriteria,
  criteriaForRecord,
  legacyRowToTaskScores,
  loadEvaluationCriteria,
  parseEvaluationCriteria,
  parseTaskScoresJson,
  serializeEvaluationCriteria,
  taskScoresToLegacyColumns,
  type EvalCriterion,
  type TaskScores,
} from "../lib/evaluation-criteria";

const EDU_SETTINGS_ROLES = ["edu_supervisor", "super_admin"] as const;
const EDU_SUPERVISOR_ROLES = ["edu_supervisor", "super_admin"] as const;
const TEACHER_ONLY_ROLES = ["teacher"] as const;
const TEACHER_EDU_ROLES = ["teacher", "edu_supervisor", "super_admin"] as const;
const RECITATION_ROLES = [
  "teacher",
  "track_supervisor",
  "edu_supervisor",
  "super_admin",
  "programs_supervisor",
] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return todayLocalIso();
}

/** Academic semester start (September) for cumulative face metrics. */
function semesterStartIso(ref = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  if (m >= 9) return `${y}-09-01`;
  return `${y - 1}-09-01`;
}

function migrationRequired(): Response {
  return json({ error: "migration_required" }, 503);
}

async function studentsInCircle(
  env: Env,
  complexId: number,
  circleId: number,
): Promise<Array<{ id: number; full_name_ar: string }>> {
  return queryStudentsInCircle(env, complexId, circleId);
}

async function loadStudentTrackNames(
  env: Env,
  studentIds: number[],
): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  if (studentIds.length === 0) return out;
  if (!(await tableHasColumn(env, "students", "current_track_id"))) return out;
  if (!(await hasTable(env, "tracks"))) return out;
  const ph = studentIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT s.id, t.name_ar AS track_name
     FROM students s
     LEFT JOIN tracks t ON t.id = s.current_track_id
     WHERE s.id IN (${ph})`,
  )
    .bind(...studentIds)
    .all<{ id: number; track_name: string | null }>();
  for (const r of rows.results ?? []) {
    const name = r.track_name?.trim();
    out.set(r.id, name || null);
  }
  return out;
}

async function loadStudentCircleNames(
  env: Env,
  studentIds: number[],
): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  if (studentIds.length === 0) return out;
  if (!(await hasTable(env, "circles"))) return out;

  const hasCurrent = await tableHasColumn(env, "students", "current_circle_id");
  if (hasCurrent) {
    const ph = studentIds.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT s.id, c.name_ar AS circle_name
       FROM students s
       LEFT JOIN circles c ON c.id = s.current_circle_id
       WHERE s.id IN (${ph})`,
    )
      .bind(...studentIds)
      .all<{ id: number; circle_name: string | null }>();
    for (const r of rows.results ?? []) {
      const name = r.circle_name?.trim();
      out.set(r.id, name || null);
    }
    return out;
  }

  const circleHistCol = await historyCircleColumn(env, "h");
  if (!circleHistCol) return out;
  const active = await activePlacementSql(env, "h");
  const ph = studentIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT s.id, c.name_ar AS circle_name
     FROM students s
     INNER JOIN student_circle_history h
       ON h.student_id = s.id AND ${active}
     LEFT JOIN circles c ON c.id = ${circleHistCol}
     WHERE s.id IN (${ph})`,
  )
    .bind(...studentIds)
    .all<{ id: number; circle_name: string | null }>();
  for (const r of rows.results ?? []) {
    const name = r.circle_name?.trim();
    out.set(r.id, name || null);
  }
  return out;
}

async function loadUnreadEduNotifications(
  env: Env,
  complexId: number,
  userId: number,
): Promise<Array<Record<string, unknown>>> {
  if (!(await hasTable(env, "edu_notifications"))) return [];
  const items = await env.DB.prepare(
    `SELECT id, title_ar, body_ar, is_read, created_at
     FROM edu_notifications
     WHERE complex_id = ? AND recipient_user_id = ? AND is_read = 0
     ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(complexId, userId)
    .all();
  return (items.results ?? []) as Array<Record<string, unknown>>;
}

async function resolveTeacherPrimaryCircle(
  env: Env,
  teacherUserId: number,
  complexId: number,
): Promise<{ id: number; name_ar: string } | null> {
  const hasTeacherId = await tableHasColumn(env, "circles", "teacher_id");
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");

  if (hasTeacherId) {
    let sql = `SELECT id, name_ar FROM circles WHERE teacher_id = ? AND complex_id = ?`;
    const binds: number[] = [teacherUserId, complexId];
    if (hasIsActive) sql += ` AND is_active = 1`;
    sql += ` ORDER BY id LIMIT 1`;
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ id: number; name_ar: string }>();
    if (row) return row;
  }

  if (await hasTable(env, "teacher_assignments")) {
    let sql = `SELECT c.id, c.name_ar
       FROM teacher_assignments ta
       INNER JOIN circles c ON c.id = ta.circle_id
       WHERE ta.user_id = ? AND c.complex_id = ?`;
    const binds: number[] = [teacherUserId, complexId];
    if (hasIsActive) sql += ` AND c.is_active = 1`;
    sql += ` ORDER BY c.id LIMIT 1`;
    const row = await env.DB.prepare(sql)
      .bind(...binds)
      .first<{ id: number; name_ar: string }>();
    if (row) return row;
  }

  return null;
}

async function teacherCircleIds(
  env: Env,
  userId: number,
  complexId: number,
): Promise<number[]> {
  const primary = await resolveTeacherPrimaryCircle(env, userId, complexId);
  if (primary) return [primary.id];

  if (!(await hasTable(env, "teacher_assignments"))) return [];
  const rows = await env.DB.prepare(
    `SELECT circle_id FROM teacher_assignments WHERE user_id = ?`,
  )
    .bind(userId)
    .all<{ circle_id: number }>();
  return (rows.results ?? []).map((r) => r.circle_id);
}

const TEACHER_NO_CIRCLE_MSG = "لم يتم ربط حلقة بهذا المعلم بعد";

async function resolveRecitationCircles(
  env: Env,
  auth: { userId: number; complexId: number; role: string },
): Promise<Array<{ id: number; name_ar: string }>> {
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");

  if (auth.role === "teacher") {
    const circle = await resolveTeacherPrimaryCircle(env, auth.userId, auth.complexId);
    if (!circle) return [];
    return [circle];
  }

  if (auth.role === "track_supervisor") {
    return resolveTrackSupervisorCircles(env, auth);
  }

  if (auth.role === "programs_supervisor") {
    const scope = await loadUserScope(env, auth.userId);
    let sql = `SELECT c.id, c.name_ar FROM circles c WHERE c.complex_id = ?`;
    const binds: (string | number)[] = [auth.complexId];
    if (hasIsActive) sql += ` AND c.is_active = 1`;
    if (scope.type === "stages") {
      const ph = scope.stageIds.map(() => "?").join(",");
      sql += ` AND c.stage_id IN (${ph})`;
      binds.push(...scope.stageIds);
    }
    if (await hasTable(env, "supervisor_scopes")) {
      const scoped = await env.DB.prepare(
        `SELECT circle_id FROM supervisor_scopes WHERE user_id = ?`,
      )
        .bind(auth.userId)
        .all<{ circle_id: number }>();
      const circleIds = (scoped.results ?? []).map((r) => r.circle_id);
      if (circleIds.length > 0) {
        sql += ` AND c.id IN (${circleIds.map(() => "?").join(",")})`;
        binds.push(...circleIds);
      }
    }
    sql += ` ORDER BY c.name_ar`;
    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{ id: number; name_ar: string }>();
    return rows.results ?? [];
  }

  let sql = `SELECT id, name_ar FROM circles WHERE complex_id = ?`;
  const binds: (string | number)[] = [auth.complexId];
  if (hasIsActive) sql += ` AND is_active = 1`;
  if (auth.role === "edu_supervisor" && (await hasTable(env, "supervisor_scopes"))) {
    sql += ` AND id IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ?)`;
    binds.push(auth.userId);
  }
  sql += ` ORDER BY name_ar`;
  const rows = await env.DB.prepare(sql)
    .bind(...binds)
    .all<{ id: number; name_ar: string }>();
  return rows.results ?? [];
}

async function canAccessRecitationCircle(
  env: Env,
  auth: { userId: number; complexId: number; role: string },
  circleId: number,
): Promise<boolean> {
  const circles = await resolveRecitationCircles(env, auth);
  return circles.some((c) => c.id === circleId);
}

async function filterCirclesByTrack(
  env: Env,
  complexId: number,
  circles: Array<{ id: number; name_ar: string }>,
  trackId: number,
): Promise<Array<{ id: number; name_ar: string }>> {
  if (circles.length === 0) return circles;
  const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
  if (hasCircleTrack) {
    const ids = circles.map((c) => c.id);
    const ph = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT id FROM circles
       WHERE complex_id = ? AND track_id = ? AND id IN (${ph})`,
    )
      .bind(complexId, trackId, ...ids)
      .all<{ id: number }>();
    const allowed = new Set((rows.results ?? []).map((r) => r.id));
    return circles.filter((c) => allowed.has(c.id));
  }

  const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
  if (!hasCurrentTrack) return [];

  const ids = circles.map((c) => c.id);
  const ph = ids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.current_circle_id AS circle_id
     FROM students s
     WHERE s.complex_id = ? AND s.current_track_id = ?
       AND s.current_circle_id IN (${ph})`,
  )
    .bind(complexId, trackId, ...ids)
    .all<{ circle_id: number }>();
  const allowed = new Set((rows.results ?? []).map((r) => r.circle_id));
  return circles.filter((c) => allowed.has(c.id));
}

async function loadEduFilterScopes(
  env: Env,
  auth: { userId: number; complexId: number; role: string },
): Promise<{
  circles: Array<{ id: number; name_ar: string; track_id: number | null }>;
  tracks: Array<{ id: number; name_ar: string }>;
  assigned_track_ids?: number[];
}> {
  const circleRows = await resolveRecitationCircles(env, auth);
  const ids = circleRows.map((c) => c.id);
  const trackMap = new Map<number, number | null>();
  const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
  if (hasCircleTrack && ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT id, track_id FROM circles WHERE id IN (${ph})`,
    )
      .bind(...ids)
      .all<{ id: number; track_id: number | null }>();
    for (const r of rows.results ?? []) {
      trackMap.set(r.id, r.track_id ?? null);
    }
  }

  const circles = circleRows.map((c) => ({
    id: c.id,
    name_ar: c.name_ar,
    track_id: trackMap.get(c.id) ?? null,
  }));

  let assignedTrackIds: number[] | undefined;
  if (auth.role === "track_supervisor") {
    assignedTrackIds = await resolveTrackSupervisorTrackIds(
      env,
      auth.userId,
      auth.complexId,
    );
  }

  let tracks: Array<{ id: number; name_ar: string }> = [];
  if (await hasTable(env, "tracks")) {
    let trackSql = `SELECT id, name_ar FROM tracks
       WHERE complex_id = ? AND COALESCE(is_active, 1) = 1`;
    const trackBinds: number[] = [auth.complexId];
    if (auth.role === "track_supervisor") {
      const supervised = assignedTrackIds ?? [];
      if (supervised.length > 0) {
        trackSql += ` AND id IN (${supervised.map(() => "?").join(",")})`;
        trackBinds.push(...supervised);
      } else {
        tracks = [];
        return { circles, tracks, assigned_track_ids: [] };
      }
    }
    trackSql += ` ORDER BY name_ar`;
    const trackRows = await env.DB.prepare(trackSql)
      .bind(...trackBinds)
      .all<{ id: number; name_ar: string }>();
    tracks = trackRows.results ?? [];
  }

  return {
    circles,
    tracks,
    ...(assignedTrackIds != null ? { assigned_track_ids: assignedTrackIds } : {}),
  };
}

function attendanceCriterionId(criteria: EvalCriterion[]): string | null {
  const exact = criteria.find((c) => c.id === "attendance" || c.id === "presence");
  if (exact) return exact.id;
  const byName = criteria.find((c) => c.name.includes("حضور"));
  return byName?.id ?? null;
}

async function presentStudentIdsForDate(
  env: Env,
  complexId: number,
  date: string,
  studentIds: number[],
): Promise<Set<number>> {
  const out = new Set<number>();
  if (studentIds.length === 0) return out;
  const attTable = await resolveAttendanceTableName(env);
  if (!attTable) return out;
  const ph = studentIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT student_id FROM ${attTable}
     WHERE complex_id = ? AND attendance_date = ? AND status = 'present'
       AND student_id IN (${ph})`,
  )
    .bind(complexId, date, ...studentIds)
    .all<{ student_id: number }>();
  for (const r of rows.results ?? []) out.add(r.student_id);
  return out;
}

async function loadDailyRecitationItemsForStudents(
  env: Env,
  complexId: number,
  students: Array<{ id: number; full_name_ar: string }>,
  date: string,
  criteria: EvalCriterion[],
) {
  if (students.length === 0) return [];
  const studentIdsForPlacement = students.map((s) => s.id);
  const [trackNames, circleNames] = await Promise.all([
    loadStudentTrackNames(env, studentIdsForPlacement),
    loadStudentCircleNames(env, studentIdsForPlacement),
  ]);
  const attCriterionId = attendanceCriterionId(criteria);
  const attCriterion = criteria.find((c) => c.id === attCriterionId);
  const studentIds = students.map((s) => s.id);
  const [presentIds, hasFace, hasTaskScores] = await Promise.all([
    attCriterionId != null
      ? presentStudentIdsForDate(env, complexId, date, studentIds)
      : Promise.resolve(new Set<number>()),
    tableHasColumn(env, "edu_daily_recitation", "face_count"),
    tableHasColumn(env, "edu_daily_recitation", "task_scores_json"),
  ]);
  const extraCols = [
    hasTaskScores ? "task_scores_json" : null,
    hasFace ? "face_count" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const markCols = `student_id, listened, repeated, revised, error_count, tune_errors, notes${
    extraCols ? `, ${extraCols}` : ""
  }`;
  const ph = studentIds.map(() => "?").join(",");
  const marks = await env.DB.prepare(
    `SELECT ${markCols}
     FROM edu_daily_recitation
     WHERE recitation_date = ? AND student_id IN (${ph})`,
  )
    .bind(date, ...studentIds)
    .all<{
      student_id: number;
      listened: number;
      repeated: number;
      revised: number;
      error_count: number;
      tune_errors: number;
      notes: string | null;
      face_count?: number;
      task_scores_json?: string | null;
    }>();
  const byStudent = new Map((marks.results ?? []).map((m) => [m.student_id, m]));
  return students.map((s) => {
    const m = byStudent.get(s.id);
    const legacy = {
      listened: m?.listened,
      repeated: m?.repeated,
      revised: m?.revised,
      error_count: m?.error_count,
      tune_errors: m?.tune_errors,
      face_count: hasFace ? m?.face_count : 0,
    };
    const task_scores = parseTaskScoresJson(m?.task_scores_json, legacy);
    if (attCriterionId && presentIds.has(s.id)) {
      if (attCriterion?.input === "number") {
        task_scores[attCriterionId] = Number(attCriterion.max_weight);
      } else {
        task_scores[attCriterionId] = true;
      }
    }
    return {
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      track_name: trackNames.get(s.id) ?? null,
      circle_name: circleNames.get(s.id) ?? null,
      admin_present: presentIds.has(s.id),
      task_scores,
      listened: Boolean(m?.listened),
      repeated: Boolean(m?.repeated),
      revised: Boolean(m?.revised),
      error_count: m?.error_count ?? 0,
      tune_errors: m?.tune_errors ?? 0,
      face_count: hasFace ? Number(m?.face_count ?? 0) : 0,
      notes: m?.notes ?? "",
    };
  });
}

async function loadDailyRecitationItems(
  env: Env,
  complexId: number,
  circleId: number,
  date: string,
  criteria: EvalCriterion[],
) {
  const students = await studentsInCircle(env, complexId, circleId);
  return loadDailyRecitationItemsForStudents(
    env,
    complexId,
    students,
    date,
    criteria,
  );
}

function serverError(scope: string, err: unknown): Response {
  console.error(`[edu-dept-core] ${scope}:`, err);
  return json(
    {
      error: "api_internal_crash",
      message: err instanceof Error ? err.message : "internal_error",
    },
    500,
  );
}

export async function handleEduDeptCoreRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-dept/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return authUnauthorizedResponse(request);

  // --- Settings ---
  if (path === "/api/edu-dept/settings") {
    if (!requireRoles(auth, [...EDU_SETTINGS_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_settings"))) return migrationRequired();

    const hasRabt = await tableHasColumn(env, "edu_settings", "rabt_weight");
    const hasEvalJson = await tableHasColumn(env, "edu_settings", "evaluation_criteria_json");

    if (request.method === "GET") {
      const criteria = await loadEvaluationCriteria(env, auth.complexId);
      const row = await env.DB.prepare(
        `SELECT updated_at FROM edu_settings WHERE complex_id = ?`,
      )
        .bind(auth.complexId)
        .first<{ updated_at?: string }>();
      return json({
        settings: {
          evaluation_criteria: criteria,
          updated_at: row?.updated_at ?? null,
        },
      });
    }

    if (request.method === "PATCH") {
      let body: { evaluation_criteria?: EvalCriterion[] };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const criteria = parseEvaluationCriteria(
        JSON.stringify(body.evaluation_criteria ?? []),
      );
      if (!criteria.length) {
        return json({ error: "evaluation_criteria_required" }, 400);
      }

      const wL = criteria.find((c) => c.id === "listening")?.max_weight ?? 1;
      const wRev = criteria.find((c) => c.id === "revision")?.max_weight ?? 1;
      const wRep = criteria.find((c) => c.id === "repeat")?.max_weight ?? 1;
      const wLinking =
        criteria.find((c) => c.id === "linking")?.max_weight ??
        criteria.find((c) => c.id === "rabt")?.max_weight ??
        1;
      const pen =
        criteria.find((c) => c.id === "error")?.max_weight ??
        criteria.find((c) => c.type === "penalty")?.max_weight ??
        0.5;
      const criteriaJson = serializeEvaluationCriteria(criteria);

      if (hasEvalJson && hasRabt) {
        await env.DB.prepare(
          `INSERT INTO edu_settings (
             complex_id, weight_listening, weight_revision, weight_repeat,
             rabt_weight, penalty_per_error, evaluation_criteria_json, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(complex_id) DO UPDATE SET
             weight_listening = excluded.weight_listening,
             weight_revision = excluded.weight_revision,
             weight_repeat = excluded.weight_repeat,
             rabt_weight = excluded.rabt_weight,
             penalty_per_error = excluded.penalty_per_error,
             evaluation_criteria_json = excluded.evaluation_criteria_json,
             updated_at = datetime('now')`,
        )
          .bind(
            auth.complexId,
            wL,
            wRev,
            wRep,
            wLinking,
            pen,
            criteriaJson,
          )
          .run();
      } else if (hasEvalJson) {
        await env.DB.prepare(
          `INSERT INTO edu_settings (
             complex_id, weight_listening, weight_revision, weight_repeat,
             penalty_per_error, evaluation_criteria_json, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(complex_id) DO UPDATE SET
             weight_listening = excluded.weight_listening,
             weight_revision = excluded.weight_revision,
             weight_repeat = excluded.weight_repeat,
             penalty_per_error = excluded.penalty_per_error,
             evaluation_criteria_json = excluded.evaluation_criteria_json,
             updated_at = datetime('now')`,
        )
          .bind(auth.complexId, wL, wRev, wRep, pen, criteriaJson)
          .run();
      } else if (hasRabt) {
        await env.DB.prepare(
          `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(complex_id) DO UPDATE SET
             weight_listening = excluded.weight_listening,
             weight_revision = excluded.weight_revision,
             weight_repeat = excluded.weight_repeat,
             rabt_weight = excluded.rabt_weight,
             penalty_per_error = excluded.penalty_per_error,
             updated_at = datetime('now')`,
        )
          .bind(auth.complexId, wL, wRev, wRep, wLinking, pen)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO edu_settings (complex_id, weight_listening, weight_revision, weight_repeat, penalty_per_error, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(complex_id) DO UPDATE SET
             weight_listening = excluded.weight_listening,
             weight_revision = excluded.weight_revision,
             weight_repeat = excluded.weight_repeat,
             penalty_per_error = excluded.penalty_per_error,
             updated_at = datetime('now')`,
        )
          .bind(auth.complexId, wL, wRev, wRep, pen)
          .run();
      }
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  // --- Teacher circles ---
  if (path === "/api/edu-dept/teacher/circles" && request.method === "GET") {
    if (!requireRoles(auth, [...TEACHER_EDU_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    let circleIds: number[] = [];
    if (auth.role === "teacher") {
      circleIds = await teacherCircleIds(env, auth.userId, auth.complexId);
    } else {
      const rows = await env.DB.prepare(
        `SELECT id FROM circles WHERE complex_id = ? AND is_active = 1`,
      )
        .bind(auth.complexId)
        .all<{ id: number }>();
      circleIds = (rows.results ?? []).map((r) => r.id);
    }
    if (circleIds.length === 0) return json({ items: [] });
    const ph = circleIds.map(() => "?").join(",");
    const items = await env.DB.prepare(
      `SELECT id, name_ar FROM circles WHERE id IN (${ph}) ORDER BY name_ar`,
    )
      .bind(...circleIds)
      .all<{ id: number; name_ar: string }>();
    return json({ items: items.results ?? [] });
  }

  // --- Filter scopes (circles + tracks for edu dept UI) ---
  if (path === "/api/edu-dept/filter-scopes" && request.method === "GET") {
    if (
      !requireRoles(auth, [
        ...RECITATION_ROLES,
        ...EDU_SUPERVISOR_ROLES,
      ])
    ) {
      return json({ error: "forbidden" }, 403);
    }
    try {
      const scopes = await loadEduFilterScopes(env, auth);
      return json(scopes);
    } catch (err) {
      return serverError("filter-scopes", err);
    }
  }

  // --- Teacher bootstrap (single round-trip for hub entry) ---
  if (path === "/api/edu-dept/teacher-bootstrap" && request.method === "GET") {
    if (!requireRoles(auth, ["teacher"])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    try {
      const date = url.searchParams.get("date")?.trim() || todayIso();
      const criteriaPromise = loadEvaluationCriteria(env, auth.complexId);
      const circlePromise = resolveTeacherPrimaryCircle(
        env,
        auth.userId,
        auth.complexId,
      );

      const [teacherCircle, evaluation_criteria, notifications, items] =
        await Promise.all([
          circlePromise,
          criteriaPromise,
          loadUnreadEduNotifications(env, auth.complexId, auth.userId),
          Promise.all([circlePromise, criteriaPromise]).then(
            ([circle, criteria]) =>
              circle
                ? loadDailyRecitationItems(
                    env,
                    auth.complexId,
                    circle.id,
                    date,
                    criteria,
                  )
                : [],
          ),
        ]);

      if (!teacherCircle) {
        return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
      }

      return json({
        generated_at: new Date().toISOString(),
        date,
        teacher_circle: teacherCircle,
        circle_id: teacherCircle.id,
        circle_name: teacherCircle.name_ar,
        circles: [teacherCircle],
        needs_circle_selection: false,
        evaluation_criteria,
        items,
        notifications: { items: notifications },
      });
    } catch (err) {
      return serverError("teacher-bootstrap", err);
    }
  }

  // --- My students (auto circle for teacher; scoped circles for supervisors) ---
  if (path === "/api/edu-dept/my-students" && request.method === "GET") {
    if (!requireRoles(auth, [...RECITATION_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    try {
      const date = url.searchParams.get("date")?.trim() || todayIso();
      const circleParam = url.searchParams.get("circle_id");
      const trackParam = url.searchParams.get("track_id");
      const trackFilter =
        trackParam != null && trackParam !== "" && Number.isFinite(Number(trackParam))
          ? Number(trackParam)
          : null;

      let circleId: number;
      let circleName = "";
      let circles: Array<{ id: number; name_ar: string }> = [];

      if (auth.role === "teacher") {
        const teacherCircle = await resolveTeacherPrimaryCircle(
          env,
          auth.userId,
          auth.complexId,
        );
        if (!teacherCircle) {
          return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
        }
        circleId = teacherCircle.id;
        circleName = teacherCircle.name_ar;
        circles = [teacherCircle];
      } else if (auth.role === "track_supervisor") {
        const supervisedTrackIds = await resolveTrackSupervisorTrackIds(
          env,
          auth.userId,
          auth.complexId,
        );
        if (supervisedTrackIds.length === 0) {
          return json({ error: "no_circle_assigned" }, 404);
        }
        const activeTrackIds =
          trackFilter != null && trackFilter > 0
            ? supervisedTrackIds.includes(trackFilter)
              ? [trackFilter]
              : []
            : supervisedTrackIds;
        if (activeTrackIds.length === 0) {
          return json({ error: "forbidden" }, 403);
        }

        circles = await resolveTrackSupervisorCircles(env, auth);
        if (trackFilter != null && trackFilter > 0) {
          circles = await filterCirclesByTrack(
            env,
            auth.complexId,
            circles,
            trackFilter,
          );
        }

        let students = await queryStudentsInTracks(
          env,
          auth.complexId,
          activeTrackIds,
        );

        const requested = circleParam != null ? Number(circleParam) : NaN;
        if (Number.isFinite(requested) && requested > 0) {
          if (!(await canAccessRecitationCircle(env, auth, requested))) {
            return json({ error: "forbidden" }, 403);
          }
          circleId = requested;
          circleName = circles.find((c) => c.id === circleId)?.name_ar ?? "";
          const inCircleIds = new Set(
            (await studentsInCircle(env, auth.complexId, circleId)).map((s) => s.id),
          );
          students = students.filter((s) => inCircleIds.has(s.id));
        } else if (circles.length === 1) {
          circleId = circles[0].id;
          circleName = circles[0].name_ar;
          const inCircleIds = new Set(
            (await studentsInCircle(env, auth.complexId, circleId)).map((s) => s.id),
          );
          students = students.filter((s) => inCircleIds.has(s.id));
        } else if (circles.length > 1) {
          return json({
            date,
            circle_id: null,
            circle_name: null,
            circles,
            items: [],
            needs_circle_selection: true,
          });
        } else {
          circleId = 0;
          circleName = "";
        }

        const criteriaPromise = loadEvaluationCriteria(env, auth.complexId);
        const [evaluation_criteria, items] = await Promise.all([
          criteriaPromise,
          criteriaPromise.then((evaluation_criteria) =>
            loadDailyRecitationItemsForStudents(
              env,
              auth.complexId,
              students,
              date,
              evaluation_criteria,
            ),
          ),
        ]);

        return json({
          date,
          circle_id: circleId > 0 ? circleId : null,
          circle_name: circleName || null,
          circles,
          needs_circle_selection: false,
          evaluation_criteria,
          items,
        });
      } else {
        circles = await resolveRecitationCircles(env, auth);
        if (trackFilter != null && trackFilter > 0) {
          circles = await filterCirclesByTrack(
            env,
            auth.complexId,
            circles,
            trackFilter,
          );
        }
        if (circles.length === 0) {
          return json({ error: "no_circle_assigned" }, 404);
        }

        const requested = circleParam != null ? Number(circleParam) : NaN;
        if (Number.isFinite(requested) && requested > 0) {
          circleId = requested;
        } else if (circles.length === 1) {
          circleId = circles[0].id;
        } else {
          return json({
            date,
            circle_id: null,
            circle_name: null,
            circles,
            items: [],
            needs_circle_selection: true,
          });
        }
        if (!(await canAccessRecitationCircle(env, auth, circleId))) {
          return json({ error: "forbidden" }, 403);
        }
        circleName = circles.find((c) => c.id === circleId)?.name_ar ?? "";
      }

      const criteriaPromise = loadEvaluationCriteria(env, auth.complexId);
      const [evaluation_criteria, items] = await Promise.all([
        criteriaPromise,
        criteriaPromise.then((evaluation_criteria) =>
          loadDailyRecitationItems(
            env,
            auth.complexId,
            circleId,
            date,
            evaluation_criteria,
          ),
        ),
      ]);
      return json({
        date,
        circle_id: circleId,
        circle_name: circleName,
        circles,
        needs_circle_selection: false,
        evaluation_criteria,
        items,
      });
    } catch (err) {
      return serverError("my-students", err);
    }
  }

  // --- Daily recitation ---
  if (path === "/api/edu-dept/daily-recitation") {
    if (!requireRoles(auth, [...RECITATION_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const date = url.searchParams.get("date") ?? todayIso();
    const circleIdParam = Number(url.searchParams.get("circle_id"));

    if (request.method === "GET") {
      try {
        let circleId = circleIdParam;
        if (auth.role === "teacher") {
          const teacherCircle = await resolveTeacherPrimaryCircle(
            env,
            auth.userId,
            auth.complexId,
          );
          if (!teacherCircle) {
            return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
          }
          circleId = teacherCircle.id;
        }
        if (!Number.isFinite(circleId) || circleId <= 0) {
          return json({ error: "circle_id_required" }, 400);
        }
        if (!(await canAccessRecitationCircle(env, auth, circleId))) {
          return json({ error: "forbidden" }, 403);
        }
        const criteriaPromise = loadEvaluationCriteria(env, auth.complexId);
        const [evaluation_criteria, items] = await Promise.all([
          criteriaPromise,
          criteriaPromise.then((evaluation_criteria) =>
            loadDailyRecitationItems(
              env,
              auth.complexId,
              circleId,
              date,
              evaluation_criteria,
            ),
          ),
        ]);
        return json({ items, date, circle_id: circleId, evaluation_criteria });
      } catch (err) {
        return serverError("daily-recitation-get", err);
      }
    }

    if (request.method === "POST") {
      try {
        let body: {
          circle_id?: number;
          recitation_date?: string;
          rows?: Array<{
            student_id: number;
            task_scores?: TaskScores;
            listened?: boolean;
            repeated?: boolean;
            revised?: boolean;
            error_count?: number;
            tune_errors?: number;
            face_count?: number;
            notes?: string;
          }>;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        let cid = Number(body.circle_id);
        if (auth.role === "teacher") {
          const teacherCircle = await resolveTeacherPrimaryCircle(
            env,
            auth.userId,
            auth.complexId,
          );
          if (!teacherCircle) {
            return json({ error: TEACHER_NO_CIRCLE_MSG }, 400);
          }
          cid = teacherCircle.id;
        }
        const recDate = body.recitation_date?.trim() || todayIso();
        if (!Number.isFinite(cid) || cid <= 0) {
          return json({ error: "circle_id_required" }, 400);
        }
        if (!(await canAccessRecitationCircle(env, auth, cid))) {
          return json({ error: "forbidden" }, 403);
        }

        const rawRows = body.rows;
        if (rawRows != null && !Array.isArray(rawRows)) {
          return json({ error: "rows_must_be_array" }, 400);
        }
        const rows = Array.isArray(rawRows) ? rawRows : [];
        const students = await studentsInCircle(env, auth.complexId, cid);
        const studentIds = new Set(students.map((s) => s.id));

        const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
        const hasTaskScores = await tableHasColumn(
          env,
          "edu_daily_recitation",
          "task_scores_json",
        );
        const hasTasksSnapshot = await tableHasColumn(
          env,
          "edu_daily_recitation",
          "tasks_snapshot",
        );
        const criteria = await loadEvaluationCriteria(env, auth.complexId);
        const snapshotJson = buildTasksSnapshot(criteria);
        const stmts = rows
          .filter((r) => studentIds.has(Number(r.student_id)))
          .map((r) => {
            const taskScores: TaskScores =
              r.task_scores ??
              legacyRowToTaskScores({
                listened: r.listened,
                repeated: r.repeated,
                revised: r.revised,
                error_count: r.error_count,
                tune_errors: r.tune_errors,
                face_count: r.face_count,
              });
            const legacy = taskScoresToLegacyColumns(taskScores, criteria);
            const taskJson = JSON.stringify(taskScores);
            const notes =
              typeof r.notes === "string" ? r.notes.slice(0, 500) : null;

            if (hasTaskScores && hasFace) {
              const snapshotCol = hasTasksSnapshot ? ", tasks_snapshot" : "";
              const snapshotVal = hasTasksSnapshot ? ", ?" : "";
              const snapshotUpd = hasTasksSnapshot
                ? ", tasks_snapshot = excluded.tasks_snapshot"
                : "";
              const binds: (string | number | null)[] = [
                r.student_id,
                auth.userId,
                cid,
                recDate,
                legacy.listened,
                legacy.repeated,
                legacy.revised,
                legacy.error_count,
                legacy.tune_errors,
                legacy.face_count,
                taskJson,
                notes,
              ];
              if (hasTasksSnapshot) binds.push(snapshotJson);
              return env.DB.prepare(
                `INSERT INTO edu_daily_recitation
                  (student_id, teacher_user_id, circle_id, recitation_date,
                   listened, repeated, revised, error_count, tune_errors, face_count,
                   task_scores_json, notes${snapshotCol}, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${snapshotVal}, datetime('now'))
                 ON CONFLICT(student_id, recitation_date) DO UPDATE SET
                   teacher_user_id = excluded.teacher_user_id,
                   circle_id = excluded.circle_id,
                   listened = excluded.listened,
                   repeated = excluded.repeated,
                   revised = excluded.revised,
                   error_count = excluded.error_count,
                   tune_errors = excluded.tune_errors,
                   face_count = MAX(COALESCE(edu_daily_recitation.face_count, 0), COALESCE(excluded.face_count, 0)),
                   task_scores_json = excluded.task_scores_json,
                   notes = excluded.notes${snapshotUpd},
                   updated_at = datetime('now')`,
              ).bind(...binds);
            }
            if (hasFace) {
              const snapshotCol = hasTasksSnapshot ? ", tasks_snapshot" : "";
              const snapshotVal = hasTasksSnapshot ? ", ?" : "";
              const snapshotUpd = hasTasksSnapshot
                ? ", tasks_snapshot = excluded.tasks_snapshot"
                : "";
              const binds: (string | number | null)[] = [
                r.student_id,
                auth.userId,
                cid,
                recDate,
                legacy.listened,
                legacy.repeated,
                legacy.revised,
                legacy.error_count,
                legacy.tune_errors,
                legacy.face_count,
                notes,
              ];
              if (hasTasksSnapshot) binds.push(snapshotJson);
              return env.DB.prepare(
                `INSERT INTO edu_daily_recitation
                  (student_id, teacher_user_id, circle_id, recitation_date, listened, repeated, revised, error_count, tune_errors, face_count, notes${snapshotCol}, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${snapshotVal}, datetime('now'))
                 ON CONFLICT(student_id, recitation_date) DO UPDATE SET
                   teacher_user_id = excluded.teacher_user_id,
                   circle_id = excluded.circle_id,
                   listened = excluded.listened,
                   repeated = excluded.repeated,
                   revised = excluded.revised,
                   error_count = excluded.error_count,
                   tune_errors = excluded.tune_errors,
                   face_count = MAX(COALESCE(edu_daily_recitation.face_count, 0), COALESCE(excluded.face_count, 0)),
                   notes = excluded.notes${snapshotUpd},
                   updated_at = datetime('now')`,
              ).bind(...binds);
            }
            const snapshotCol = hasTasksSnapshot ? ", tasks_snapshot" : "";
            const snapshotVal = hasTasksSnapshot ? ", ?" : "";
            const snapshotUpd = hasTasksSnapshot
              ? ", tasks_snapshot = excluded.tasks_snapshot"
              : "";
            const binds: (string | number | null)[] = [
              r.student_id,
              auth.userId,
              cid,
              recDate,
              legacy.listened,
              legacy.repeated,
              legacy.revised,
              legacy.error_count,
              legacy.tune_errors,
              notes,
            ];
            if (hasTasksSnapshot) binds.push(snapshotJson);
            return env.DB.prepare(
              `INSERT INTO edu_daily_recitation
                (student_id, teacher_user_id, circle_id, recitation_date, listened, repeated, revised, error_count, tune_errors, notes${snapshotCol}, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${snapshotVal}, datetime('now'))
               ON CONFLICT(student_id, recitation_date) DO UPDATE SET
                 teacher_user_id = excluded.teacher_user_id,
                 circle_id = excluded.circle_id,
                 listened = excluded.listened,
                 repeated = excluded.repeated,
                 revised = excluded.revised,
                 error_count = excluded.error_count,
                 tune_errors = excluded.tune_errors,
                 notes = excluded.notes${snapshotUpd},
                 updated_at = datetime('now')`,
            ).bind(...binds);
          });

        if (stmts.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < stmts.length; i += chunkSize) {
            await env.DB.batch(stmts.slice(i, i + chunkSize));
          }
        }
        return json({ ok: true, saved: stmts.length, circle_id: cid });
      } catch (err) {
        return serverError("daily-recitation-post", err);
      }
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  // --- Teacher requests ---
  if (!(await hasTable(env, "teacher_requests"))) {
    if (path.startsWith("/api/edu-dept/teacher-requests")) {
      return migrationRequired();
    }
  }

  if (path === "/api/edu-dept/teacher-requests" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    const status = url.searchParams.get("status") ?? "pending";
    const requestType = url.searchParams.get("request_type");
    let sql = `SELECT tr.id, tr.student_id, tr.teacher_user_id, tr.request_type, tr.status, tr.notes,
                      tr.target_circle_id, tr.created_at,
                      s.full_name_ar AS student_name,
                      u.full_name_ar AS teacher_name,
                      c.name_ar AS target_circle_name
               FROM teacher_requests tr
               JOIN students s ON s.id = tr.student_id
               JOIN users u ON u.id = tr.teacher_user_id
               LEFT JOIN circles c ON c.id = tr.target_circle_id
               WHERE tr.complex_id = ? AND tr.status = ?`;
    const binds: (string | number)[] = [auth.complexId, status];
    if (requestType === "transfer" || requestType === "escalation") {
      sql += ` AND tr.request_type = ?`;
      binds.push(requestType);
    }
    sql += ` ORDER BY tr.created_at DESC LIMIT 200`;
    const items = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: items.results ?? [] });
  }

  if (path === "/api/edu-dept/teacher-requests" && request.method === "POST") {
    if (!requireRoles(auth, ["teacher", "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }
    let body: {
      student_id?: number;
      request_type?: string;
      notes?: string;
      target_circle_id?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const studentId = Number(body.student_id);
    const requestType = body.request_type;
    if (
      !Number.isFinite(studentId) ||
      (requestType !== "transfer" && requestType !== "escalation")
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      !(await teacherCanAccessStudent(env, auth.userId, studentId, {
        complexId: auth.complexId,
      }))
    ) {
      return json({ error: "forbidden_student" }, 403);
    }
    const notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;
    const targetCircleId =
      body.target_circle_id != null ? Number(body.target_circle_id) : null;
    const res = await env.DB.prepare(
      `INSERT INTO teacher_requests
        (complex_id, student_id, teacher_user_id, request_type, status, notes, target_circle_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        auth.complexId,
        studentId,
        auth.userId,
        requestType,
        notes,
        Number.isFinite(targetCircleId) ? targetCircleId : null,
      )
      .run();
    return json({ ok: true, id: res.meta.last_row_id });
  }

  const reqMatch = path.match(/^\/api\/edu-dept\/teacher-requests\/(\d+)$/);
  if (reqMatch && request.method === "PATCH") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    const id = Number(reqMatch[1]);
    let body: {
      status?: string;
      target_circle_id?: number;
      target_track_id?: number;
      placement_type?: "circle" | "track";
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (body.status !== "approved" && body.status !== "rejected") {
      return json({ error: "invalid_status" }, 400);
    }
    const row = await env.DB.prepare(
      `SELECT tr.*, s.full_name_ar AS student_name, s.current_circle_id, s.current_track_id
       FROM teacher_requests tr
       JOIN students s ON s.id = tr.student_id
       WHERE tr.id = ? AND tr.complex_id = ?`,
    )
      .bind(id, auth.complexId)
      .first<{
        id: number;
        student_id: number;
        teacher_user_id: number;
        request_type: string;
        status: string;
        target_circle_id: number | null;
        notes: string | null;
        student_name: string;
        current_circle_id: number | null;
        current_track_id: number | null;
      }>();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "pending") return json({ error: "already_resolved" }, 409);

    if (body.status === "approved" && row.request_type === "transfer") {
      if (body.placement_type === "track") {
        const trackId = Number(body.target_track_id);
        if (!Number.isFinite(trackId) || trackId <= 0) {
          return json({ error: "target_track_required" }, 400);
        }
        if (!(await hasTable(env, "tracks"))) {
          return json({ error: "track_not_found" }, 404);
        }
        const targetTrack = await env.DB.prepare(
          `SELECT id, name_ar FROM tracks
           WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1`,
        )
          .bind(trackId, auth.complexId)
          .first<{ id: number; name_ar: string }>();
        if (!targetTrack) return json({ error: "track_not_found" }, 404);
        const reqOldLabels = await resolvePlacementLabels(
          env,
          row.current_circle_id,
          row.current_track_id,
        );
        try {
          await applyStudentPlacement(
            env,
            row.student_id,
            { kind: "track", id: trackId },
            row.notes ?? "موافقة على طلب نقل — مسار",
          );
          const eventId = await logTransferEvent(env, {
            complexId: auth.complexId,
            studentId: row.student_id,
            studentName: row.student_name,
            status: "success",
            source: "teacher_request",
            teacherRequestId: row.id,
            oldCircleId: row.current_circle_id,
            newCircleId: null,
            oldTrackId: row.current_track_id,
            newTrackId: trackId,
            oldCircleName: reqOldLabels.circle_name,
            newCircleName: null,
            newTrackName: targetTrack.name_ar,
            reason: row.notes,
            initiatedByUserId: row.teacher_user_id,
            resolvedByUserId: auth.userId,
          });
          await notifyTransferRecipients(env, {
            complexId: auth.complexId,
            studentName: row.student_name,
            newCircleName: targetTrack.name_ar,
            newTrackName: targetTrack.name_ar,
            recipientUserIds: await resolveTransferNotificationRecipientUserIds(
              env,
              {
                oldCircleId: row.current_circle_id,
                newCircleId: null,
                oldTrackId: row.current_track_id,
                newTrackId: trackId,
              },
            ),
            referenceId: eventId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("teacher_request_track_transfer_failed", err);
          await logTransferEvent(env, {
            complexId: auth.complexId,
            studentId: row.student_id,
            studentName: row.student_name,
            status: "failed",
            source: "teacher_request",
            teacherRequestId: row.id,
            oldCircleId: row.current_circle_id,
            oldTrackId: row.current_track_id,
            newTrackId: trackId,
            reason: row.notes,
            errorCode: "transfer_failed",
            errorMessage: msg,
            initiatedByUserId: row.teacher_user_id,
            resolvedByUserId: auth.userId,
          });
          return json({ error: "transfer_failed", message: msg }, 500);
        }
      } else {
      const newCircleId = Number(body.target_circle_id ?? row.target_circle_id);
      if (!Number.isFinite(newCircleId) || newCircleId <= 0) {
        return json({ error: "target_circle_required" }, 400);
      }
      const newCircle = await env.DB.prepare(
        `SELECT c.id, c.name_ar, t.name_ar AS track_name
         FROM circles c
         LEFT JOIN tracks t ON t.id = c.track_id
         WHERE c.id = ? AND c.complex_id = ? AND c.is_active = 1`,
      )
        .bind(newCircleId, auth.complexId)
        .first<{ id: number; name_ar: string; track_name: string | null }>();
      if (!newCircle) return json({ error: "circle_not_found" }, 404);
      const trackId = await resolveCircleTrackId(
        env,
        newCircleId,
        auth.complexId,
      );
      const reqOldLabels = await resolvePlacementLabels(
        env,
        row.current_circle_id,
        row.current_track_id,
      );
      const reqNewLabels = await resolvePlacementLabels(env, newCircleId, trackId);
      try {
        await transferStudentCircle(env, {
          studentId: row.student_id,
          newCircleId,
          newTrackId: trackId,
          movedByUserId: auth.userId,
          reason: row.notes ?? "موافقة على طلب نقل — القسم التعليمي",
          complexId: auth.complexId,
        });
        const eventId = await logTransferEvent(env, {
          complexId: auth.complexId,
          studentId: row.student_id,
          studentName: row.student_name,
          status: "success",
          source: "teacher_request",
          teacherRequestId: row.id,
          oldCircleId: row.current_circle_id,
          newCircleId,
          oldTrackId: row.current_track_id,
          newTrackId: trackId,
          oldCircleName: reqOldLabels.circle_name,
          newCircleName: reqNewLabels.circle_name ?? newCircle.name_ar,
          newTrackName: reqNewLabels.track_name ?? newCircle.track_name,
          reason: row.notes,
          initiatedByUserId: row.teacher_user_id,
          resolvedByUserId: auth.userId,
        });
          await notifyTransferRecipients(env, {
            complexId: auth.complexId,
            studentName: row.student_name,
            newCircleName: newCircle.name_ar,
            newTrackName: newCircle.track_name,
            recipientUserIds: await resolveTransferNotificationRecipientUserIds(
              env,
              {
                oldCircleId: row.current_circle_id,
                newCircleId,
                oldTrackId: row.current_track_id,
                newTrackId: trackId,
              },
            ),
            referenceId: eventId,
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("teacher_request_transfer_failed", err);
        await logTransferEvent(env, {
          complexId: auth.complexId,
          studentId: row.student_id,
          studentName: row.student_name,
          status: "failed",
          source: "teacher_request",
          teacherRequestId: row.id,
          oldCircleId: row.current_circle_id,
          newCircleId,
          reason: row.notes,
          errorCode: "transfer_failed",
          errorMessage: msg,
          initiatedByUserId: row.teacher_user_id,
          resolvedByUserId: auth.userId,
        });
        return json({ error: "transfer_failed", message: msg }, 500);
      }
      }
    }

    await env.DB.prepare(
      `UPDATE teacher_requests
       SET status = ?, resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`,
    )
      .bind(body.status, auth.userId, id)
      .run();

    if (body.status === "rejected" && row.request_type === "transfer") {
      await createEduNotification(env, {
        complexId: auth.complexId,
        recipientUserId: row.teacher_user_id,
        titleAr: "رفض طلب نقل",
        bodyAr: `تم رفض طلب نقل الطالب (${row.student_name}).`,
        referenceId: row.id,
      });
    }

    return json({ ok: true, status: body.status });
  }

  // --- Manual transfer ---
  if (path === "/api/edu-dept/transfers/manual" && request.method === "POST") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    let body: {
      student_id?: number;
      circle_id?: number;
      track_id?: number | null;
      placement_type?: "circle" | "track";
      note?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const studentId = Number(body.student_id);
    if (!Number.isFinite(studentId)) {
      return json({ error: "student_id_required" }, 400);
    }
    const placementType =
      body.placement_type === "track" ? "track" : "circle";
    const scope = await loadUserScope(env, auth.userId);
    const scopeWhere = await buildStudentsInScopeWhere(env, scope);
    const allowed = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ?`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope), studentId)
      .first();
    if (!allowed) return json({ error: "student_out_of_scope" }, 403);

    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!note) return json({ error: "reason_required" }, 400);

    const current = await env.DB.prepare(
      `SELECT full_name_ar, current_circle_id, current_track_id FROM students WHERE id = ?`,
    )
      .bind(studentId)
      .first<{
        full_name_ar: string;
        current_circle_id: number | null;
        current_track_id: number | null;
      }>();

    if (placementType === "track") {
      const trackId = Number(body.track_id);
      if (!Number.isFinite(trackId) || trackId <= 0) {
        return json({ error: "track_id_required" }, 400);
      }
      if (!(await hasTable(env, "tracks"))) {
        return json({ error: "track_not_found" }, 404);
      }
      const targetTrack = await env.DB.prepare(
        `SELECT id, name_ar FROM tracks
         WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1`,
      )
        .bind(trackId, auth.complexId)
        .first<{ id: number; name_ar: string }>();
      if (!targetTrack) return json({ error: "track_not_found" }, 404);

      if (
        current?.current_track_id === trackId &&
        (current?.current_circle_id == null || current.current_circle_id === 0)
      ) {
        return json({ error: "already_in_track" }, 409);
      }

      const oldLabels = await resolvePlacementLabels(
        env,
        current?.current_circle_id,
        current?.current_track_id,
      );

      try {
        await applyStudentPlacement(
          env,
          studentId,
          { kind: "track", id: trackId },
          note,
        );
        const eventId = await logTransferEvent(env, {
          complexId: auth.complexId,
          studentId,
          studentName: current?.full_name_ar,
          status: "success",
          source: "manual",
          oldCircleId: current?.current_circle_id,
          newCircleId: null,
          oldTrackId: current?.current_track_id,
          newTrackId: trackId,
          oldCircleName: oldLabels.circle_name,
          newCircleName: null,
          newTrackName: targetTrack.name_ar,
          reason: note,
          resolvedByUserId: auth.userId,
        });
        const hasSupervisor = await tableHasColumn(env, "tracks", "supervisor_id");
        let supervisorUserId: number | null = null;
        if (hasSupervisor) {
          const sup = await env.DB.prepare(
            `SELECT supervisor_id FROM tracks WHERE id = ?`,
          )
            .bind(trackId)
            .first<{ supervisor_id: number | null }>();
          supervisorUserId = sup?.supervisor_id ?? null;
        }
        await notifyTransferRecipients(env, {
          complexId: auth.complexId,
          studentName: current?.full_name_ar ?? "طالب",
          newCircleName: targetTrack.name_ar,
          newTrackName: targetTrack.name_ar,
          recipientUserIds: await resolveTransferNotificationRecipientUserIds(
            env,
            {
              oldCircleId: current?.current_circle_id,
              newCircleId: null,
              oldTrackId: current?.current_track_id,
              newTrackId: trackId,
            },
          ),
          referenceId: eventId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("manual_transfer_track_failed", err);
        await logTransferEvent(env, {
          complexId: auth.complexId,
          studentId,
          studentName: current?.full_name_ar,
          status: "failed",
          source: "manual",
          oldCircleId: current?.current_circle_id,
          oldTrackId: current?.current_track_id,
          newTrackId: trackId,
          reason: note,
          errorCode: "transfer_failed",
          errorMessage: msg,
          resolvedByUserId: auth.userId,
        });
        return json({ error: "transfer_failed", message: msg }, 500);
      }
      return json({ ok: true });
    }

    const circleId = Number(body.circle_id);
    if (!Number.isFinite(circleId)) {
      return json({ error: "student_id_and_circle_id_required" }, 400);
    }

    const circleExists = await env.DB.prepare(
      `SELECT id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, auth.complexId)
      .first<{ id: number }>();
    if (!circleExists) return json({ error: "circle_not_found" }, 404);

    const explicitTrack =
      body.track_id != null ? Number(body.track_id) : null;
    const trackId = await resolveCircleTrackId(
      env,
      circleId,
      auth.complexId,
      explicitTrack,
    );

    const newCircle = await env.DB.prepare(
      `SELECT c.name_ar, t.name_ar AS track_name FROM circles c
       LEFT JOIN tracks t ON t.id = c.track_id WHERE c.id = ?`,
    )
      .bind(circleId)
      .first<{ name_ar: string; track_name: string | null }>();

    const trackOnly =
      current?.current_circle_id === circleId &&
      explicitTrack != null &&
      explicitTrack !== current?.current_track_id;

    const oldLabels = await resolvePlacementLabels(
      env,
      current?.current_circle_id,
      current?.current_track_id,
    );
    const newLabels = await resolvePlacementLabels(env, circleId, trackId);

    try {
      await transferStudentPlacement(env, {
        studentId,
        newCircleId: circleId,
        newTrackId: trackId,
        movedByUserId: auth.userId,
        reason: note,
        complexId: auth.complexId,
        trackOnly,
      });
      const eventId = await logTransferEvent(env, {
        complexId: auth.complexId,
        studentId,
        studentName: current?.full_name_ar,
        status: "success",
        source: "manual",
        oldCircleId: current?.current_circle_id,
        newCircleId: circleId,
        oldTrackId: current?.current_track_id,
        newTrackId: trackId,
        oldCircleName: oldLabels.circle_name,
        newCircleName: newLabels.circle_name ?? newCircle?.name_ar,
        newTrackName: newLabels.track_name ?? newCircle?.track_name,
        reason: note,
        resolvedByUserId: auth.userId,
      });
      await notifyTransferRecipients(env, {
        complexId: auth.complexId,
        studentName: current?.full_name_ar ?? "طالب",
        newCircleName: newCircle?.name_ar ?? "—",
        newTrackName: newCircle?.track_name,
        recipientUserIds: await resolveTransferNotificationRecipientUserIds(env, {
          oldCircleId: current?.current_circle_id,
          newCircleId: circleId,
          oldTrackId: current?.current_track_id,
          newTrackId: trackId,
        }),
        referenceId: eventId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("manual_transfer_failed", err);
      await logTransferEvent(env, {
        complexId: auth.complexId,
        studentId,
        studentName: current?.full_name_ar,
        status: "failed",
        source: "manual",
        oldCircleId: current?.current_circle_id,
        newCircleId: circleId,
        reason: note,
        errorCode: "transfer_failed",
        errorMessage: msg,
        resolvedByUserId: auth.userId,
      });
      return json({ error: "transfer_failed", message: msg }, 500);
    }
    return json({ ok: true });
  }

  // --- Progress reports (supervisors) ---
  if (path === "/api/edu-dept/reports/progress" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const today = todayIso();
    const dateFromParam = url.searchParams.get("date_from")?.trim();
    const dateToParam = url.searchParams.get("date_to")?.trim();
    const dateFrom = dateFromParam || today;
    const dateTo = dateToParam || dateFrom;
    if (dateFrom > dateTo) {
      return json({ error: "invalid_date_range", date_from: dateFrom, date_to: dateTo }, 400);
    }
    const circleIdParam = url.searchParams.get("circle_id");
    const trackIdParam = url.searchParams.get("track_id");
    const circleFilter =
      circleIdParam != null && circleIdParam !== ""
        ? Number(circleIdParam)
        : null;
    const trackFilter =
      trackIdParam != null && trackIdParam !== ""
        ? Number(trackIdParam)
        : null;
    if (
      (circleFilter == null || !Number.isFinite(circleFilter) || circleFilter <= 0) &&
      (trackFilter == null || !Number.isFinite(trackFilter) || trackFilter <= 0)
    ) {
      return json({ error: "circle_or_track_required" }, 400);
    }

    const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
    const hasTaskScores = await tableHasColumn(
      env,
      "edu_daily_recitation",
      "task_scores_json",
    );
    const hasTasksSnapshot = await tableHasColumn(
      env,
      "edu_daily_recitation",
      "tasks_snapshot",
    );
    const evaluation_criteria = await loadEvaluationCriteria(env, auth.complexId);

    const extraCols = [
      hasTaskScores ? "dr.task_scores_json" : null,
      hasTasksSnapshot ? "dr.tasks_snapshot" : null,
      hasFace ? "dr.face_count" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const selectCols = `dr.student_id, dr.listened, dr.repeated, dr.revised,
         dr.error_count, dr.tune_errors, dr.circle_id, dr.recitation_date,
         s.full_name_ar, c.name_ar AS circle_name${extraCols ? `, ${extraCols}` : ""}`;

    let sql = `
      SELECT ${selectCols}
      FROM edu_daily_recitation dr
      INNER JOIN students s ON s.id = dr.student_id AND s.complex_id = ?
      LEFT JOIN circles c ON c.id = dr.circle_id
      WHERE dr.recitation_date >= ? AND dr.recitation_date <= ?`;
    const binds: (string | number)[] = [auth.complexId, dateFrom, dateTo];
    const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
    if (circleFilter != null && Number.isFinite(circleFilter) && circleFilter > 0) {
      sql += ` AND dr.circle_id = ?`;
      binds.push(circleFilter);
    } else if (
      trackFilter != null &&
      Number.isFinite(trackFilter) &&
      trackFilter > 0 &&
      hasCircleTrack
    ) {
      sql += ` AND c.track_id = ?`;
      binds.push(trackFilter);
    }
    sql += ` ORDER BY s.full_name_ar, dr.recitation_date`;

    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{
        student_id: number;
        listened: number;
        repeated: number;
        revised: number;
        error_count: number;
        tune_errors: number;
        face_count?: number;
        task_scores_json?: string | null;
        tasks_snapshot?: string | null;
        circle_id: number;
        recitation_date: string;
        full_name_ar: string;
        circle_name: string | null;
      }>();

    type StudentAgg = {
      student_id: number;
      full_name_ar: string;
      circle_id: number;
      circle_name: string;
      qualitySum: number;
      qualityCount: number;
      error_count: number;
      face_count: number;
      listened: boolean;
      repeated: boolean;
      revised: boolean;
    };

    type CircleAgg = { sum: number; count: number; name: string };
    const studentMap = new Map<number, StudentAgg>();
    const circleMap = new Map<number, CircleAgg>();
    let qualitySum = 0;
    let activeCount = 0;
    let rowCount = 0;

    for (const r of rows.results ?? []) {
      const taskScores = parseTaskScoresJson(r.task_scores_json, {
        listened: r.listened,
        repeated: r.repeated,
        revised: r.revised,
        error_count: r.error_count,
        tune_errors: r.tune_errors,
        face_count: hasFace ? r.face_count : 0,
      });
      const rowCriteria = criteriaForRecord(
        hasTasksSnapshot ? r.tasks_snapshot : null,
        evaluation_criteria,
      );
      const quality_pct = computeQualityForRecord(
        taskScores,
        hasTasksSnapshot ? r.tasks_snapshot : null,
        evaluation_criteria,
      );
      const listened = Boolean(r.listened);
      const repeated = Boolean(r.repeated);
      const revised = Boolean(r.revised);
      const faces = hasFace ? Number(r.face_count ?? 0) : 0;
      const hasActivity = rowCriteria.some((c) => {
        if (c.type !== "points" || c.requires_all?.length) return false;
        const v = taskScores[c.id];
        return c.input === "number" ? Number(v ?? 0) > 0 : Boolean(v);
      });

      if (hasActivity || listened || repeated || revised) activeCount += 1;
      qualitySum += quality_pct;
      rowCount += 1;

      const cid = r.circle_id;
      const cname = r.circle_name ?? "—";
      const prevCircle = circleMap.get(cid) ?? { sum: 0, count: 0, name: cname };
      prevCircle.sum += quality_pct;
      prevCircle.count += 1;
      prevCircle.name = cname;
      circleMap.set(cid, prevCircle);

      const prev = studentMap.get(r.student_id) ?? {
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        circle_id: r.circle_id,
        circle_name: cname,
        qualitySum: 0,
        qualityCount: 0,
        error_count: 0,
        face_count: 0,
        listened: false,
        repeated: false,
        revised: false,
      };
      prev.qualitySum += quality_pct;
      prev.qualityCount += 1;
      prev.error_count += Number(r.error_count);
      prev.face_count += faces;
      prev.listened = prev.listened || listened;
      prev.repeated = prev.repeated || repeated;
      prev.revised = prev.revised || revised;
      prev.circle_name = cname;
      studentMap.set(r.student_id, prev);
    }

    const items = [...studentMap.values()]
      .map((s) => ({
        student_id: s.student_id,
        full_name_ar: s.full_name_ar,
        circle_id: s.circle_id,
        circle_name: s.circle_name,
        quality_pct:
          s.qualityCount > 0
            ? Math.round((s.qualitySum / s.qualityCount) * 10) / 10
            : 0,
        listened: s.listened,
        repeated: s.repeated,
        revised: s.revised,
        error_count: s.error_count,
        face_count: s.face_count,
      }))
      .sort((a, b) => a.full_name_ar.localeCompare(b.full_name_ar, "ar"));

    const avgQuality =
      rowCount > 0 ? Math.round((qualitySum / rowCount) * 10) / 10 : 0;

    let topCircle: { circle_id: number; circle_name: string; avg_quality: number } | null =
      null;
    for (const [cid, agg] of circleMap) {
      if (agg.count === 0) continue;
      const avg = agg.sum / agg.count;
      if (!topCircle || avg > topCircle.avg_quality) {
        topCircle = {
          circle_id: cid,
          circle_name: agg.name,
          avg_quality: Math.round(avg * 10) / 10,
        };
      }
    }

    let facesInRangeSql = `
      SELECT COALESCE(SUM(dr.face_count), 0) AS total
      FROM edu_daily_recitation dr
      INNER JOIN students s ON s.id = dr.student_id AND s.complex_id = ?
      WHERE dr.recitation_date >= ? AND dr.recitation_date <= ?`;
    const facesInRangeBinds: (string | number)[] = [
      auth.complexId,
      dateFrom,
      dateTo,
    ];
    if (circleFilter != null && Number.isFinite(circleFilter) && circleFilter > 0) {
      facesInRangeSql += ` AND dr.circle_id = ?`;
      facesInRangeBinds.push(circleFilter);
    } else if (
      trackFilter != null &&
      Number.isFinite(trackFilter) &&
      trackFilter > 0 &&
      hasCircleTrack
    ) {
      facesInRangeSql += ` AND dr.circle_id IN (
        SELECT id FROM circles WHERE complex_id = ? AND track_id = ?
      )`;
      facesInRangeBinds.push(auth.complexId, trackFilter);
    }

    let totalFacesInRange = 0;
    if (hasFace) {
      const rangeRow = await env.DB.prepare(facesInRangeSql)
        .bind(...facesInRangeBinds)
        .first<{ total: number }>();
      totalFacesInRange = Number(rangeRow?.total ?? 0);
    }

    const circles = await env.DB.prepare(
      `SELECT id, name_ar FROM circles WHERE complex_id = ? AND is_active = 1 ORDER BY name_ar`,
    )
      .bind(auth.complexId)
      .all<{ id: number; name_ar: string }>();

    let tracks: Array<{ id: number; name_ar: string }> = [];
    if (await hasTable(env, "tracks")) {
      const trackRows = await env.DB.prepare(
        `SELECT id, name_ar FROM tracks WHERE complex_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY name_ar`,
      )
        .bind(auth.complexId)
        .all<{ id: number; name_ar: string }>();
      tracks = trackRows.results ?? [];
    }

    return json({
      date: dateTo,
      date_from: dateFrom,
      date_to: dateTo,
      scope_type: circleFilter ? "circle" : "track",
      scope_id: circleFilter ?? trackFilter,
      summary: {
        avg_quality: avgQuality,
        top_circle: topCircle,
        active_students: activeCount,
        total_records: rowCount,
        total_faces_in_range: totalFacesInRange,
        faces_today: totalFacesInRange,
        total_faces_semester: totalFacesInRange,
      },
      circles: circles.results ?? [],
      tracks,
      items,
    });
  }

  if (path === "/api/edu-dept/placement-options" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    type PlacementRow = {
      id: number;
      entity_type: "circle" | "track";
      name_ar: string;
      track_id: number | null;
      track_name: string | null;
      teacher_name: string | null;
    };
    const q = url.searchParams.get("q")?.trim() ?? "";
    const trackIdParam = url.searchParams.get("track_id");
    const trackFilter =
      trackIdParam != null && trackIdParam !== "" && Number.isFinite(Number(trackIdParam))
        ? Number(trackIdParam)
        : null;
    const items: PlacementRow[] = [];

    if (await hasTable(env, "circles")) {
      const track = await circleTrackSelectSql(env);
      const hasTeacher = await tableHasColumn(env, "circles", "teacher_id");
      const teacherJoin = hasTeacher
        ? "LEFT JOIN users u ON u.id = c.teacher_id"
        : "";
      const teacherCol = hasTeacher
        ? ", u.full_name_ar AS teacher_name"
        : ", NULL AS teacher_name";
      let sql = `
        SELECT c.id, c.name_ar, ${track.trackIdCol}, ${track.trackNameCol}${teacherCol}
        FROM circles c
        ${track.joinSql}
        ${teacherJoin}
        WHERE c.complex_id = ? AND COALESCE(c.is_active, 1) = 1`;
      const binds: (string | number)[] = [auth.complexId];
      if (trackFilter != null && trackFilter > 0) {
        if (await tableHasColumn(env, "circles", "track_id")) {
          sql += ` AND c.track_id = ?`;
          binds.push(trackFilter);
        }
      }
      const trackNameFilter = track.joinSql ? "t.name_ar" : "NULL";
      if (q) {
        if (hasTeacher) {
          sql += ` AND (c.name_ar LIKE ? OR ${trackNameFilter} LIKE ? OR u.full_name_ar LIKE ?)`;
          binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
        } else {
          sql += ` AND (c.name_ar LIKE ? OR ${trackNameFilter} LIKE ?)`;
          binds.push(`%${q}%`, `%${q}%`);
        }
      }
      sql += ` ORDER BY c.name_ar LIMIT 300`;
      const circles = await env.DB.prepare(sql)
        .bind(...binds)
        .all<{
          id: number;
          name_ar: string;
          track_id?: number | null;
          track_name?: string | null;
          teacher_name?: string | null;
        }>();
      for (const c of circles.results ?? []) {
        items.push({
          id: c.id,
          entity_type: "circle",
          name_ar: c.name_ar,
          track_id: c.track_id ?? null,
          track_name: c.track_name ?? null,
          teacher_name: c.teacher_name ?? null,
        });
      }
    }

    if (await hasTable(env, "tracks")) {
      const hasSupervisor = await tableHasColumn(env, "tracks", "supervisor_id");
      const supervisorJoin = hasSupervisor
        ? "LEFT JOIN users u ON u.id = t.supervisor_id"
        : "";
      const supervisorCol = hasSupervisor
        ? ", u.full_name_ar AS teacher_name"
        : ", NULL AS teacher_name";
      let trackSql = `
        SELECT t.id, t.name_ar${supervisorCol}
        FROM tracks t
        ${supervisorJoin}
        WHERE t.complex_id = ? AND COALESCE(t.is_active, 1) = 1`;
      const trackBinds: (string | number)[] = [auth.complexId];
      if (q) {
        trackSql += ` AND (t.name_ar LIKE ?`;
        trackBinds.push(`%${q}%`);
        if (hasSupervisor) {
          trackSql += ` OR u.full_name_ar LIKE ?`;
          trackBinds.push(`%${q}%`);
        }
        trackSql += `)`;
      }
      trackSql += ` ORDER BY t.name_ar LIMIT 200`;
      const tracks = await env.DB.prepare(trackSql)
        .bind(...trackBinds)
        .all<{
          id: number;
          name_ar: string;
          teacher_name?: string | null;
        }>();
      for (const t of tracks.results ?? []) {
        items.push({
          id: t.id,
          entity_type: "track",
          name_ar: t.name_ar,
          track_id: t.id,
          track_name: null,
          teacher_name: t.teacher_name ?? null,
        });
      }
    }

    items.sort((a, b) => {
      if (a.entity_type !== b.entity_type) {
        return a.entity_type === "circle" ? -1 : 1;
      }
      return a.name_ar.localeCompare(b.name_ar, "ar");
    });

    return json({ items });
  }

  if (path === "/api/edu-dept/transfers/history" && request.method === "GET") {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_transfer_events"))) return json({ items: [] });
    const q = url.searchParams.get("q")?.trim() ?? "";
    let sql = `
      SELECT
        e.id,
        e.student_name,
        e.status,
        e.reason,
        e.error_message,
        e.created_at,
        COALESCE(e.old_circle_name, oc.name_ar) AS old_circle_name,
        ot.name_ar AS old_track_name,
        COALESCE(e.new_circle_name, nc.name_ar) AS new_circle_name,
        COALESCE(e.new_track_name, nt.name_ar) AS new_track_name
      FROM edu_transfer_events e
      LEFT JOIN circles oc ON oc.id = e.old_circle_id
      LEFT JOIN tracks ot ON ot.id = e.old_track_id
      LEFT JOIN circles nc ON nc.id = e.new_circle_id
      LEFT JOIN tracks nt ON nt.id = e.new_track_id
      WHERE e.complex_id = ?`;
    const binds: (string | number)[] = [auth.complexId];
    if (q) {
      sql += ` AND (e.student_name LIKE ? OR e.reason LIKE ? OR e.error_message LIKE ?)`;
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ` ORDER BY e.created_at DESC LIMIT 200`;
    const items = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: items.results ?? [] });
  }

  if (path === "/api/edu-dept/notifications" && request.method === "GET") {
    if (!requireRoles(auth, ["teacher", "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }
    const items = await loadUnreadEduNotifications(
      env,
      auth.complexId,
      auth.userId,
    );
    return json({ items });
  }

  const notifRead = path.match(/^\/api\/edu-dept\/notifications\/(\d+)\/read$/);
  if (notifRead && request.method === "PATCH") {
    if (!requireRoles(auth, ["teacher", "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_notifications"))) return json({ error: "not_found" }, 404);
    const nid = Number(notifRead[1]);
    await env.DB.prepare(
      `UPDATE edu_notifications SET is_read = 1, read_at = datetime('now')
       WHERE id = ? AND recipient_user_id = ? AND complex_id = ?`,
    )
      .bind(nid, auth.userId, auth.complexId)
      .run();
    return json({ ok: true });
  }

  if (
    (path === "/api/edu-dept/reports/educational-profile" ||
      path === "/api/edu-dept/reports/individual") &&
    request.method === "GET"
  ) {
    if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "edu_daily_recitation"))) return migrationRequired();

    const personId = Number(url.searchParams.get("person_id") ?? NaN);
    if (!Number.isFinite(personId)) return json({ error: "person_id_required" }, 400);

    const student = await fetchStudentForAdminReport(env, auth.complexId, personId);
    if (!student) return json({ error: "student_not_found" }, 404);

    const complex = await env.DB.prepare(`SELECT name_ar FROM complexes WHERE id = ?`)
      .bind(auth.complexId)
      .first<{ name_ar: string }>();

    const criteria = await loadEvaluationCriteria(env, auth.complexId);
    const hasTaskScores = await tableHasColumn(env, "edu_daily_recitation", "task_scores_json");
    const hasTasksSnapshot = await tableHasColumn(env, "edu_daily_recitation", "tasks_snapshot");
    const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
    const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");

    const trackJoin = hasCircleTrack
      ? "LEFT JOIN tracks t ON t.id = c.track_id"
      : "LEFT JOIN tracks t ON 1=0";
    const trackCol = hasCircleTrack ? "t.name_ar AS track_name" : "NULL AS track_name";

    const rows = await env.DB.prepare(
      `SELECT dr.recitation_date, dr.circle_id, dr.notes,
              dr.listened, dr.repeated, dr.revised, dr.error_count, dr.tune_errors,
              ${hasTaskScores ? "dr.task_scores_json," : ""}
              ${hasTasksSnapshot ? "dr.tasks_snapshot," : ""}
              ${hasFace ? "dr.face_count," : ""}
              c.name_ar AS circle_name, ${trackCol}
       FROM edu_daily_recitation dr
       LEFT JOIN circles c ON c.id = dr.circle_id
       ${trackJoin}
       WHERE dr.student_id = ?
       ORDER BY dr.recitation_date ASC, dr.id ASC`,
    )
      .bind(student.id)
      .all<Record<string, unknown>>();

    type TaskCell = { id: string; name: string; value: boolean | number };
    type ProfileRow = {
      date: string;
      circle_name: string | null;
      track_name: string | null;
      quality_pct: number;
      face_count: number;
      notes: string | null;
      tasks: TaskCell[];
    };

    const items: ProfileRow[] = [];
    let qualitySum = 0;
    let totalFaces = 0;

    for (const r of rows.results ?? []) {
      const legacy = {
        listened: r.listened as number | boolean | undefined,
        repeated: r.repeated as number | boolean | undefined,
        revised: r.revised as number | boolean | undefined,
        error_count: Number(r.error_count ?? 0),
        tune_errors: Number(r.tune_errors ?? 0),
        face_count: Number(r.face_count ?? 0),
      };
      const scores = parseTaskScoresJson(
        hasTaskScores ? (r.task_scores_json as string | null) : null,
        legacy,
      );
      const snapshotRaw = hasTasksSnapshot
        ? (r.tasks_snapshot as string | null)
        : null;
      const rowCriteria = criteriaForRecord(snapshotRaw, criteria);
      const quality_pct = computeQualityForRecord(scores, snapshotRaw, criteria);
      qualitySum += quality_pct;
      const faces = hasFace ? Number(r.face_count ?? 0) : 0;
      totalFaces += faces;

      const tasks: TaskCell[] = rowCriteria.map((c) => ({
        id: c.id,
        name: c.name,
        value:
          scores[c.id] ??
          (c.type === "penalty" || c.input_type === "numeric" || c.input === "number"
            ? 0
            : false),
      }));

      items.push({
        date: String(r.recitation_date),
        circle_name: (r.circle_name as string | null) ?? null,
        track_name: (r.track_name as string | null) ?? null,
        quality_pct,
        face_count: faces,
        notes: (r.notes as string | null) ?? null,
        tasks,
      });
    }

    const recordCount = items.length;
    const firstDate = recordCount > 0 ? items[0].date : null;
    const lastDate = recordCount > 0 ? items[recordCount - 1].date : null;
    const avgQuality =
      recordCount > 0 ? Math.round((qualitySum / recordCount) * 10) / 10 : null;

    const placementLabel =
      [student.circle_name, student.track_name].filter(Boolean).join(" · ") || null;

    const memorization = resolveMemorizationFields({
      memorization_faces: student.memorization_faces,
      memorization_amount: student.memorization_amount,
    });

    return json({
      type: "educational",
      complex_name: complex?.name_ar ?? null,
      person: {
        id: student.id,
        full_name_ar: student.full_name_ar,
        current_placement: placementLabel,
        memorization_faces: memorization.faces,
        memorization_amount: memorization.text,
        memorization_display: memorization.text,
      },
      criteria: criteria.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      summary: {
        total_records: recordCount,
        avg_quality_pct: avgQuality,
        total_faces: totalFaces,
        first_record_date: firstDate,
        last_record_date: lastDate,
      },
      items,
    });
  }

  return null;
}
