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

export type PreviewStudentRow = {
  student_id: number;
  full_name_ar: string;
  circle_name: string | null;
  stage_id: number | null;
  current_memorization: number;
  target_amount: number;
  memorization_amount: string | null;
};

/** مرحلة التلقين — مستبعدة من استهداف المنافسات */
export const EXCLUDED_COMPETITION_STAGE_ID = 1;

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
      stage_ids: (parsed.stage_ids ?? [])
        .map(Number)
        .filter((n) => n > 0 && n !== EXCLUDED_COMPETITION_STAGE_ID),
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

/**
 * O(S) time, O(S) space — S ≤ 500; single indexed JOIN query (no N+1).
 * Always excludes talqeen (stage_id = 1).
 */
export async function queryPreviewStudents(
  env: Env,
  complexId: number,
  scope: ScopeMode,
  targetScope: TargetScope,
): Promise<PreviewStudentRow[]> {
  const scopeWhere = studentsInScopeWhere(scope);
  const binds: (string | number)[] = [...studentsInScopeBinds(complexId, scope)];
  const filters: string[] = [];

  const circleIds = targetScope.circle_ids ?? [];
  const trackIds = targetScope.track_ids ?? [];
  const stageIds = (targetScope.stage_ids ?? []).filter(
    (id) => id !== EXCLUDED_COMPETITION_STAGE_ID,
  );

  const hasStageCol = await tableHasColumn(env, "students", "stage_id");
  if (hasStageCol) {
    filters.push(
      `(s.stage_id IS NULL OR s.stage_id != ${EXCLUDED_COMPETITION_STAGE_ID})`,
    );
  }

  const needsActivePlacement = circleIds.length > 0 || trackIds.length > 0;
  const historyJoin = needsActivePlacement
    ? `INNER JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL`
    : `LEFT JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL`;

  if (circleIds.length) {
    filters.push(`h.circle_id IN (${circleIds.map(() => "?").join(",")})`);
    binds.push(...circleIds);
  }

  if (trackIds.length) {
    filters.push(`h.track_id IN (${trackIds.map(() => "?").join(",")})`);
    binds.push(...trackIds);
  }

  if (stageIds.length && hasStageCol) {
    filters.push(`s.stage_id IN (${stageIds.map(() => "?").join(",")})`);
    binds.push(...stageIds);
  }

  const filterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const memCol = (await tableHasColumn(env, "students", "memorization_amount"))
    ? "s.memorization_amount"
    : "NULL AS memorization_amount";
  const stageCol = hasStageCol ? "s.stage_id" : "NULL AS stage_id";

  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id AS student_id, s.full_name_ar, ${memCol}, ${stageCol},
            c.name_ar AS circle_name
     FROM students s
     ${historyJoin}
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

  return (rows.results ?? []).map((r) => {
    const current = parseMemorizationJuz(r.memorization_amount);
    return {
      student_id: r.student_id,
      full_name_ar: r.full_name_ar,
      circle_name: r.circle_name,
      stage_id: r.stage_id,
      memorization_amount: r.memorization_amount,
      current_memorization: current,
      target_amount: 0,
    };
  });
}

/** O(T) — single DELETE + batched INSERTs (chunks of 50), no per-row round trips */
export async function upsertStudentTargets(
  env: Env,
  competitionId: number,
  targets: StudentTargetInput[],
): Promise<void> {
  await env.DB.prepare(`DELETE FROM competition_targets WHERE competition_id = ?`)
    .bind(competitionId)
    .run();

  const valid = targets.filter((t) => t.student_id);
  if (!valid.length) return;

  const chunkSize = 50;
  for (let i = 0; i < valid.length; i += chunkSize) {
    const chunk = valid.slice(i, i + chunkSize);
    const stmts = chunk.map((t) =>
      env.DB.prepare(
        `INSERT INTO competition_targets
         (competition_id, student_id, current_memorization, target_amount)
         VALUES (?, ?, ?, ?)`,
      ).bind(
        competitionId,
        t.student_id,
        Number(t.current_memorization) || 0,
        Number(t.target_amount) || 0,
      ),
    );
    await env.DB.batch(stmts);
  }
}

/** O(L) — single JOIN query over competition_logs */
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
        row.type === "deduction"
          ? -Math.abs(points) * weight
          : Math.abs(points) * weight;
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

export type CompetitionDetailBundle = {
  targets: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
};

/**
 * O(1) query count (3 parallel) — targets/tasks/logs fetched in one round-trip batch.
 * Time: O(T + K + L); Space: O(T + K + L).
 */
export async function loadCompetitionDetailBundle(
  env: Env,
  competitionId: number,
  flags: { engineTargets: boolean; engineTasks: boolean; engineLogs: boolean },
): Promise<CompetitionDetailBundle> {
  const targetsPromise = flags.engineTargets
    ? env.DB.prepare(
        `SELECT ct.id, ct.competition_id, ct.student_id, ct.current_memorization,
                ct.target_amount, ct.achieved_amount, ct.synced_at, ct.created_at,
                s.full_name_ar
         FROM competition_targets ct
         INNER JOIN students s ON s.id = ct.student_id
         WHERE ct.competition_id = ?
         ORDER BY s.full_name_ar`,
      )
        .bind(competitionId)
        .all()
    : Promise.resolve({ results: [] });

  const tasksPromise = flags.engineTasks
    ? env.DB.prepare(
        `SELECT id, competition_id, name_ar, weight, type, sort_order, created_at
         FROM competition_tasks
         WHERE competition_id = ?
         ORDER BY sort_order, id`,
      )
        .bind(competitionId)
        .all()
    : Promise.resolve({ results: [] });

  const logsPromise = (async () => {
    if (flags.engineLogs) {
      return env.DB.prepare(
        `SELECT cl.id, cl.competition_id, cl.student_id, cl.task_id, cl.log_date,
                cl.points, cl.notes, cl.recorded_by_user_id, cl.recorded_at,
                s.full_name_ar, ct.name_ar AS task_name
         FROM competition_logs cl
         INNER JOIN students s ON s.id = cl.student_id
         LEFT JOIN competition_tasks ct ON ct.id = cl.task_id
         WHERE cl.competition_id = ?
         ORDER BY cl.log_date DESC, cl.recorded_at DESC
         LIMIT 200`,
      )
        .bind(competitionId)
        .all();
    }
    if (await hasTable(env, "quran_daily_ledger")) {
      return env.DB.prepare(
        `SELECT l.student_id, l.mark_date AS log_date, l.notes AS metrics_json,
                'ledger' AS source, l.recorded_at, s.full_name_ar
         FROM quran_daily_ledger l
         INNER JOIN students s ON s.id = l.student_id
         WHERE l.context_type = 'competition' AND l.context_id = ?
         ORDER BY l.mark_date DESC, l.recorded_at DESC
         LIMIT 200`,
      )
        .bind(competitionId)
        .all();
    }
    return { results: [] as Array<Record<string, unknown>> };
  })();

  const [targetsRes, tasksRes, logsRes] = await Promise.all([
    targetsPromise,
    tasksPromise,
    logsPromise,
  ]);

  return {
    targets: (targetsRes.results ?? []) as Array<Record<string, unknown>>,
    tasks: (tasksRes.results ?? []) as Array<Record<string, unknown>>,
    logs: (logsRes.results ?? []) as Array<Record<string, unknown>>,
  };
}

/** O(1) DELETE chain — cascade child rows then competition row */
export async function deleteCompetitionCascade(
  env: Env,
  competitionId: number,
  complexId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM competitions WHERE id = ? AND complex_id = ?`,
  )
    .bind(competitionId, complexId)
    .first();
  if (!row) return false;

  const tables = [
    "competition_logs",
    "competition_tasks",
    "competition_targets",
    "competition_attendance",
  ];
  for (const table of tables) {
    if (await hasTable(env, table)) {
      await env.DB.prepare(
        `DELETE FROM ${table} WHERE competition_id = ?`,
      )
        .bind(competitionId)
        .run();
    }
  }

  await env.DB.prepare(`DELETE FROM competitions WHERE id = ? AND complex_id = ?`)
    .bind(competitionId, complexId)
    .run();
  return true;
}

export type DashboardTargetRow = {
  student_id: number;
  full_name_ar: string;
  current_memorization: number;
  target_amount: number;
  achieved_amount: number;
};

/** O(T) — single JOIN for targets + student names (feeds dashboard KPIs) */
export async function loadCompetitionTargetRows(
  env: Env,
  competitionId: number,
): Promise<DashboardTargetRow[]> {
  const rows = await env.DB.prepare(
    `SELECT ct.student_id, ct.current_memorization, ct.target_amount,
            ct.achieved_amount, s.full_name_ar
     FROM competition_targets ct
     INNER JOIN students s ON s.id = ct.student_id
     WHERE ct.competition_id = ?`,
  )
    .bind(competitionId)
    .all<DashboardTargetRow>();
  return rows.results ?? [];
}
