import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import { getOrLoadCached, WORKER_CACHE_TTL_MS } from "./worker-memory-cache";

export type EvalCriterionType = "points" | "penalty";
/** Unified input mode stored in evaluation_criteria_json */
export type EvalInputType = "boolean" | "numeric" | "counter";
/** Legacy alias kept for UI backward compatibility */
export type EvalInputMode = "boolean" | "number";

export type EvalCriterion = {
  id: string;
  name: string;
  type: EvalCriterionType;
  max_weight: number;
  input_type?: EvalInputType;
  input?: EvalInputMode;
  /** When false the task is excluded from daily max and grading grids */
  enabled?: boolean;
  /** Bonus points when all listed task ids are satisfied */
  requires_all?: string[];
};

export type TaskScores = Record<string, boolean | number>;

export type TasksSnapshotCriterion = {
  id: string;
  name: string;
  type: EvalCriterionType;
  max_weight: number;
  input_type: EvalInputType;
  enabled?: boolean;
  requires_all?: string[];
};

/** Unified default: حضور، حفظ، استماع، تكرار، ربط، مراجعة */
export const DEFAULT_EVALUATION_CRITERIA: EvalCriterion[] = [
  {
    id: "attendance",
    name: "حضور",
    type: "points",
    max_weight: 1,
    input_type: "boolean",
    input: "boolean",
    enabled: true,
  },
  {
    id: "memorization",
    name: "حفظ",
    type: "points",
    max_weight: 2,
    input_type: "numeric",
    input: "number",
    enabled: true,
  },
  {
    id: "listening",
    name: "استماع",
    type: "points",
    max_weight: 1,
    input_type: "boolean",
    input: "boolean",
    enabled: true,
  },
  {
    id: "repeat",
    name: "تكرار",
    type: "points",
    max_weight: 1,
    input_type: "boolean",
    input: "boolean",
    enabled: true,
  },
  {
    id: "linking",
    name: "ربط",
    type: "points",
    max_weight: 1,
    input_type: "numeric",
    input: "number",
    enabled: true,
  },
  {
    id: "revision",
    name: "مراجعة",
    type: "points",
    max_weight: 1,
    input_type: "boolean",
    input: "boolean",
    enabled: true,
  },
];

const LEGACY_ID_MAP: Record<string, string> = {
  faces: "memorization",
  rabt: "linking",
  error: "error",
  tune: "tune",
};

/** O(1) — map legacy input / type to unified input_type */
export function criterionToInputType(c: {
  type?: EvalCriterionType;
  input_type?: EvalInputType;
  input?: EvalInputMode;
}): EvalInputType {
  if (
    c.input_type === "boolean" ||
    c.input_type === "numeric" ||
    c.input_type === "counter"
  ) {
    return c.input_type;
  }
  if (c.type === "penalty") return "counter";
  if (c.input === "number") return "numeric";
  return "boolean";
}

/** O(1) — normalize id, input_type, and legacy input alias */
export function normalizeCriterion(c: EvalCriterion): EvalCriterion {
  const id = LEGACY_ID_MAP[String(c.id).trim()] ?? String(c.id).trim();
  const input_type = criterionToInputType(c);
  const input: EvalInputMode = input_type === "numeric" ? "number" : "boolean";
  return {
    ...c,
    id,
    name: String(c.name).trim(),
    type: c.type === "penalty" ? "penalty" : "points",
    max_weight: Number(c.max_weight),
    enabled: c.enabled !== false,
    input_type,
    input,
    requires_all: Array.isArray(c.requires_all)
      ? c.requires_all.map((r) => LEGACY_ID_MAP[String(r)] ?? String(r))
      : undefined,
  };
}

/** O(n) — criteria with enabled !== false */
export function activeCriteria(criteria: EvalCriterion[]): EvalCriterion[] {
  return criteria.filter((c) => c.enabled !== false);
}

export function parseEvaluationCriteria(
  raw: string | null | undefined,
): EvalCriterion[] {
  if (!raw?.trim()) return [...DEFAULT_EVALUATION_CRITERIA];
  try {
    const parsed = JSON.parse(raw) as EvalCriterion[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...DEFAULT_EVALUATION_CRITERIA];
    }
    return parsed
      .filter((c) => c?.id && c?.name && c?.type && Number.isFinite(Number(c.max_weight)))
      .map((c) => normalizeCriterion(c as EvalCriterion));
  } catch {
    return [...DEFAULT_EVALUATION_CRITERIA];
  }
}

/** O(n) — serialize criteria for persistence with unified input_type */
export function serializeEvaluationCriteria(criteria: EvalCriterion[]): string {
  return JSON.stringify(
    criteria.map((c) => {
      const n = normalizeCriterion(c);
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        max_weight: n.max_weight,
        input_type: n.input_type,
        enabled: n.enabled !== false,
        requires_all: n.requires_all,
      };
    }),
  );
}

export function criteriaFromLegacyWeights(row: {
  weight_listening?: number;
  weight_revision?: number;
  weight_repeat?: number;
  rabt_weight?: number;
  penalty_per_error?: number;
}): EvalCriterion[] {
  const pen = Number(row.penalty_per_error ?? 0.5);
  return [
    {
      id: "attendance",
      name: "حضور",
      type: "points",
      max_weight: 1,
      input_type: "boolean",
      input: "boolean",
      enabled: true,
    },
    {
      id: "memorization",
      name: "حفظ",
      type: "points",
      max_weight: 1,
      input_type: "numeric",
      input: "number",
      enabled: true,
    },
    {
      id: "listening",
      name: "استماع",
      type: "points",
      max_weight: Number(row.weight_listening ?? 1),
      input_type: "boolean",
      input: "boolean",
      enabled: true,
    },
    {
      id: "repeat",
      name: "التكرار",
      type: "points",
      max_weight: Number(row.weight_repeat ?? 1),
      input_type: "boolean",
      input: "boolean",
      enabled: true,
    },
    {
      id: "linking",
      name: "الربط",
      type: "points",
      max_weight: Number(row.rabt_weight ?? 1),
      input_type: "numeric",
      input: "number",
      enabled: true,
    },
    {
      id: "revision",
      name: "المراجعة",
      type: "points",
      max_weight: Number(row.weight_revision ?? 1),
      input_type: "boolean",
      input: "boolean",
      enabled: true,
    },
    {
      id: "error",
      name: "الخطأ",
      type: "penalty",
      max_weight: pen,
      input_type: "counter",
      input: "number",
      enabled: true,
    },
    {
      id: "tune",
      name: "اللحن",
      type: "penalty",
      max_weight: pen,
      input_type: "counter",
      input: "number",
      enabled: true,
    },
  ];
}

export function totalPositiveWeight(criteria: EvalCriterion[]): number {
  return activeCriteria(criteria)
    .filter((c) => c.type === "points" && !c.requires_all?.length)
    .reduce((sum, c) => sum + c.max_weight, 0);
}

export function totalEnabledWeight(criteria: EvalCriterion[]): number {
  return totalPositiveWeight(criteria);
}

export function totalMaxScore(criteria: EvalCriterion[]): number {
  return activeCriteria(criteria)
    .filter((c) => c.type === "points")
    .reduce((sum, c) => sum + c.max_weight, 0);
}

export function totalEnabledMaxScore(criteria: EvalCriterion[]): number {
  return totalMaxScore(criteria);
}

export function computeQualityFromCriteria(
  taskScores: TaskScores,
  criteria: EvalCriterion[],
): number {
  const active = activeCriteria(criteria);
  let earned = 0;
  let penalties = 0;
  const maxScore = totalEnabledMaxScore(criteria);

  for (const c of active) {
    const raw = taskScores[c.id];
    const inputType = criterionToInputType(c);
    if (c.type === "penalty" || inputType === "counter") {
      penalties += c.max_weight * Math.max(0, Number(raw ?? 0));
      continue;
    }
    if (c.requires_all?.length) {
      const allDone = c.requires_all.every((id) => Boolean(taskScores[id]));
      if (allDone) earned += c.max_weight;
      continue;
    }
    if (inputType === "numeric") {
      earned += Math.min(Math.max(0, Number(raw ?? 0)), c.max_weight);
    } else if (Boolean(raw)) {
      earned += c.max_weight;
    }
  }

  const raw = maxScore > 0 ? ((earned - penalties) / maxScore) * 100 : 0;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

/** O(n) — freeze active criteria at grading time; Space O(n) */
export function buildTasksSnapshot(criteria: EvalCriterion[]): string {
  const snapshot: TasksSnapshotCriterion[] = activeCriteria(criteria).map((c) => {
    const n = normalizeCriterion(c);
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      max_weight: n.max_weight,
      input_type: n.input_type!,
      enabled: n.enabled !== false,
      requires_all: n.requires_all,
    };
  });
  return JSON.stringify(snapshot);
}

/** O(n) — parse stored snapshot; returns null when absent/invalid */
export function parseTasksSnapshot(
  raw: string | null | undefined,
): EvalCriterion[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as TasksSnapshotCriterion[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed
      .filter((c) => c?.id && c?.name && Number.isFinite(Number(c.max_weight)))
      .map((c) =>
        normalizeCriterion({
          id: String(c.id),
          name: String(c.name),
          type: c.type === "penalty" ? "penalty" : "points",
          max_weight: Number(c.max_weight),
          input_type: c.input_type,
          enabled: c.enabled !== false,
          requires_all: c.requires_all,
        }),
      );
  } catch {
    return null;
  }
}

/** O(n) — prefer historical snapshot over current settings */
export function criteriaForRecord(
  snapshotRaw: string | null | undefined,
  current: EvalCriterion[],
): EvalCriterion[] {
  return parseTasksSnapshot(snapshotRaw) ?? current;
}

/** O(n) — quality using snapshot when present */
export function computeQualityForRecord(
  taskScores: TaskScores,
  snapshotRaw: string | null | undefined,
  current: EvalCriterion[],
): number {
  return computeQualityFromCriteria(
    taskScores,
    criteriaForRecord(snapshotRaw, current),
  );
}

export function legacyRowToTaskScores(row: {
  listened?: number | boolean;
  repeated?: number | boolean;
  revised?: number | boolean;
  error_count?: number;
  tune_errors?: number;
  face_count?: number;
}): TaskScores {
  return {
    attendance: false,
    listening: Boolean(row.listened),
    repeat: Boolean(row.repeated),
    revision: Boolean(row.revised),
    linking: 0,
    memorization: Number(row.face_count ?? 0),
    error: Number(row.error_count ?? 0),
    tune: Number(row.tune_errors ?? 0),
  };
}

export function taskScoresToLegacyColumns(
  taskScores: TaskScores,
  criteria: EvalCriterion[],
): {
  listened: number;
  repeated: number;
  revised: number;
  error_count: number;
  tune_errors: number;
  face_count: number;
} {
  const byId = (id: string, fallback = 0): number => {
    const v = taskScores[id];
    if (typeof v === "boolean") return v ? 1 : 0;
    return Math.max(0, Number(v ?? fallback));
  };
  void criteria;
  return {
    listened: byId("listening"),
    repeated: byId("repeat"),
    revised: byId("revision"),
    error_count: byId("error"),
    tune_errors: byId("tune"),
    face_count: byId("memorization", byId("faces")),
  };
}

export function parseTaskScoresJson(
  raw: string | null | undefined,
  legacy?: {
    listened?: number | boolean;
    repeated?: number | boolean;
    revised?: number | boolean;
    error_count?: number;
    tune_errors?: number;
    face_count?: number;
  },
): TaskScores {
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as TaskScores;
      if (parsed && typeof parsed === "object") {
        const out = { ...parsed };
        if (out.faces != null && out.memorization == null) {
          out.memorization = Number(out.faces);
        }
        if (out.rabt != null && out.linking == null) {
          out.linking =
            typeof out.rabt === "boolean" ? (out.rabt ? 1 : 0) : Number(out.rabt);
        }
        return out;
      }
    } catch {
      /* fall through */
    }
  }
  if (legacy) return legacyRowToTaskScores(legacy);
  return {};
}

async function loadEvaluationCriteriaFromDb(
  env: Env,
  complexId: number,
): Promise<EvalCriterion[]> {
  const hasJson = await tableHasColumn(env, "edu_settings", "evaluation_criteria_json");
  const hasRabt = await tableHasColumn(env, "edu_settings", "rabt_weight");
  if (!hasJson) {
    const row = await env.DB.prepare(
      hasRabt
        ? `SELECT weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error
           FROM edu_settings WHERE complex_id = ?`
        : `SELECT weight_listening, weight_revision, weight_repeat, penalty_per_error
           FROM edu_settings WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first<Record<string, number>>();
    return criteriaFromLegacyWeights(row ?? {});
  }
  const row = await env.DB.prepare(
    `SELECT evaluation_criteria_json${
      hasRabt
        ? ", weight_listening, weight_revision, weight_repeat, rabt_weight, penalty_per_error"
        : ", weight_listening, weight_revision, weight_repeat, penalty_per_error"
    } FROM edu_settings WHERE complex_id = ?`,
  )
    .bind(complexId)
    .first<{
      evaluation_criteria_json?: string | null;
      weight_listening?: number;
      weight_revision?: number;
      weight_repeat?: number;
      rabt_weight?: number;
      penalty_per_error?: number;
    }>();
  if (row?.evaluation_criteria_json) {
    return parseEvaluationCriteria(row.evaluation_criteria_json);
  }
  return criteriaFromLegacyWeights(row ?? {});
}

export async function loadEvaluationCriteria(
  env: Env,
  complexId: number,
): Promise<EvalCriterion[]> {
  return getOrLoadCached(
    `evaluation_criteria:${complexId}`,
    () => loadEvaluationCriteriaFromDb(env, complexId),
    WORKER_CACHE_TTL_MS,
  );
}

export function newCriterionId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
