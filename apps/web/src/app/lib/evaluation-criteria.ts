export type EvalCriterionType = "points" | "penalty";
export type EvalInputMode = "boolean" | "number";

export type EvalCriterion = {
  id: string;
  name: string;
  type: EvalCriterionType;
  max_weight: number;
  input?: EvalInputMode;
  requires_all?: string[];
};

export function totalPositiveWeight(criteria: EvalCriterion[]): number {
  return criteria
    .filter((c) => c.type === "points" && !c.requires_all?.length)
    .reduce((sum, c) => sum + c.max_weight, 0);
}

export function totalMaxScore(criteria: EvalCriterion[]): number {
  return criteria
    .filter((c) => c.type === "points")
    .reduce((sum, c) => sum + c.max_weight, 0);
}

export function defaultTaskScore(c: EvalCriterion): boolean | number {
  return c.type === "penalty" || c.input === "number" ? 0 : false;
}

export function emptyTaskScores(criteria: EvalCriterion[]): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const c of criteria) out[c.id] = defaultTaskScore(c);
  return out;
}
