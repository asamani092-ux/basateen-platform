import type { Env } from "../types";
import { studentIsActiveSql, tableHasColumn } from "./db-schema";
import {
  parseAttendanceEntity,
  studentBelongsToEntity,
  type AttendanceEntityType,
} from "./admin-attendance-entities";
import {
  resolveAttendanceTableName,
  upsertStudentAttendance,
  type AttendanceStatus,
} from "./student-attendance-db";

export type BeneficiaryType = "student" | "staff";

export function parseBeneficiaryType(raw: unknown): BeneficiaryType | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "student" || t === "staff") return t;
  return null;
}

async function assertStudentAttendanceRow(
  env: Env,
  complexId: number,
  attendanceId: number,
): Promise<{ id: number; student_id: number; attendance_date: string } | null> {
  const table = await resolveAttendanceTableName(env);
  if (!table) return null;
  const row = await env.DB.prepare(
    `SELECT id, student_id, attendance_date FROM ${table}
     WHERE id = ? AND complex_id = ?`,
  )
    .bind(attendanceId, complexId)
    .first<{ id: number; student_id: number; attendance_date: string }>();
  return row ?? null;
}

async function assertStaffAttendanceRow(
  env: Env,
  complexId: number,
  attendanceId: number,
): Promise<{ id: number; user_id: number; attendance_date: string } | null> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, attendance_date FROM staff_attendance
     WHERE id = ? AND complex_id = ?`,
  )
    .bind(attendanceId, complexId)
    .first<{ id: number; user_id: number; attendance_date: string }>();
  return row ?? null;
}

/** Time O(1); Space O(1) */
export async function patchAttendanceById(
  env: Env,
  complexId: number,
  attendanceId: number,
  beneficiaryType: BeneficiaryType,
  status: AttendanceStatus,
  recordedByUserId: number,
): Promise<{ ok: true; id: number } | { error: string }> {
  if (beneficiaryType === "student") {
    const row = await assertStudentAttendanceRow(env, complexId, attendanceId);
    if (!row) return { error: "not_found" };
    const table = await resolveAttendanceTableName(env);
    if (!table) return { error: "migration_required" };
    await env.DB.prepare(
      `UPDATE ${table}
       SET status = ?, recorded_by_user_id = ?, recorded_at = datetime('now')
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(status, recordedByUserId, attendanceId, complexId)
      .run();
    return { ok: true, id: attendanceId };
  }

  const row = await assertStaffAttendanceRow(env, complexId, attendanceId);
  if (!row) return { error: "not_found" };
  await env.DB.prepare(
    `UPDATE staff_attendance
     SET status = ?, recorded_by_user_id = ?, recorded_at = datetime('now')
     WHERE id = ? AND complex_id = ?`,
  )
    .bind(status, recordedByUserId, attendanceId, complexId)
    .run();
  return { ok: true, id: attendanceId };
}

export async function deleteAttendanceById(
  env: Env,
  complexId: number,
  attendanceId: number,
  beneficiaryType: BeneficiaryType,
): Promise<{ ok: true; deleted: number } | { error: string }> {
  if (beneficiaryType === "student") {
    const table = await resolveAttendanceTableName(env);
    if (!table) return { error: "migration_required" };
    const res = await env.DB.prepare(
      `DELETE FROM ${table} WHERE id = ? AND complex_id = ?`,
    )
      .bind(attendanceId, complexId)
      .run();
    return { ok: true, deleted: res.meta.changes ?? 0 };
  }

  const res = await env.DB.prepare(
    `DELETE FROM staff_attendance WHERE id = ? AND complex_id = ?`,
  )
    .bind(attendanceId, complexId)
    .run();
  return { ok: true, deleted: res.meta.changes ?? 0 };
}

export async function upsertAttendanceRecord(
  env: Env,
  complexId: number,
  recordedByUserId: number,
  body: {
    beneficiary_type: BeneficiaryType;
    person_id: number;
    attendance_date: string;
    status: AttendanceStatus;
    circle_id?: number;
    track_id?: number;
  },
): Promise<{ ok: true; attendance_id: number } | { error: string }> {
  const personId = Number(body.person_id);
  if (!Number.isFinite(personId)) return { error: "person_id_required" };

  if (body.beneficiary_type === "staff") {
    const staffOk = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ?`,
    )
      .bind(personId, complexId)
      .first();
    if (!staffOk) return { error: "staff_not_found" };

    await env.DB.prepare(
      `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, recorded_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         recorded_by_user_id = excluded.recorded_by_user_id,
         recorded_at = datetime('now')`,
    )
      .bind(complexId, personId, body.attendance_date, body.status, recordedByUserId)
      .run();

    const row = await env.DB.prepare(
      `SELECT id FROM staff_attendance
       WHERE complex_id = ? AND user_id = ? AND attendance_date = ?`,
    )
      .bind(complexId, personId, body.attendance_date)
      .first<{ id: number }>();
    if (!row) return { error: "upsert_failed" };
    return { ok: true, attendance_id: row.id };
  }

  const entity = parseAttendanceEntity(body);
  if (!entity) return { error: "entity_required" };
  const allowed = await studentBelongsToEntity(
    env,
    complexId,
    personId,
    entity,
  );
  if (!allowed) return { error: "student_not_in_entity" };

  await upsertStudentAttendance(env, {
    complexId,
    studentId: personId,
    attendanceDate: body.attendance_date,
    status: body.status,
    source: "admin_supervisor",
    circleId: entity.type === "circle" ? entity.id : null,
    trackId: entity.type === "track" ? entity.id : null,
    recordedByUserId,
  });

  const table = await resolveAttendanceTableName(env);
  if (!table) return { error: "migration_required" };
  const row = await env.DB.prepare(
    `SELECT id FROM ${table}
     WHERE complex_id = ? AND student_id = ? AND attendance_date = ?`,
  )
    .bind(complexId, personId, body.attendance_date)
    .first<{ id: number }>();
  if (!row) return { error: "upsert_failed" };
  return { ok: true, attendance_id: row.id };
}

export async function bulkClearAttendanceDay(
  env: Env,
  complexId: number,
  body: {
    beneficiary_type: BeneficiaryType;
    attendance_date: string;
    circle_id?: number;
    track_id?: number;
  },
): Promise<{ ok: true; deleted: number } | { error: string }> {
  const date = body.attendance_date?.trim();
  if (!date) return { error: "attendance_date_required" };

  if (body.beneficiary_type === "staff") {
    const res = await env.DB.prepare(
      `DELETE FROM staff_attendance WHERE complex_id = ? AND attendance_date = ?`,
    )
      .bind(complexId, date)
      .run();
    return { ok: true, deleted: res.meta.changes ?? 0 };
  }

  const entity = parseAttendanceEntity(body);
  if (!entity) return { error: "entity_required" };

  const table = await resolveAttendanceTableName(env);
  if (!table) return { error: "migration_required" };

  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) {
    return { error: "migration_required" };
  }
  const isActiveExpr = await studentIsActiveSql(env, "s");

  const res = await env.DB.prepare(
    `DELETE FROM ${table}
     WHERE complex_id = ? AND attendance_date = ?
       AND student_id IN (
         SELECT s.id FROM students s
         WHERE s.complex_id = ? AND ${isActiveExpr} AND s.${column} = ?
       )`,
  )
    .bind(complexId, date, complexId, entity.id)
    .run();

  return { ok: true, deleted: res.meta.changes ?? 0 };
}

export type { AttendanceEntityType };
