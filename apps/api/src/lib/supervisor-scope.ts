import type { Env } from "../types";

export const STAGE_LABELS: Record<number, string> = {
  1: "تلقين",
  2: "ابتدائي",
  3: "متوسط",
  4: "ثانوي",
};

export type ScopeMode = { type: "global" } | { type: "stages"; stageIds: number[] };

export function parseSupervisorScope(raw: string | null | undefined): ScopeMode {
  const s = (raw ?? "global").trim();
  if (!s || s === "global") return { type: "global" };
  const ids = s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => n >= 1 && n <= 4);
  if (ids.length === 0) return { type: "global" };
  return { type: "stages", stageIds: [...new Set(ids)] };
}

export async function loadUserScope(
  env: Env,
  userId: number,
): Promise<ScopeMode> {
  const row = await env.DB.prepare(
    `SELECT supervisor_scope FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ supervisor_scope: string | null }>();
  return parseSupervisorScope(row?.supervisor_scope);
}

/** SQL fragment: user visible to scope (bind stage ids after complex_id) */
export function staffScopeWhere(scope: ScopeMode): string {
  if (scope.type === "global") {
    return `u.complex_id = ? AND u.is_active = 1
      AND u.role IN ('general_manager','general_supervisor','edu_supervisor','prog_supervisor','teacher')`;
  }
  const ph = scope.stageIds.map(() => "?").join(",");
  const phStr = scope.stageIds.map(() => "?").join(",");
  return `u.complex_id = ? AND u.is_active = 1
    AND (
      u.id IN (
        SELECT ta.user_id FROM teacher_assignments ta
        JOIN circles c ON c.id = ta.circle_id
        WHERE c.stage_id IN (${ph})
      )
      OR (
        u.role IN ('edu_supervisor','general_supervisor')
        AND (
          u.supervisor_scope IN (${phStr})
          OR u.id IN (
            SELECT ss.user_id FROM supervisor_scopes ss
            JOIN circles c ON c.id = ss.circle_id
            WHERE c.stage_id IN (${ph})
          )
        )
      )
    )`;
}

export function staffScopeBinds(
  complexId: number,
  scope: ScopeMode,
): (number | string)[] {
  if (scope.type === "global") return [complexId];
  const ids = scope.stageIds;
  return [
    complexId,
    ...ids,
    ...ids.map(String),
    ...ids,
  ];
}

export function stageFilterWhere(scope: ScopeMode, column = "stage_id"): string {
  if (scope.type === "global") return "1=1";
  const placeholders = scope.stageIds.map(() => "?").join(",");
  return `${column} IN (${placeholders})`;
}

export function stageFilterBinds(scope: ScopeMode): number[] {
  return scope.type === "global" ? [] : [...scope.stageIds];
}

/** طلاب ضمن نطاق المشرف (مرحلة من stage_id أو حلقة نشطة) */
export function studentsInScopeWhere(scope: ScopeMode): string {
  if (scope.type === "global") {
    return "s.complex_id = ? AND s.is_active = 1";
  }
  const ph = scope.stageIds.map(() => "?").join(",");
  return `s.complex_id = ? AND s.is_active = 1 AND (
    s.stage_id IN (${ph})
    OR EXISTS (
      SELECT 1 FROM student_circle_history h
      JOIN circles c ON c.id = h.circle_id
      WHERE h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
        AND c.stage_id IN (${ph})
    )
  )`;
}

export function studentsInScopeBinds(
  complexId: number,
  scope: ScopeMode,
): number[] {
  if (scope.type === "global") return [complexId];
  return [complexId, ...scope.stageIds, ...scope.stageIds];
}
