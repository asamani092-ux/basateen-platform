import type { Env } from "../types";

export type AttendanceSource =
  | "teacher_auto"
  | "edu_supervisor"
  | "admin_supervisor"
  | "magic_link";

export type AttendanceStatus = "present" | "absent" | "excused";

export async function upsertStudentAttendance(
  env: Env,
  row: {
    complexId: number;
    studentId: number;
    attendanceDate: string;
    status: AttendanceStatus;
    source: AttendanceSource;
    circleId?: number | null;
    sharedTokenId?: number | null;
    recordedByUserId?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO student_attendance (
       complex_id, student_id, attendance_date, status, source,
       circle_id, shared_token_id, recorded_by_user_id, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, attendance_date) DO UPDATE SET
       status = excluded.status,
       source = excluded.source,
       circle_id = COALESCE(excluded.circle_id, student_attendance.circle_id),
       shared_token_id = COALESCE(excluded.shared_token_id, student_attendance.shared_token_id),
       recorded_by_user_id = excluded.recorded_by_user_id,
       recorded_at = datetime('now'),
       notes = excluded.notes`,
  )
    .bind(
      row.complexId,
      row.studentId,
      row.attendanceDate,
      row.status,
      row.source,
      row.circleId ?? null,
      row.sharedTokenId ?? null,
      row.recordedByUserId ?? null,
      row.notes ?? null,
    )
    .run();
}
