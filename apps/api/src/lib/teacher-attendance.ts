import type { Env } from "../types";
import { upsertStudentAttendance } from "./student-attendance-db";

/** تسجيل حضور الطالب تلقائياً عند الرصد اليومي */
export async function recordTeacherAutoAttendance(
  env: Env,
  complexId: number,
  studentId: number,
  date: string,
  teacherUserId: number,
): Promise<void> {
  await upsertStudentAttendance(env, {
    complexId,
    studentId,
    attendanceDate: date,
    status: "present",
    source: "teacher_auto",
    recordedByUserId: teacherUserId,
    notes: "حضور تلقائي من رصد المعلم",
  });
}
