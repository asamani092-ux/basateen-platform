import type { EvalCriterion, TaskScores } from "./evaluation-criteria";
import {
  activeCriteria,
  totalEnabledMaxScore,
  totalEnabledWeight,
} from "./evaluation-criteria";
import type { TaskInputType, TaskType } from "./competition-engine";

export type CompetitionTaskSeed = {
  name_ar: string;
  weight: number;
  type: TaskType;
  input_type: TaskInputType;
  criterion_id: string;
  sort_order: number;
};

/** O(n) — n = criteria count; maps enabled evaluation criteria to competition tasks. */
export function criteriaToCompetitionTasks(
  criteria: EvalCriterion[],
): CompetitionTaskSeed[] {
  const enabled = activeCriteria(criteria);
  return enabled.map((c, idx) => ({
    name_ar: c.name,
    weight: Number(c.max_weight) || 1,
    type: c.type === "penalty" ? "deduction" : "addition",
    input_type: criterionInputToTaskInput(c),
    criterion_id: c.id,
    sort_order: idx + 1,
  }));
}

/** O(1) */
export function criterionInputToTaskInput(c: EvalCriterion): TaskInputType {
  if (c.input_type === "counter") return "counter";
  if (c.input_type === "numeric") return "numeric";
  if (c.type === "penalty") return "counter";
  return c.input === "number" ? "numeric" : "boolean";
}

export type CompetitionTaskSnapshotRow = {
  id: number;
  name_ar: string;
  weight: number;
  type: string;
  input_type?: string | null;
  criterion_id?: string | null;
};

/** O(K) — freeze competition tasks at grading time; Space O(K) */
export function buildCompetitionTasksSnapshot(
  tasks: CompetitionTaskSnapshotRow[],
): string {
  return JSON.stringify(
    tasks.map((t) => ({
      id: t.id,
      name_ar: t.name_ar,
      weight: Number(t.weight ?? 1),
      type: t.type,
      input_type: t.input_type ?? "boolean",
      criterion_id: t.criterion_id ?? null,
    })),
  );
}

export type CompTaskMeta = {
  id: number;
  weight: number;
  type: string;
  criterion_id?: string | null;
};

export type CompLogRow = {
  student_id: number;
  task_id: number;
  log_date: string;
  points: number;
};

export type LeaderboardRow = {
  student_id: number;
  earned_score: number;
  grading_days: number;
  overall_pct: number;
};

/**
 * O(L) time, O(S) space — L = log rows, S = students with logs.
 * overall_pct = (earned ÷ (grading_days × enabled_weight_sum)) × 100
 */
export function computeLeaderboardFromLogs(
  logs: CompLogRow[],
  tasks: CompTaskMeta[],
  enabledWeightSum: number,
): Map<number, LeaderboardRow> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const earnedByStudent = new Map<number, number>();
  const daysByStudent = new Map<number, Set<string>>();

  for (const log of logs) {
    const task = taskMap.get(log.task_id);
    if (!task) continue;
    const weight = Number(task.weight ?? 1);
    const points = Number(log.points ?? 0);
    const signed =
      task.type === "deduction"
        ? -Math.abs(points) * weight
        : Math.abs(points) * weight;
    earnedByStudent.set(
      log.student_id,
      (earnedByStudent.get(log.student_id) ?? 0) + signed,
    );
    const daySet = daysByStudent.get(log.student_id) ?? new Set<string>();
    daySet.add(log.log_date);
    daysByStudent.set(log.student_id, daySet);
  }

  const out = new Map<number, LeaderboardRow>();
  const denomBase = Math.max(0, enabledWeightSum);
  for (const [studentId, earned] of earnedByStudent) {
    const gradingDays = Math.max(1, daysByStudent.get(studentId)?.size ?? 0);
    const denominator = gradingDays * denomBase;
    const overallPct =
      denominator > 0
        ? Math.round(Math.max(0, (earned / denominator) * 1000)) / 10
        : 0;
    out.set(studentId, {
      student_id: studentId,
      earned_score: Math.round(earned * 100) / 100,
      grading_days: gradingDays,
      overall_pct: overallPct,
    });
  }
  return out;
}

/** O(1) — sum enabled addition task weights from competition_tasks rows. */
export function enabledCompetitionWeightSum(tasks: CompTaskMeta[]): number {
  return tasks
    .filter((t) => t.type !== "deduction")
    .reduce((sum, t) => sum + Number(t.weight ?? 1), 0);
}

/** O(1) — faces entered in memorization task → juz (20 faces per juz). */
export function memorizationPointsToJuz(points: number): number {
  const faces = Math.max(0, Number(points) || 0);
  return Math.round((faces / 20) * 100) / 100;
}

/** O(L) — aggregate memorization task log points per student. */
export function sumMemorizationLogPoints(
  logs: CompLogRow[],
  memorizationTaskId: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const log of logs) {
    if (log.task_id !== memorizationTaskId) continue;
    const pts = Math.max(0, Number(log.points) || 0);
    out.set(log.student_id, (out.get(log.student_id) ?? 0) + pts);
  }
  return out;
}

/** O(n) — remap legacy task score keys to unified ids. */
export function normalizeTaskScoreKeys(
  scores: TaskScores,
): TaskScores {
  const out: TaskScores = { ...scores };
  if (out.faces != null && out.memorization == null) {
    out.memorization = Number(out.faces);
  }
  if (out.rabt != null && out.linking == null) {
    out.linking = typeof out.rabt === "boolean" ? (out.rabt ? 1 : 0) : Number(out.rabt);
  }
  return out;
}

export {
  convertToFaces,
  facesToJuz,
  formatFacesToText,
  parseMemorizationTextToFaces,
  parseQuranUnit,
  resolveMemorizationFields,
  type QuranUnit,
} from "./quran-memorization";

export { activeCriteria, totalEnabledMaxScore, totalEnabledWeight };
