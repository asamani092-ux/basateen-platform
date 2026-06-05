import type { Env } from "../types";
import { studentIsActiveSql, tableHasColumn } from "./db-schema";
import {
  parseAttendanceEntity,
  type AttendanceEntityType,
} from "./admin-attendance-entities";
import {
  parseBeneficiaryType,
  patchAttendanceById,
  upsertAttendanceRecord,
  type BeneficiaryType,
} from "./admin-attendance-mutations";
import {
  resolveAttendanceTableName,
  type AttendanceStatus,
} from "./student-attendance-db";

export type LedgerRow = {
  attendance_id: number;
  person_id: number;
  full_name_ar: string;
  attendance_date: string;
  status: string;
  role?: string | null;
  recorded_at?: string | null;
};

function parseDateRange(
  startRaw?: string,
  endRaw?: string,
  singleRaw?: string,
): { start: string; end: string } | { error: string } {
  const start = (startRaw ?? singleRaw ?? "").trim();
  const end = (endRaw ?? singleRaw ?? start).trim();
  if (!start || !end) return { error: "date_range_required" };
  if (start > end) return { error: "invalid_date_range" };
  return { start, end };
}

/** Time O(r); Space O(r) — r = عدد السجلات في النطاق */
export async function fetchAttendanceLedger(
  env: Env,
  complexId: number,
  params: {
    beneficiary_type: BeneficiaryType;
    start_date?: string;
    end_date?: string;
    attendance_date?: string;
    circle_id?: number;
    track_id?: number;
  },
): Promise<
  | {
      ok: true;
      start_date: string;
      end_date: string;
      items: LedgerRow[];
    }
  | { error: string }
> {
  const range = parseDateRange(
    params.start_date,
    params.end_date,
    params.attendance_date,
  );
  if ("error" in range) return range;

  if (params.beneficiary_type === "staff") {
    const rows = await env.DB.prepare(
      `SELECT sa.id AS attendance_id, sa.user_id AS person_id, u.full_name_ar,
              sa.attendance_date, sa.status, sa.recorded_at,
              u.role AS role
       FROM staff_attendance sa
       JOIN users u ON u.id = sa.user_id
       WHERE sa.complex_id = ?
         AND sa.attendance_date >= ?
         AND sa.attendance_date <= ?
       ORDER BY sa.attendance_date DESC, u.full_name_ar`,
    )
      .bind(complexId, range.start, range.end)
      .all<LedgerRow>();
    return {
      ok: true,
      start_date: range.start,
      end_date: range.end,
      items: rows.results ?? [],
    };
  }

  const entity = parseAttendanceEntity(params);
  if (!entity) return { error: "entity_required" };

  const table = await resolveAttendanceTableName(env);
  if (!table) return { error: "migration_required" };

  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) {
    return { error: "migration_required" };
  }
  const isActiveExpr = await studentIsActiveSql(env, "s");

  const rows = await env.DB.prepare(
    `SELECT sa.id AS attendance_id, sa.student_id AS person_id, s.full_name_ar,
            sa.attendance_date, sa.status, sa.recorded_at
     FROM ${table} sa
     JOIN students s ON s.id = sa.student_id
     WHERE sa.complex_id = ?
       AND sa.attendance_date >= ?
       AND sa.attendance_date <= ?
       AND ${isActiveExpr}
       AND s.${column} = ?
     ORDER BY sa.attendance_date DESC, s.full_name_ar`,
  )
    .bind(complexId, range.start, range.end, entity.id)
    .all<LedgerRow>();

  return {
    ok: true,
    start_date: range.start,
    end_date: range.end,
    items: rows.results ?? [],
  };
}

type BulkUpdateItem = {
  attendance_id?: number;
  person_id?: number;
  attendance_date?: string;
  status?: string;
  circle_id?: number;
  track_id?: number;
};

/** Time O(n); Space O(1) — n = عدد التحديثات */
export async function bulkPatchAttendanceRecords(
  env: Env,
  complexId: number,
  recordedByUserId: number,
  beneficiaryType: BeneficiaryType,
  records: BulkUpdateItem[],
): Promise<{ ok: true; saved: number } | { error: string }> {
  if (!Array.isArray(records) || records.length === 0) {
    return { error: "records_required" };
  }

  let saved = 0;
  for (const rec of records) {
    const status = String(rec.status ?? "").trim() as AttendanceStatus;
    if (!["present", "absent", "excused"].includes(status)) {
      return { error: "invalid_status" };
    }

    const attendanceId = Number(rec.attendance_id);
    if (Number.isFinite(attendanceId) && attendanceId > 0) {
      const result = await patchAttendanceById(
        env,
        complexId,
        attendanceId,
        beneficiaryType,
        status,
        recordedByUserId,
      );
      if ("error" in result) return result;
      saved += 1;
      continue;
    }

    const personId = Number(rec.person_id);
    const date = rec.attendance_date?.trim();
    if (!Number.isFinite(personId) || !date) {
      return { error: "record_incomplete" };
    }

    const result = await upsertAttendanceRecord(env, complexId, recordedByUserId, {
      beneficiary_type: beneficiaryType,
      person_id: personId,
      attendance_date: date,
      status,
      circle_id: rec.circle_id,
      track_id: rec.track_id,
    });
    if ("error" in result) return result;
    saved += 1;
  }

  return { ok: true, saved };
}

/** Time O(d); Space O(1) — d = سجلات النطاق المحذوفة */
export async function bulkClearAttendanceRange(
  env: Env,
  complexId: number,
  body: {
    beneficiary_type: BeneficiaryType;
    start_date?: string;
    end_date?: string;
    attendance_date?: string;
    circle_id?: number;
    track_id?: number;
    attendance_ids?: number[];
  },
): Promise<{ ok: true; deleted: number; start_date: string; end_date: string } | { error: string }> {
  const ids = (body.attendance_ids ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (ids.length > 0) {
    const deleted = await deleteAttendanceByIds(
      env,
      complexId,
      body.beneficiary_type,
      ids,
    );
    if ("error" in deleted) return deleted;
    const range = parseDateRange(
      body.start_date,
      body.end_date,
      body.attendance_date,
    );
    const start = "error" in range ? (body.attendance_date ?? "") : range.start;
    const end = "error" in range ? start : range.end;
    return { ok: true, deleted: deleted.deleted, start_date: start, end_date: end };
  }

  const range = parseDateRange(
    body.start_date,
    body.end_date,
    body.attendance_date,
  );
  if ("error" in range) return range;

  if (body.beneficiary_type === "staff") {
    const res = await env.DB.prepare(
      `DELETE FROM staff_attendance
       WHERE complex_id = ?
         AND attendance_date >= ?
         AND attendance_date <= ?`,
    )
      .bind(complexId, range.start, range.end)
      .run();
    return {
      ok: true,
      deleted: res.meta.changes ?? 0,
      start_date: range.start,
      end_date: range.end,
    };
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
     WHERE complex_id = ?
       AND attendance_date >= ?
       AND attendance_date <= ?
       AND student_id IN (
         SELECT s.id FROM students s
         WHERE s.complex_id = ? AND ${isActiveExpr} AND s.${column} = ?
       )`,
  )
    .bind(complexId, range.start, range.end, complexId, entity.id)
    .run();

  return {
    ok: true,
    deleted: res.meta.changes ?? 0,
    start_date: range.start,
    end_date: range.end,
  };
}

async function deleteAttendanceByIds(
  env: Env,
  complexId: number,
  beneficiaryType: BeneficiaryType,
  ids: number[],
): Promise<{ ok: true; deleted: number } | { error: string }> {
  if (ids.length === 0) return { ok: true, deleted: 0 };

  const placeholders = ids.map(() => "?").join(",");
  if (beneficiaryType === "student") {
    const table = await resolveAttendanceTableName(env);
    if (!table) return { error: "migration_required" };
    const res = await env.DB.prepare(
      `DELETE FROM ${table}
       WHERE complex_id = ? AND id IN (${placeholders})`,
    )
      .bind(complexId, ...ids)
      .run();
    return { ok: true, deleted: res.meta.changes ?? 0 };
  }

  const res = await env.DB.prepare(
    `DELETE FROM staff_attendance
     WHERE complex_id = ? AND id IN (${placeholders})`,
  )
    .bind(complexId, ...ids)
    .run();
  return { ok: true, deleted: res.meta.changes ?? 0 };
}

export { parseBeneficiaryType, type AttendanceEntityType, type BeneficiaryType };
