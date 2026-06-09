import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import {
  studentsInScopeBinds,
  studentsInScopeWhere,
  type ScopeMode,
} from "./dept-scope";

export type CompetitionCategory =
  | "recitation"
  | "review"
  | "new_memorization"
  | "other";

export type TargetScope = {
  circle_ids?: number[];
  track_ids?: number[];
  stage_ids?: number[];
};

export type StudentTargetInput = {
  student_id: number;
  current_memorization: number;
  target_amount: number;
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** O(n) on string length — n is short memorization text */
export function parseMemorizationJuz(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const normalized = raw.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export function formatMemorizationJuz(juz: number): string {
  const rounded = Math.round(juz * 100) / 100;
  if (rounded <= 0) return "";
  if (rounded === 1) return "1 جزء";
  return `${rounded} أجزاء`;
}

export function parseTargetScope(raw: string | null | undefined): TargetScope {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as TargetScope;
    return {
      circle_ids: (parsed.circle_ids ?? []).map(Number).filter((n) => n > 0),
      track_ids: (parsed.track_ids ?? []).map(Number).filter((n) => n > 0),
      stage_ids: (parsed.stage_ids ?? []).map(Number).filter((n) => n > 0),
    };
  } catch {
    return {};
  }
}

export async function hasEngineTargets(env: Env): Promise<boolean> {
  return (
    (await hasTable(env, "competition_targets")) &&
    (await tableHasColumn(env, "competition_targets", "current_memorization"))
  );
}

export async function hasEngineTasks(env: Env): Promise<boolean> {
  return (
    (await hasTable(env, "competition_tasks")) &&
    (await tableHasColumn(env, "competition_tasks", "type"))
  );
}

export async function hasEngineLogs(env: Env): Promise<boolean> {
  return await hasTable(env, "competition_logs");
}

export async function hasCompetitionCategory(env: Env): Promise<boolean> {
  return await tableHasColumn(env, "competitions", "category");
}

export async function queryPreviewStudents(
  env: Env,
  complexId: number,
  scope: ScopeMode,
  targetScope: TargetScope,
): Promise<
  Array<{
    student_id: number;
    full_name_ar: string;
    circle_name: string | null;
    stage_id: number | null;
    current_memorization: number;
    memorization_amount: string | null;
  }>
> {
  const scopeWhere = studentsInScopeWhere(scope);
  const binds: (string | number)[] = [...studentsInScopeBinds(complexId, scope)];
  const filters: string[] = [];

  const circleIds = targetScope.circle_ids ?? [];
  if (circleIds.length) {
    filters.push(`h.circle_id IN (${circleIds.map(() => "?").join(",")})`);
    binds.push(...circleIds);
  }

  const trackIds = targetScope.track_ids ?? [];
  if (trackIds.length) {
    filters.push(`h.track_id IN (${trackIds.map(() => "?").join(",")})`);
    binds.push(...trackIds);
  }

  const stageIds = targetScope.stage_ids ?? [];
  if (stageIds.length && (await tableHasColumn(env, "students", "stage_id"))) {
    filters.push(`s.stage_id IN (${stageIds.map(() => "?").join(",")})`);
    binds.push(...stageIds);
  }

  const filterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const memCol = (await tableHasColumn(env, "students", "memorization_amount"))
    ? "s.memorization_amount"
    : "NULL AS memorization_amount";
  const stageCol = (await tableHasColumn(env, "students", "stage_id"))
    ? "s.stage_id"
    : "NULL AS stage_id";

  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id AS student_id, s.full_name_ar, ${memCol}, ${stageCol},
            c.name_ar AS circle_name
     FROM students s
     LEFT JOIN student_circle_history h
       ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     LEFT JOIN circles c ON c.id = h.circle_id
     WHERE ${scopeWhere}${filterSql}
     ORDER BY s.full_name_ar
     LIMIT 500`,
  )
    .bind(...binds)
    .all<{
      student_id: number;
      full_name_ar: string;
      memorization_amount: string | null;
      stage_id: number | null;
      circle_name: string | null;
    }>();

  return (rows.results ?? []).map((r) => ({
    student_id: r.student_id,
    full_name_ar: r.full_name_ar,
    circle_name: r.circle_name,
    stage_id: r.stage_id,
    memorization_amount: r.memorization_amount,
    current_memorization: parseMemorizationJuz(r.memorization_amount),
  }));
}

export async function upsertStudentTargets(
  env: Env,
  competitionId: number,
  targets: StudentTargetInput[],
): Promise<void> {
  await env.DB.prepare(`DELETE FROM competition_targets WHERE competition_id = ?`)
    .bind(competitionId)
    .run();

  for (const t of targets) {
    if (!t.student_id) continue;
    await env.DB.prepare(
      `INSERT INTO competition_targets
       (competition_id, student_id, current_memorization, target_amount)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(
        competitionId,
        t.student_id,
        Number(t.current_memorization) || 0,
        Number(t.target_amount) || 0,
      )
      .run();
  }
}

export async function computeAchievedByStudent(
  env: Env,
  competitionId: number,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();

  if (await hasEngineLogs(env)) {
    const rows = await env.DB.prepare(
      `SELECT cl.student_id, cl.points, ct.type, ct.weight
       FROM competition_logs cl
       LEFT JOIN competition_tasks ct ON ct.id = cl.task_id
       WHERE cl.competition_id = ?`,
    )
      .bind(competitionId)
      .all<{
        student_id: number;
        points: number;
        type: string | null;
        weight: number | null;
      }>();

    for (const row of rows.results ?? []) {
      const weight = Number(row.weight ?? 1);
      const points = Number(row.points ?? 0);
      const signed =
        row.type === "deduction" ? -Math.abs(points) * weight : Math.abs(points) * weight;
      out.set(row.student_id, (out.get(row.student_id) ?? 0) + signed);
    }
    return out;
  }

  const ledger = await env.DB.prepare(
    `SELECT student_id, notes
     FROM quran_daily_ledger
     WHERE context_type = 'competition' AND context_id = ?`,
  )
    .bind(competitionId)
    .all<{ student_id: number; notes: string }>();

  for (const log of ledger.results ?? []) {
    let metrics: Record<string, unknown> = {};
    try {
      metrics = JSON.parse(log.notes ?? "{}");
    } catch {
      metrics = {};
    }
    const juz =
      Number(metrics.juz_completed ?? 0) ||
      Number(metrics.hifz_pages ?? 0) / 20 ||
      0;
    out.set(log.student_id, (out.get(log.student_id) ?? 0) + juz);
  }

  return out;
}
