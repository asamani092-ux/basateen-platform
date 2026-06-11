import type { Env } from "../types";
import {
  activePlacementSql,
  canJoinStudentHistoryForPlacement,
  hasTable,
  historyCircleColumn,
  studentIsActiveSql,
  tableHasColumn,
} from "./db-schema";

export type PlacementStudentRow = { id: number; full_name_ar: string };

/**
 * Track ids supervised by this user (tracks.supervisor_id + supervisor_scopes.track_id).
 * Time O(T), Space O(T) — T = assigned tracks (small).
 */
export async function resolveTrackSupervisorTrackIds(
  env: Env,
  userId: number,
  complexId: number,
): Promise<number[]> {
  const ids = new Set<number>();

  if (await tableHasColumn(env, "tracks", "supervisor_id")) {
    const hasActive = await tableHasColumn(env, "tracks", "is_active");
    const activeClause = hasActive
      ? " AND COALESCE(CAST(is_active AS INTEGER), 1) = 1"
      : "";
    const rows = await env.DB.prepare(
      `SELECT id FROM tracks
       WHERE supervisor_id = ? AND complex_id = ?${activeClause}`,
    )
      .bind(userId, complexId)
      .all<{ id: number }>();
    for (const r of rows.results ?? []) {
      if (Number.isFinite(r.id) && r.id > 0) ids.add(r.id);
    }
  }

  if (await hasTable(env, "supervisor_scopes")) {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT track_id FROM supervisor_scopes
       WHERE user_id = ? AND track_id IS NOT NULL`,
    )
      .bind(userId)
      .all<{ track_id: number }>();
    for (const r of rows.results ?? []) {
      if (Number.isFinite(r.track_id) && r.track_id > 0) ids.add(r.track_id);
    }
  }

  return [...ids];
}

/**
 * Circle ids linked to track ids (circles.track_id + track_circles).
 * Time O(C), Space O(C).
 */
async function circleIdsForTracks(
  env: Env,
  complexId: number,
  trackIds: number[],
): Promise<number[]> {
  if (trackIds.length === 0) return [];
  const ids = new Set<number>();
  const ph = trackIds.map(() => "?").join(",");
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");
  const activeClause = hasIsActive
    ? " AND COALESCE(CAST(c.is_active AS INTEGER), 1) = 1"
    : "";

  if (await tableHasColumn(env, "circles", "track_id")) {
    const rows = await env.DB.prepare(
      `SELECT c.id FROM circles c
       WHERE c.complex_id = ? AND CAST(c.track_id AS INTEGER) IN (${ph})${activeClause}`,
    )
      .bind(complexId, ...trackIds)
      .all<{ id: number }>();
    for (const r of rows.results ?? []) ids.add(r.id);
  }

  if (await hasTable(env, "track_circles")) {
    const rows = await env.DB.prepare(
      `SELECT tc.circle_id AS id
       FROM track_circles tc
       INNER JOIN circles c ON c.id = tc.circle_id
       WHERE c.complex_id = ? AND tc.track_id IN (${ph})${activeClause}`,
    )
      .bind(complexId, ...trackIds)
      .all<{ id: number }>();
    for (const r of rows.results ?? []) ids.add(r.id);
  }

  return [...ids];
}

/**
 * Circles visible to a track supervisor (tracks, assignments, scopes — not circle_id-only).
 * Time O(C), Space O(C).
 */
export async function resolveTrackSupervisorCircles(
  env: Env,
  auth: { userId: number; complexId: number },
): Promise<Array<{ id: number; name_ar: string }>> {
  const circleIds = new Set<number>();
  const hasIsActive = await tableHasColumn(env, "circles", "is_active");
  const activeClause = hasIsActive
    ? " AND COALESCE(CAST(c.is_active AS INTEGER), 1) = 1"
    : "";

  const trackIds = await resolveTrackSupervisorTrackIds(
    env,
    auth.userId,
    auth.complexId,
  );
  for (const id of await circleIdsForTracks(env, auth.complexId, trackIds)) {
    circleIds.add(id);
  }

  if (await hasTable(env, "teacher_assignments")) {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT ta.circle_id AS id
       FROM teacher_assignments ta
       INNER JOIN circles c ON c.id = ta.circle_id
       WHERE ta.user_id = ? AND c.complex_id = ?${activeClause}`,
    )
      .bind(auth.userId, auth.complexId)
      .all<{ id: number }>();
    for (const r of rows.results ?? []) {
      if (Number.isFinite(r.id) && r.id > 0) circleIds.add(r.id);
    }
  }

  if (await hasTable(env, "supervisor_scopes")) {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT ss.circle_id AS id
       FROM supervisor_scopes ss
       INNER JOIN circles c ON c.id = ss.circle_id
       WHERE ss.user_id = ? AND ss.circle_id IS NOT NULL AND c.complex_id = ?${activeClause}`,
    )
      .bind(auth.userId, auth.complexId)
      .all<{ id: number }>();
    for (const r of rows.results ?? []) {
      if (Number.isFinite(r.id) && r.id > 0) circleIds.add(r.id);
    }
  }

  if (circleIds.size === 0) return [];

  const ph = [...circleIds].map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, name_ar FROM circles
     WHERE complex_id = ? AND id IN (${ph})
     ORDER BY name_ar`,
  )
    .bind(auth.complexId, ...circleIds)
    .all<{ id: number; name_ar: string }>();
  return rows.results ?? [];
}

/**
 * Active students in one circle — current_circle_id first, history fallback.
 * Time O(S), Space O(S).
 */
export async function queryStudentsInCircle(
  env: Env,
  complexId: number,
  circleId: number,
): Promise<PlacementStudentRow[]> {
  const activeSql = await studentIsActiveSql(env, "");
  const hasCurrent = await tableHasColumn(env, "students", "current_circle_id");

  if (hasCurrent) {
    const flat = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students
       WHERE complex_id = ? AND ${activeSql}
         AND CAST(current_circle_id AS INTEGER) = ?
       ORDER BY full_name_ar`,
    )
      .bind(complexId, circleId)
      .all<PlacementStudentRow>();
    const flatRows = flat.results ?? [];
    if (flatRows.length > 0 || !(await canJoinStudentHistoryForPlacement(env))) {
      return flatRows;
    }

    const circleHistCol = await historyCircleColumn(env, "h");
    if (!circleHistCol) return flatRows;
    const active = await activePlacementSql(env, "h");
    const hist = await env.DB.prepare(
      `SELECT DISTINCT s.id, s.full_name_ar
       FROM students s
       INNER JOIN student_circle_history h
         ON h.student_id = s.id AND ${active}
         AND CAST(${circleHistCol} AS INTEGER) = ?
       WHERE s.complex_id = ? AND ${activeSql}
         AND (s.current_circle_id IS NULL OR CAST(s.current_circle_id AS INTEGER) != ?)
       ORDER BY s.full_name_ar`,
    )
      .bind(circleId, complexId, circleId)
      .all<PlacementStudentRow>();
    return hist.results ?? [];
  }

  const circleHistCol = await historyCircleColumn(env, "h");
  if (!circleHistCol) return [];
  const active = await activePlacementSql(env, "h");
  const legacy = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.full_name_ar
     FROM students s
     INNER JOIN student_circle_history h
       ON h.student_id = s.id AND ${active}
       AND CAST(${circleHistCol} AS INTEGER) = ?
     WHERE s.complex_id = ? AND ${activeSql}
     ORDER BY s.full_name_ar`,
  )
    .bind(circleId, complexId)
    .all<PlacementStudentRow>();
  return legacy.results ?? [];
}

/**
 * Active students in supervised track(s) via current_track_id.
 * Time O(S), Space O(S).
 */
export async function queryStudentsInTracks(
  env: Env,
  complexId: number,
  trackIds: number[],
): Promise<PlacementStudentRow[]> {
  if (trackIds.length === 0) return [];
  const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
  if (!hasCurrentTrack) return [];

  const activeSql = await studentIsActiveSql(env, "");
  const ph = trackIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, full_name_ar FROM students
     WHERE complex_id = ? AND ${activeSql}
       AND CAST(current_track_id AS INTEGER) IN (${ph})
     ORDER BY full_name_ar`,
  )
    .bind(complexId, ...trackIds)
    .all<PlacementStudentRow>();
  return rows.results ?? [];
}
