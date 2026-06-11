import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import {
  bulkUpsertCompetitionDayLogs,
  competitionTaskSelectSql,
  hasCriterionId,
  hasEngineLogs,
  hasEngineTasks,
  hasTaskInputType,
  type CompetitionGradingSource,
} from "./competition-engine";
import { buildCompetitionTasksSnapshot } from "./edu-evaluation-standard";

export type GradingRecordInput = {
  student_id: number;
  task_id: number;
  points: number;
};

export type GradingStudentSaveInput = {
  student_id: number;
  records?: GradingRecordInput[];
  juz_done?: number;
  metrics?: Record<string, unknown>;
};

export type SaveCompetitionGradingOptions = {
  logDate: string;
  recordedByUserId: number | null;
  source: CompetitionGradingSource;
  /** When true, merge task records into metrics_json.task_points only (no per-task rows). */
  metricsOnly?: boolean;
};

/**
 * O(S + R) time, O(S) space — S students, R total task records.
 * One batched upsert per chunk; single row per (competition, student, day).
 */
export async function saveCompetitionGradingBulk(
  env: Env,
  competitionId: number,
  students: GradingStudentSaveInput[],
  options: SaveCompetitionGradingOptions,
): Promise<number> {
  if (!(await hasEngineLogs(env))) return 0;
  const hasMetricsJson = await tableHasColumn(env, "competition_logs", "metrics_json");
  if (!hasMetricsJson) return 0;

  const valid = students.filter((s) => Number(s.student_id) > 0);
  if (!valid.length) return 0;

  const byStudent = new Map<number, GradingStudentSaveInput>();
  for (const row of valid) {
    const sid = Number(row.student_id);
    const prev = byStudent.get(sid);
    if (!prev) {
      byStudent.set(sid, {
        student_id: sid,
        records: [...(row.records ?? [])],
        juz_done: row.juz_done,
        metrics: row.metrics ? { ...row.metrics } : undefined,
      });
      continue;
    }
    if (row.records?.length) prev.records = [...(prev.records ?? []), ...row.records];
    if (row.juz_done != null) prev.juz_done = row.juz_done;
    if (row.metrics) prev.metrics = { ...(prev.metrics ?? {}), ...row.metrics };
  }

  let tasksSnapshot: string | null = null;
  const hasTasksSnapshot = await tableHasColumn(env, "competition_logs", "tasks_snapshot");
  if (hasTasksSnapshot && (await hasEngineTasks(env))) {
    const hasInputType = await hasTaskInputType(env);
    const hasCritId = await hasCriterionId(env);
    const taskCols = competitionTaskSelectSql(hasInputType, hasCritId).replace(
      ", created_at",
      "",
    );
    const taskRows = await env.DB.prepare(
      `SELECT ${taskCols}
       FROM competition_tasks WHERE competition_id = ?
       ORDER BY sort_order, id`,
    )
      .bind(competitionId)
      .all<{
        id: number;
        name_ar: string;
        weight: number;
        type: string;
        input_type?: string;
        criterion_id?: string | null;
      }>();
    tasksSnapshot = buildCompetitionTasksSnapshot(taskRows.results ?? []);
  }

  const upsertRows: Array<{
    student_id: number;
    metrics: Record<string, unknown>;
    tasks_snapshot: string | null;
  }> = [];

  for (const row of byStudent.values()) {
    const taskPoints: Record<string, number> = {};
    for (const rec of row.records ?? []) {
      const tid = Number(rec.task_id);
      if (!tid) continue;
      taskPoints[String(tid)] = Number(rec.points ?? 0);
    }

    const metrics: Record<string, unknown> = {
      ...(row.metrics ?? {}),
      task_points: {
        ...((row.metrics?.task_points as Record<string, number>) ?? {}),
        ...taskPoints,
      },
    };
    if (row.juz_done !== undefined) {
      metrics.juz_done = Number(row.juz_done) || 0;
    } else if (row.metrics?.juz_done !== undefined) {
      metrics.juz_done = Number(row.metrics.juz_done) || 0;
    }

    upsertRows.push({
      student_id: row.student_id,
      metrics,
      tasks_snapshot: tasksSnapshot,
    });
  }

  await bulkUpsertCompetitionDayLogs(
    env,
    competitionId,
    options.logDate,
    upsertRows,
    options.recordedByUserId,
    options.source,
  );

  return upsertRows.length;
}
