import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import { resolveAttendanceTableName } from "./student-attendance-db";

export type SemesterSnapshotPayload = {
  attendance: unknown[];
  recitation: unknown[];
  competitions: unknown[];
};

/** Time O(a+r+c) row scans; Space O(a+r+c) JSON buffers. */
export async function buildSemesterSnapshotPayload(
  env: Env,
  complexId: number,
  startDate: string,
  endDate: string,
): Promise<SemesterSnapshotPayload> {
  const attendance: unknown[] = [];
  const attTable = await resolveAttendanceTableName(env);
  if (attTable) {
    const rows = await env.DB.prepare(
      `SELECT sa.student_id, s.full_name_ar, sa.attendance_date, sa.status,
              sa.circle_id, sa.track_id, sa.source, sa.recorded_at
       FROM ${attTable} sa
       INNER JOIN students s ON s.id = sa.student_id AND s.complex_id = sa.complex_id
       WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
       ORDER BY sa.attendance_date, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, startDate, endDate)
      .all();
    attendance.push(...(rows.results ?? []));
  }

  const recitation: unknown[] = [];
  if (await hasTable(env, "edu_daily_recitation")) {
    const hasComplexCol = await tableHasColumn(env, "edu_daily_recitation", "complex_id");
    const complexFilter = hasComplexCol
      ? "dr.complex_id = ?"
      : "s.complex_id = ?";
    const rows = await env.DB.prepare(
      `SELECT dr.student_id, s.full_name_ar, dr.recitation_date,
              dr.listened, dr.repeated, dr.revised, dr.error_count,
              dr.tune_errors, dr.circle_id, dr.notes
       FROM edu_daily_recitation dr
       INNER JOIN students s ON s.id = dr.student_id
       WHERE ${complexFilter} AND dr.recitation_date BETWEEN ? AND ?
       ORDER BY dr.recitation_date, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, startDate, endDate)
      .all();
    recitation.push(...(rows.results ?? []));
  }

  const competitions: unknown[] = [];
  if (await hasTable(env, "competition_logs")) {
    const hasMetrics = await tableHasColumn(env, "competition_logs", "metrics_json");
    const hasSource = await tableHasColumn(env, "competition_logs", "source");
    const metricsCol = hasMetrics ? "cl.metrics_json" : "NULL AS metrics_json";
    const sourceCol = hasSource ? "cl.source" : "NULL AS source";
    const rows = await env.DB.prepare(
      `SELECT cl.competition_id, c.name_ar AS competition_name,
              cl.student_id, s.full_name_ar, cl.task_id, cl.log_date,
              cl.points, cl.notes, ${metricsCol}, ${sourceCol}, cl.recorded_at
       FROM competition_logs cl
       INNER JOIN students s ON s.id = cl.student_id
       LEFT JOIN competitions c ON c.id = cl.competition_id
       WHERE s.complex_id = ? AND cl.log_date BETWEEN ? AND ?
       ORDER BY cl.log_date, cl.competition_id, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, startDate, endDate)
      .all();
    competitions.push(...(rows.results ?? []));
  } else if (await hasTable(env, "competition_targets")) {
    const rows = await env.DB.prepare(
      `SELECT ct.competition_id, c.name_ar AS competition_name,
              ct.student_id, s.full_name_ar,
              ct.current_memorization, ct.target_amount, ct.achieved_amount,
              ct.synced_at, ct.created_at
       FROM competition_targets ct
       INNER JOIN students s ON s.id = ct.student_id
       LEFT JOIN competitions c ON c.id = ct.competition_id
       WHERE s.complex_id = ?
       ORDER BY ct.competition_id, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId)
      .all();
    competitions.push(...(rows.results ?? []));
  }

  return { attendance, recitation, competitions };
}

/** Time O(a+r+c) build + O(1) insert; Space O(a+r+c). */
export async function persistSemesterHistoricalSnapshot(
  env: Env,
  complexId: number,
  closedByUserId: number,
  startDate: string,
  endDate: string,
): Promise<number | null> {
  if (!(await hasTable(env, "semester_historical_snapshots"))) {
    return null;
  }

  const payload = await buildSemesterSnapshotPayload(
    env,
    complexId,
    startDate,
    endDate,
  );

  const ins = await env.DB.prepare(
    `INSERT INTO semester_historical_snapshots (
       complex_id, semester_start_date, semester_end_date, closed_by_user_id,
       snapshot_attendance_json, snapshot_recitation_json, snapshot_competitions_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      complexId,
      startDate,
      endDate,
      closedByUserId,
      JSON.stringify(payload.attendance),
      JSON.stringify(payload.recitation),
      JSON.stringify(payload.competitions),
    )
    .run();

  return Number(ins.meta.last_row_id ?? 0) || null;
}
