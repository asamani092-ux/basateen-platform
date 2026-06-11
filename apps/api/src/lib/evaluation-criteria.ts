import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";

export type EvalCriterionType = "points" | "penalty";
export type EvalInputMode = "boolean" | "number";

export type EvalCriterion = {
  id: string;
  name: string;
  type: EvalCriterionType;
  max_weight: number;
  input?: EvalInputMode;
  /** When false the task is excluded from daily max and grading grids */
  enabled?: boolean;
  /** Bonus points when all listed task ids are satisfied */
  requires_all?: string[];
};

export type TaskScores = Record<string, boolean | number>;

/** Unified default: حضور، حفظ، استماع، تكرار، ربط، مراجعة */
export const DEFAULT_EVALUATION_CRITERIA: EvalCriterion[] = [
  { id: "attendance", name: "حضور", type: "points", max_weight: 1, input: "boolean", enabled: true },
  { id: "memorization", name: "حفظ", type: "points", max_weight: 2, input: "number", enabled: true },
  { id: "listening", name: "استماع", type: "points", max_weight: 1, input: "boolean", enabled: true },
  { id: "repeat", name: "تكرار", type: "points", max_weight: 1, input: "boolean", enabled: true },
  { id: "linking", name: "ربط", type: "points", max_weight: 1, input: "number", enabled: true },
  { id: "revision", name: "مراجعة", type: "points", max_weight: 1, input: "boolean", enabled: true },
];

const LEGACY_ID_MAP: Record<string, string> = {
  faces: "memorization",
  rabt: "linking",
  error: "error",
  tune: "tune",
};

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
      .map((c) => {
        const id = String(c.id).trim();
        const mappedId = LEGACY_ID_MAP[id] ?? id;
        return {
          id: mappedId,
          name: String(c.name).trim(),
          type: c.type === "penalty" ? "penalty" : "points",
          max_weight: Number(c.max_weight),
          enabled: c.enabled !== false,
          input:
            c.input === "number" || c.type === "penalty"
              ? "number"
              : c.requires_all?.length
                ? "boolean"
                : "boolean",
          requires_all: Array.isArray(c.requires_all)
            ? c.requires_all.map((r) => LEGACY_ID_MAP[String(r)] ?? String(r))
            : undefined,
        };
      });
  } catch {
    return [...DEFAULT_EVALUATION_CRITERIA];
  }
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
      input: "boolean",
      enabled: true,
    },
    {
      id: "memorization",
      name: "حفظ",
      type: "points",
      max_weight: 1,
      input: "number",
      enabled: true,
    },
    {
      id: "listening",
      name: "استماع",
      type: "points",
      max_weight: Number(row.weight_listening ?? 1),
      input: "boolean",
      enabled: true,
    },
    {
      id: "repeat",
      name: "التكرار",
      type: "points",
      max_weight: Number(row.weight_repeat ?? 1),
      input: "boolean",
      enabled: true,
    },
    {
      id: "linking",
      name: "الربط",
      type: "points",
      max_weight: Number(row.rabt_weight ?? 1),
      input: "number",
      enabled: true,
    },
    {
      id: "revision",
      name: "المراجعة",
      type: "points",
      max_weight: Number(row.weight_revision ?? 1),
      input: "boolean",
      enabled: true,
    },
    { id: "error", name: "الخطأ", type: "penalty", max_weight: pen, input: "number", enabled: true },
    { id: "tune", name: "اللحن", type: "penalty", max_weight: pen, input: "number", enabled: true },
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
    if (c.type === "penalty") {
      penalties += c.max_weight * Math.max(0, Number(raw ?? 0));
      continue;
    }
    if (c.requires_all?.length) {
      const allDone = c.requires_all.every((id) => Boolean(taskScores[id]));
      if (allDone) earned += c.max_weight;
      continue;
    }
    const input = c.input ?? "boolean";
    if (input === "number") {
      earned += Math.min(Math.max(0, Number(raw ?? 0)), c.max_weight);
    } else if (Boolean(raw)) {
      earned += c.max_weight;
    }
  }

  const raw = maxScore > 0 ? ((earned - penalties) / maxScore) * 100 : 0;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
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

export async function loadEvaluationCriteria(
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

export function newCriterionId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
