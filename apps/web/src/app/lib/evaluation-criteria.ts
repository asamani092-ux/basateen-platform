export type EvalCriterionType = "points" | "penalty";
export type EvalInputMode = "boolean" | "number";

export type EvalCriterion = {
  id: string;
  name: string;
  type: EvalCriterionType;
  max_weight: number;
  input?: EvalInputMode;
  enabled?: boolean;
  requires_all?: string[];
};

/** O(n) */
export function activeCriteria(criteria: EvalCriterion[]): EvalCriterion[] {
  return criteria.filter((c) => c.enabled !== false);
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

export function defaultTaskScore(c: EvalCriterion): boolean | number {
  return c.type === "penalty" || c.input === "number" ? 0 : false;
}

export function emptyTaskScores(criteria: EvalCriterion[]): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const c of activeCriteria(criteria)) out[c.id] = defaultTaskScore(c);
  return out;
}

export function computeQualityFromCriteria(
  taskScores: Record<string, boolean | number>,
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
