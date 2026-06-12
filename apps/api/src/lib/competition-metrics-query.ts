import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";

/** Aggregated competition_log metrics_json totals per student (for edu reports). */
export type StudentCompetitionMetricsTotals = {
  student_id: number;
  faces_read: number;
  juz_done: number;
  error_count: number;
  tune_errors: number;
  alerts_count: number;
  log_days: number;
};

export type CompetitionMetricsQueryParams = {
  competitionId: number;
  studentIds?: number[];
  dateFrom?: string;
  dateTo?: string;
};

/**
 * D1/SQLite JSON aggregation — sums faces, errors, and alerts from metrics_json.
 * Time O(R) DB scan; Space O(S) students in result.
 */
export function buildCompetitionMetricsAggregationSql(): string {
  const facesExpr = `COALESCE(
    CAST(JSON_EXTRACT(metrics_json, '$.faces_read') AS REAL),
    CAST(JSON_EXTRACT(metrics_json, '$.juz_done') AS REAL),
    0
  )`;
  const errorsExpr = `COALESCE(
    CAST(JSON_EXTRACT(metrics_json, '$.error_count') AS REAL),
    CAST(JSON_EXTRACT(metrics_json, '$.errors') AS REAL),
    0
  )`;
  const alertsExpr = `COALESCE(
    CAST(JSON_EXTRACT(metrics_json, '$.alerts') AS REAL),
    CAST(JSON_EXTRACT(metrics_json, '$.alert_count') AS REAL),
    0
  )`;
  const tuneExpr = `COALESCE(CAST(JSON_EXTRACT(metrics_json, '$.tune_errors') AS REAL), 0)`;
  const juzExpr = `COALESCE(CAST(JSON_EXTRACT(metrics_json, '$.juz_done') AS REAL), 0)`;

  return `SELECT
    student_id,
    SUM(${facesExpr}) AS faces_read,
    SUM(${juzExpr}) AS juz_done,
    SUM(${errorsExpr}) AS error_count,
    SUM(${tuneExpr}) AS tune_errors,
    SUM(${alertsExpr}) AS alerts_count,
    COUNT(DISTINCT log_date) AS log_days
  FROM competition_logs`;
}

function mapMetricsRow(row: Record<string, unknown>): StudentCompetitionMetricsTotals {
  return {
    student_id: Number(row.student_id),
    faces_read: Number(row.faces_read ?? 0),
    juz_done: Number(row.juz_done ?? 0),
    error_count: Number(row.error_count ?? 0),
    tune_errors: Number(row.tune_errors ?? 0),
    alerts_count: Number(row.alerts_count ?? 0),
    log_days: Number(row.log_days ?? 0),
  };
}

/**
 * Loads per-student JSON metric totals for competitions reporting dashboards.
 * Returns empty array when engine logs / metrics_json column is unavailable.
 */
export async function fetchStudentCompetitionMetricsTotals(
  env: Env,
  params: CompetitionMetricsQueryParams,
): Promise<StudentCompetitionMetricsTotals[]> {
  if (!(await hasTable(env, "competition_logs"))) return [];
  const hasMetricsJson = await tableHasColumn(env, "competition_logs", "metrics_json");
  if (!hasMetricsJson) return [];

  const binds: Array<string | number> = [params.competitionId];
  let sql = `${buildCompetitionMetricsAggregationSql()}
    WHERE competition_id = ?
      AND metrics_json IS NOT NULL
      AND TRIM(metrics_json) != ''
      AND TRIM(metrics_json) != '{}'`;

  if (params.dateFrom) {
    sql += ` AND log_date >= ?`;
    binds.push(params.dateFrom);
  }
  if (params.dateTo) {
    sql += ` AND log_date <= ?`;
    binds.push(params.dateTo);
  }
  const studentIds = (params.studentIds ?? []).filter((id) => id > 0);
  if (studentIds.length > 0) {
    sql += ` AND student_id IN (${studentIds.map(() => "?").join(",")})`;
    binds.push(...studentIds);
  }

  sql += ` GROUP BY student_id ORDER BY student_id`;

  const rows = await env.DB.prepare(sql)
    .bind(...binds)
    .all<Record<string, unknown>>();

  return (rows.results ?? []).map(mapMetricsRow);
}

/** Map keyed by student_id for report merge pipelines. Time O(S); Space O(S). */
export async function fetchStudentCompetitionMetricsMap(
  env: Env,
  params: CompetitionMetricsQueryParams,
): Promise<Map<number, StudentCompetitionMetricsTotals>> {
  const list = await fetchStudentCompetitionMetricsTotals(env, params);
  const out = new Map<number, StudentCompetitionMetricsTotals>();
  for (const row of list) out.set(row.student_id, row);
  return out;
}
