import type { Env } from "../types";

/** تسجيل حضور الطالب تلقائياً عند الرصد اليومي */
export async function recordTeacherAutoAttendance(
  env: Env,
  complexId: number,
  studentId: number,
  date: string,
  teacherUserId: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO student_daily_attendance
     (complex_id, student_id, attendance_date, status, source, recorded_by_user_id, notes)
     VALUES (?, ?, ?, 'present', 'teacher_auto', ?, 'حضور تلقائي من رصد المعلم')
     ON CONFLICT(student_id, attendance_date) DO UPDATE SET
       status = 'present',
       source = 'teacher_auto',
       recorded_by_user_id = excluded.recorded_by_user_id,
       recorded_at = datetime('now'),
       notes = excluded.notes`,
  )
    .bind(complexId, studentId, date, teacherUserId)
    .run();

  await env.DB.prepare(
    `INSERT INTO student_attendance_log
     (student_id, attendance_date, status, source, recorded_by_user_id, notes)
     VALUES (?, ?, 'present', 'teacher_auto', ?, 'حضور تلقائي من رصد المعلم')`,
  )
    .bind(studentId, date, teacherUserId)
    .run();
}
