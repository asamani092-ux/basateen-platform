import type { Env } from "../types";
import { studentIsActiveSql, tableHasColumn } from "./db-schema";
import {
  resolveAttendanceTableName,
  type AttendanceStatus,
} from "./student-attendance-db";

export type AttendanceEntityType = "circle" | "track";

export async function assertTrackInComplex(
  env: Env,
  complexId: number,
  trackId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM tracks WHERE id = ? AND complex_id = ?`,
  )
    .bind(trackId, complexId)
    .first<{ id: number }>();
  return Boolean(row);
}

export async function loadStudentsForEntityAttendance(
  env: Env,
  complexId: number,
  entity: { type: AttendanceEntityType; id: number },
  date: string,
): Promise<{ items: unknown[]; attTable: string } | { error: string; hint?: string }> {
  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) {
    return {
      error: "migration_required",
      hint: `students.${column}`,
    };
  }

  const attTable = await resolveAttendanceTableName(env);
  if (!attTable) {
    return { error: "migration_required", hint: "student_attendance" };
  }

  const attSourceCol = (await tableHasColumn(env, attTable, "source"))
    ? ", sa.source"
    : "";
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const placementCol = entity.type === "circle" ? "current_circle_id" : "current_track_id";

  const rows = await env.DB.prepare(
    `SELECT s.id AS student_id, s.full_name_ar,
            COALESCE(s.stage_id, 0) AS stage_id,
            sa.id AS attendance_id,
            CASE WHEN sa.id IS NOT NULL THEN 1 ELSE 0 END AS has_record,
            COALESCE(sa.status, 'present') AS status,
            sa.recorded_at${attSourceCol}
     FROM students s
     LEFT JOIN ${attTable} sa
       ON sa.student_id = s.id AND sa.attendance_date = ?
     WHERE s.complex_id = ? AND ${isActiveExpr}
       AND s.${placementCol} = ?
     ORDER BY s.full_name_ar`,
  )
    .bind(date, complexId, entity.id)
    .all();

  return { items: rows.results ?? [], attTable };
}

export async function studentBelongsToEntity(
  env: Env,
  complexId: number,
  studentId: number,
  entity: { type: AttendanceEntityType; id: number },
): Promise<boolean> {
  const isActiveExpr = await studentIsActiveSql(env, "");
  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) return false;

  const row = await env.DB.prepare(
    `SELECT id FROM students
     WHERE id = ? AND complex_id = ? AND ${isActiveExpr} AND ${column} = ?`,
  )
    .bind(studentId, complexId, entity.id)
    .first<{ id: number }>();
  return Boolean(row);
}

export function parseAttendanceEntity(body: {
  circle_id?: number;
  track_id?: number;
}): { type: AttendanceEntityType; id: number } | null {
  const circleId =
    body.circle_id != null ? Number(body.circle_id) : Number.NaN;
  const trackId = body.track_id != null ? Number(body.track_id) : Number.NaN;
  const hasCircle = Number.isFinite(circleId) && circleId > 0;
  const hasTrack = Number.isFinite(trackId) && trackId > 0;
  if (hasCircle && hasTrack) return null;
  if (hasCircle) return { type: "circle", id: circleId };
  if (hasTrack) return { type: "track", id: trackId };
  return null;
}

export function isAttendanceStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim();
  if (s === "present" || s === "absent" || s === "excused") return s;
  return null;
}
