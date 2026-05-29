import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

export type AttendanceSource =
  | "teacher_auto"
  | "edu_supervisor"
  | "admin_supervisor"
  | "general_supervisor"
  | "magic_link";

export type AttendanceStatus = "present" | "absent" | "excused";

export async function resolveAttendanceTableName(
  env: Env,
): Promise<string | null> {
  if (await hasTable(env, "student_attendance")) return "student_attendance";
  if (await hasTable(env, "student_daily_attendance")) {
    return "student_daily_attendance";
  }
  return null;
}

/** Source value allowed by CHECK constraints on the active table. */
function resolveSource(table: string, preferred: AttendanceSource): string {
  if (preferred === "admin_supervisor" || preferred === "magic_link") {
    if (table === "student_attendance") {
      return preferred === "magic_link" ? "admin_supervisor" : preferred;
    }
    return "general_supervisor";
  }
  return preferred;
}

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
  const table = await resolveAttendanceTableName(env);
  if (!table) {
    throw new Error("student_attendance_table_missing");
  }

  const source = resolveSource(table, row.source);
  const hasCircle = await tableHasColumn(env, table, "circle_id");
  const hasToken = await tableHasColumn(env, table, "shared_token_id");

  if (hasCircle || hasToken) {
    await env.DB.prepare(
      `INSERT INTO ${table} (
         complex_id, student_id, attendance_date, status, source,
         circle_id, shared_token_id, recorded_by_user_id, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(student_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         source = excluded.source,
         circle_id = COALESCE(excluded.circle_id, ${table}.circle_id),
         shared_token_id = COALESCE(excluded.shared_token_id, ${table}.shared_token_id),
         recorded_by_user_id = excluded.recorded_by_user_id,
         recorded_at = datetime('now'),
         notes = excluded.notes`,
    )
      .bind(
        row.complexId,
        row.studentId,
        row.attendanceDate,
        row.status,
        source,
        row.circleId ?? null,
        row.sharedTokenId ?? null,
        row.recordedByUserId ?? null,
        row.notes ?? null,
      )
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO ${table} (
       complex_id, student_id, attendance_date, status, source,
       recorded_by_user_id, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, attendance_date) DO UPDATE SET
       status = excluded.status,
       source = excluded.source,
       recorded_by_user_id = excluded.recorded_by_user_id,
       recorded_at = datetime('now'),
       notes = excluded.notes`,
  )
    .bind(
      row.complexId,
      row.studentId,
      row.attendanceDate,
      row.status,
      source,
      row.recordedByUserId ?? null,
      row.notes ?? null,
    )
    .run();
}
