import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

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

/** Students in the teacher's derived circle (`current_circle_id` or history). */
export async function studentsInTeacherCircle(
  env: Env,
  complexId: number,
  teacherUserId: number,
): Promise<Array<{ id: number; full_name_ar: string }> | null> {
  const circle = await resolveTeacherPrimaryCircle(env, teacherUserId, complexId);
  if (!circle) return null;

  const hasFlat = await tableHasColumn(env, "students", "current_circle_id");
  if (hasFlat) {
    const rows = await env.DB.prepare(
      `SELECT id, full_name_ar FROM students
       WHERE complex_id = ? AND is_active = 1 AND current_circle_id = ?
       ORDER BY full_name_ar`,
    )
      .bind(complexId, circle.id)
      .all<{ id: number; full_name_ar: string }>();
    return rows.results ?? [];
  }

  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id, s.full_name_ar
     FROM students s
     INNER JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       AND h.circle_id = ?
     WHERE s.complex_id = ? AND s.is_active = 1
     ORDER BY s.full_name_ar`,
  )
    .bind(circle.id, complexId)
    .all<{ id: number; full_name_ar: string }>();
  return rows.results ?? [];
}
