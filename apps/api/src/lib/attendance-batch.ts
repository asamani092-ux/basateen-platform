import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import {
  resolveAttendanceTableName,
  type AttendanceSource,
  type AttendanceStatus,
} from "./student-attendance-db";

export type StaffBatchRecord = { user_id: number; status: AttendanceStatus };
export type StudentBatchRecord = {
  student_id: number;
  status: AttendanceStatus;
  notes?: string | null;
};

function resolveSourceForTable(
  table: string,
  preferred: AttendanceSource,
): string {
  if (preferred === "admin_supervisor" || preferred === "magic_link") {
    if (table === "student_attendance") {
      return preferred === "magic_link" ? "admin_supervisor" : preferred;
    }
    return "general_supervisor";
  }
  return preferred;
}

/** O(n) — دفعة واحدة لتحضير المنسوبين */
export async function batchSaveStaffAttendance(
  env: Env,
  complexId: number,
  recordedByUserId: number,
  attendanceDate: string,
  records: StaffBatchRecord[],
): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  for (const rec of records) {
    const userId = Number(rec.user_id);
    if (!Number.isFinite(userId)) continue;
    const status = rec.status ?? "present";
    if (status === "present") {
      stmts.push(
        env.DB.prepare(
          `DELETE FROM staff_attendance
           WHERE user_id = ? AND attendance_date = ? AND complex_id = ?`,
        ).bind(userId, attendanceDate, complexId),
      );
      continue;
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, attendance_date) DO UPDATE SET
           status = excluded.status,
           recorded_by_user_id = excluded.recorded_by_user_id,
           recorded_at = datetime('now')`,
      ).bind(complexId, userId, attendanceDate, status, recordedByUserId),
    );
  }
  if (stmts.length === 0) return 0;
  await env.DB.batch(stmts);
  return stmts.length;
}

/** O(n) — دفعة لتحضير الطلاب مع Upsert */
export async function batchSaveStudentAttendance(
  env: Env,
  opts: {
    complexId: number;
    attendanceDate: string;
    circleId: number;
    source: AttendanceSource;
    recordedByUserId: number | null;
    sharedTokenId?: number | null;
    records: StudentBatchRecord[];
  },
): Promise<number> {
  const table = await resolveAttendanceTableName(env);
  if (!table) return 0;

  const source = resolveSourceForTable(table, opts.source);
  const hasCircle = await tableHasColumn(env, table, "circle_id");
  const hasToken = await tableHasColumn(env, table, "shared_token_id");

  const stmts: D1PreparedStatement[] = [];
  for (const rec of opts.records) {
    const studentId = Number(rec.student_id);
    if (!Number.isFinite(studentId)) continue;
    if (rec.status === "present") {
      stmts.push(
        env.DB.prepare(
          `DELETE FROM ${table} WHERE student_id = ? AND attendance_date = ?`,
        ).bind(studentId, opts.attendanceDate),
      );
      continue;
    }

    if (hasCircle || hasToken) {
      stmts.push(
        env.DB.prepare(
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
        ).bind(
          opts.complexId,
          studentId,
          opts.attendanceDate,
          rec.status,
          source,
          opts.circleId,
          opts.sharedTokenId ?? null,
          opts.recordedByUserId,
          rec.notes ?? null,
        ),
      );
    } else {
      stmts.push(
        env.DB.prepare(
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
        ).bind(
          opts.complexId,
          studentId,
          opts.attendanceDate,
          rec.status,
          source,
          opts.recordedByUserId,
          rec.notes ?? null,
        ),
      );
    }
  }

  if (stmts.length === 0) return 0;
  await env.DB.batch(stmts);
  return stmts.length;
}
