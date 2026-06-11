import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import {
  queryStudentsInCircle,
  queryStudentsInTracks,
  resolveTrackSupervisorTrackIds,
} from "./student-placement";

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

/** Students for teacher (circle) or track supervisor (track via current_track_id). */
export async function studentsInTeacherCircle(
  env: Env,
  complexId: number,
  teacherUserId: number,
  role = "teacher",
): Promise<Array<{ id: number; full_name_ar: string }> | null> {
  if (role === "track_supervisor") {
    const trackIds = await resolveTrackSupervisorTrackIds(
      env,
      teacherUserId,
      complexId,
    );
    if (trackIds.length > 0) {
      return queryStudentsInTracks(env, complexId, trackIds);
    }
  }

  const circle = await resolveTeacherPrimaryCircle(env, teacherUserId, complexId);
  if (!circle) return null;

  return queryStudentsInCircle(env, complexId, circle.id);
}
