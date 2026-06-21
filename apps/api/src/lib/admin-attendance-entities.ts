import type { Env } from "../types";
import { studentAttendanceEligibleSql, tableHasColumn } from "./db-schema";
import { PAGE_SIZE_MAX, pageMeta, parsePageParams, type PageParams } from "./pagination";
import {
  resolveAttendanceTableName,
  type AttendanceStatus,
} from "./student-attendance-db";

export type AttendanceEntityType = "circle" | "track";

export async function assertTrackInComplex(
  env: Env,
  complexId: number,
  trackId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM tracks WHERE id = ? AND complex_id = ?`,
  )
    .bind(trackId, complexId)
    .first<{ id: number }>();
  return Boolean(row);
}

export async function loadStudentsForEntityAttendance(
  env: Env,
  complexId: number,
  entity: { type: AttendanceEntityType; id: number },
  date: string,
  pageParams?: PageParams,
): Promise<
  | { items: unknown[]; attTable: string; page?: ReturnType<typeof pageMeta> }
  | { error: string; hint?: string }
> {
  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) {
    return {
      error: "migration_required",
      hint: `students.${column}`,
    };
  }

  const attTable = await resolveAttendanceTableName(env);
  if (!attTable) {
    return { error: "migration_required", hint: "student_attendance" };
  }

  const attSourceCol = (await tableHasColumn(env, attTable, "source"))
    ? ", sa.source"
    : "";
  const eligibleExpr = await studentAttendanceEligibleSql(env, "s");
  const placementCol = entity.type === "circle" ? "current_circle_id" : "current_track_id";
  const params = pageParams ?? { page: 1, pageSize: PAGE_SIZE_MAX, offset: 0 };

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM students s
     WHERE s.complex_id = ? AND ${eligibleExpr} AND s.${placementCol} = ?`,
  )
    .bind(complexId, entity.id)
    .first<{ c: number }>();
  const total = Number(countRow?.c ?? 0);

  const rows = await env.DB.prepare(
    `SELECT s.id AS student_id, s.full_name_ar,
            COALESCE(s.stage_id, 0) AS stage_id,
            sa.id AS attendance_id,
            CASE WHEN sa.id IS NOT NULL THEN 1 ELSE 0 END AS has_record,
            COALESCE(sa.status, 'present') AS status,
            sa.recorded_at${attSourceCol}
     FROM students s
     LEFT JOIN ${attTable} sa
       ON sa.student_id = s.id AND sa.attendance_date = ?
     WHERE s.complex_id = ? AND ${eligibleExpr}
       AND s.${placementCol} = ?
     ORDER BY s.full_name_ar
     LIMIT ? OFFSET ?`,
  )
    .bind(date, complexId, entity.id, params.pageSize, params.offset)
    .all();

  return {
    items: rows.results ?? [],
    attTable,
    page: pageMeta(total, params),
  };
}

export async function studentBelongsToEntity(
  env: Env,
  complexId: number,
  studentId: number,
  entity: { type: AttendanceEntityType; id: number },
): Promise<boolean> {
  const isActiveExpr = await studentAttendanceEligibleSql(env, "");
  const column =
    entity.type === "circle" ? "current_circle_id" : "current_track_id";
  if (!(await tableHasColumn(env, "students", column))) return false;

  const row = await env.DB.prepare(
    `SELECT id FROM students
     WHERE id = ? AND complex_id = ? AND ${isActiveExpr} AND ${column} = ?`,
  )
    .bind(studentId, complexId, entity.id)
    .first<{ id: number }>();
  return Boolean(row);
}

export function parseAttendanceEntity(body: {
  circle_id?: number;
  track_id?: number;
}): { type: AttendanceEntityType; id: number } | null {
  const circleId =
    body.circle_id != null ? Number(body.circle_id) : Number.NaN;
  const trackId = body.track_id != null ? Number(body.track_id) : Number.NaN;
  const hasCircle = Number.isFinite(circleId) && circleId > 0;
  const hasTrack = Number.isFinite(trackId) && trackId > 0;
  if (hasCircle && hasTrack) return null;
  if (hasCircle) return { type: "circle", id: circleId };
  if (hasTrack) return { type: "track", id: trackId };
  return null;
}

export function isAttendanceStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim();
  if (s === "present" || s === "absent" || s === "excused") return s;
  return null;
}

/** O(E×S) — حالة «محضّر اليوم» لكل حلقة/مسار (كل الطلاب المؤهلين لهم سجل). */
export async function loadEntityAttendanceStatus(
  env: Env,
  complexId: number,
  date: string,
): Promise<{
  circles: Array<{ id: number; marked: boolean }>;
  tracks: Array<{ id: number; marked: boolean }>;
}> {
  const attTable = await resolveAttendanceTableName(env);
  const circles: Array<{ id: number; marked: boolean }> = [];
  const tracks: Array<{ id: number; marked: boolean }> = [];
  if (!attTable) return { circles, tracks };

  const eligibleExpr = await studentAttendanceEligibleSql(env, "s");

  if (await tableHasColumn(env, "students", "current_circle_id")) {
    const rows = await env.DB.prepare(
      `SELECT c.id,
              (SELECT COUNT(*) FROM students s
               WHERE s.complex_id = ? AND s.current_circle_id = c.id AND ${eligibleExpr}) AS roster,
              (SELECT COUNT(*) FROM students s
               INNER JOIN ${attTable} sa
                 ON sa.student_id = s.id AND sa.attendance_date = ?
               WHERE s.complex_id = ? AND s.current_circle_id = c.id AND ${eligibleExpr}) AS marked
       FROM circles c
       WHERE c.complex_id = ? AND COALESCE(c.is_active, 1) = 1`,
    )
      .bind(complexId, date, complexId, complexId)
      .all<{ id: number; roster: number; marked: number }>();
    for (const r of rows.results ?? []) {
      const roster = Number(r.roster ?? 0);
      const marked = Number(r.marked ?? 0);
      circles.push({
        id: r.id,
        marked: roster > 0 && marked >= roster,
      });
    }
  }

  if (await tableHasColumn(env, "students", "current_track_id")) {
    const rows = await env.DB.prepare(
      `SELECT t.id,
              (SELECT COUNT(*) FROM students s
               WHERE s.complex_id = ? AND s.current_track_id = t.id AND ${eligibleExpr}) AS roster,
              (SELECT COUNT(*) FROM students s
               INNER JOIN ${attTable} sa
                 ON sa.student_id = s.id AND sa.attendance_date = ?
               WHERE s.complex_id = ? AND s.current_track_id = t.id AND ${eligibleExpr}) AS marked
       FROM tracks t
       WHERE t.complex_id = ? AND COALESCE(t.is_active, 1) = 1`,
    )
      .bind(complexId, date, complexId, complexId)
      .all<{ id: number; roster: number; marked: number }>();
    for (const r of rows.results ?? []) {
      const roster = Number(r.roster ?? 0);
      const marked = Number(r.marked ?? 0);
      tracks.push({
        id: r.id,
        marked: roster > 0 && marked >= roster,
      });
    }
  }

  return { circles, tracks };
}
