import type { Env } from "../types";

/** يتحقق أن الطالب ضمن حلقات المعلم الموكّلة */
export async function teacherCanAccessStudent(
  env: Env,
  teacherUserId: number,
  studentId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM students s
     JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     JOIN teacher_assignments ta ON ta.circle_id = h.circle_id AND ta.user_id = ?
     WHERE s.id = ? AND s.is_active = 1
     LIMIT 1`,
  )
    .bind(teacherUserId, studentId)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}
