import type { Env } from "../types";
import { hasTable, studentIsActiveSql, tableHasColumn } from "./db-schema";
import { buildStudentPlacementSql } from "./student-list-sql";
import {
  queryStudentsInCircle,
  queryStudentsInTracks,
  resolveTrackSupervisorTrackIds,
  circleIdsForTracks,
} from "./student-placement";
import type { StudentPlacementSql } from "./student-list-sql";

/** Competitions / general teacher UX */
export const TEACHER_NO_CIRCLE_ACCOUNT_MSG = "لا توجد حلقة مرتبطة بهذا الحساب";

/** Daily recitation */
export const TEACHER_NO_CIRCLE_RECITATION_MSG = "لم يتم ربط حلقة بهذا المعلم بعد";

export async function resolveTeacherPrimaryCircle(
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

/**
 * SQL predicate — circle id expression is within teacher scope (assignments OR circles.teacher_id).
 * Time O(1) compile; Space O(1). Binds: one user_id per placeholder (caller duplicates if needed).
 */
export async function buildTeacherCircleAccessSql(
  env: Env,
  circleIdExpr: string,
  teacherUserIdPlaceholder = "?",
): Promise<string> {
  const parts: string[] = [];
  if (await hasTable(env, "teacher_assignments")) {
    parts.push(
      `${circleIdExpr} IN (SELECT circle_id FROM teacher_assignments WHERE user_id = ${teacherUserIdPlaceholder})`,
    );
  }
  if (await tableHasColumn(env, "circles", "teacher_id")) {
    parts.push(
      `EXISTS (SELECT 1 FROM circles tc WHERE tc.id = ${circleIdExpr} AND tc.teacher_id = ${teacherUserIdPlaceholder})`,
    );
  }
  return parts.length ? `(${parts.join(" OR ")})` : "0=1";
}

/**
 * SQL predicate — طالب ضمن نطاق مشرف المسار (مسارات + حلقات المسار + إسنادات المعلم/النطاق).
 * Time O(T+C) لبناء الاستعلام؛ Space O(T+C) للمعرّفات.
 */
export async function buildTrackSupervisorStudentScopeSql(
  env: Env,
  auth: { userId: number; complexId: number },
  placement: Pick<StudentPlacementSql, "circleRef" | "trackRef">,
): Promise<{ sql: string; binds: number[]; assigned: boolean }> {
  const parts: string[] = [];
  const binds: number[] = [];
  let assigned = false;

  const trackIds = await resolveTrackSupervisorTrackIds(
    env,
    auth.userId,
    auth.complexId,
  );
  if (trackIds.length > 0) {
    assigned = true;
    const tph = trackIds.map(() => "?").join(",");
    parts.push(`CAST(${placement.trackRef} AS INTEGER) IN (${tph})`);
    binds.push(...trackIds);

    const circleIds = await circleIdsForTracks(env, auth.complexId, trackIds);
    if (circleIds.length > 0) {
      const cph = circleIds.map(() => "?").join(",");
      parts.push(`CAST(${placement.circleRef} AS INTEGER) IN (${cph})`);
      binds.push(...circleIds);
    }
  }

  const circleAccess = await buildTeacherCircleAccessSql(env, placement.circleRef);
  if (circleAccess !== "0=1") {
    assigned = true;
    parts.push(circleAccess);
    const placeholders = (circleAccess.match(/\?/g) ?? []).length;
    for (let i = 0; i < placeholders; i += 1) binds.push(auth.userId);
  }

  if (await hasTable(env, "supervisor_scopes")) {
    parts.push(
      `CAST(${placement.circleRef} AS INTEGER) IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ? AND circle_id IS NOT NULL)`,
    );
    binds.push(auth.userId);
    parts.push(
      `CAST(${placement.trackRef} AS INTEGER) IN (SELECT track_id FROM supervisor_scopes WHERE user_id = ? AND track_id IS NOT NULL)`,
    );
    binds.push(auth.userId);
    assigned = true;
  }

  if (!assigned || parts.length === 0) {
    return { sql: "0=1", binds: [], assigned: false };
  }
  return { sql: `(${parts.join(" OR ")})`, binds, assigned: true };
}

export async function resolveTrackSupervisorPrimaryTrack(
  env: Env,
  userId: number,
  complexId: number,
): Promise<{ id: number; name_ar: string } | null> {
  const trackIds = await resolveTrackSupervisorTrackIds(env, userId, complexId);
  if (trackIds.length === 0) return null;
  const row = await env.DB.prepare(
    `SELECT id, name_ar FROM tracks WHERE id = ? AND complex_id = ?`,
  )
    .bind(trackIds[0], complexId)
    .first<{ id: number; name_ar: string }>();
  return row ?? null;
}

/** O(S) — تسميات الحلقة/المسار لمجموعة طلاب في استعلام واحد */
export async function loadStudentPlacementLabels(
  env: Env,
  complexId: number,
  studentIds: number[],
): Promise<Map<number, { circle_name: string | null; track_name: string | null }>> {
  const out = new Map<number, { circle_name: string | null; track_name: string | null }>();
  if (studentIds.length === 0) return out;

  const placement = await buildStudentPlacementSql(env);
  const ph = studentIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT s.id, c.name_ar AS circle_name, t.name_ar AS track_name
     FROM students s
     ${placement.historyJoin}
     ${placement.circleJoin}
     ${placement.trackJoin}
     WHERE s.complex_id = ? AND s.id IN (${ph})`,
  )
    .bind(complexId, ...studentIds)
    .all<{ id: number; circle_name: string | null; track_name: string | null }>();

  for (const r of rows.results ?? []) {
    out.set(r.id, {
      circle_name: r.circle_name?.trim() || null,
      track_name: r.track_name?.trim() || null,
    });
  }
  return out;
}

/** Students for teacher (circle) or track supervisor (track via current_track_id). */
export async function studentsInTeacherCircle(
  env: Env,
  complexId: number,
  teacherUserId: number,
  role = "teacher",
): Promise<Array<{ id: number; full_name_ar: string }> | null> {
  if (role === "track_supervisor") {
    const placement = await buildStudentPlacementSql(env);
    const scope = await buildTrackSupervisorStudentScopeSql(
      env,
      { userId: teacherUserId, complexId },
      placement,
    );
    if (!scope.assigned) return null;

    const activeSql = await studentIsActiveSql(env, "s");
    const rows = await env.DB.prepare(
      `SELECT DISTINCT s.id, s.full_name_ar
       FROM students s
       ${placement.historyJoin}
       WHERE s.complex_id = ? AND ${activeSql} AND ${scope.sql}
       ORDER BY s.full_name_ar`,
    )
      .bind(complexId, ...scope.binds)
      .all<{ id: number; full_name_ar: string }>();
    return rows.results ?? [];
  }

  const circle = await resolveTeacherPrimaryCircle(env, teacherUserId, complexId);
  if (!circle) return null;

  return queryStudentsInCircle(env, complexId, circle.id);
}
