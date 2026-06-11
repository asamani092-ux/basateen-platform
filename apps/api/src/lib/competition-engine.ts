import type { Env } from "../types";
import {
  activePlacementSql,
  hasTable,
  historyCircleColumn,
  historyTrackColumn,
  tableHasColumn,
} from "./db-schema";
import {
  buildStudentsInScopeWhere,
  STAGE_LABELS,
  studentsInScopeBinds,
  type ScopeMode,
} from "./dept-scope";

export type CompetitionCategory =
  | "recitation"
  | "review"
  | "new_memorization";

export type MemorizationUnit = "juz" | "hizb";

export type TaskInputType = "boolean" | "numeric" | "counter";

export type TaskType = "addition" | "deduction";

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

/** كلمات البحث الجزئي في school_grade لكل stage_id */
export const STAGE_GRADE_KEYWORDS: Record<number, string[]> = {
  2: ["ابتدائي", "إبتدائي", "ابتدائية"],
  3: ["متوسط", "متوسطة", "متوسطه"],
  4: ["ثانوي", "ثانوية", "ثانويه"],
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

/** O(1) — inclusive calendar days between start and end (YYYY-MM-DD). */
export function countCompetitionDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

/** O(1) — juz × 20 faces, hizb × 10 faces. */
export function totalFacesFromUnit(unit: MemorizationUnit, count: number): number {
  const n = Number(count) || 0;
  return unit === "juz" ? n * 20 : n * 10;
}

/** O(1) — daily face quota for memorization competitions. */
export function dailyFaces(totalFaces: number, dayCount: number): number {
  const days = Math.max(1, dayCount);
  return Math.round((totalFaces / days) * 100) / 100;
}

/** O(1) — recitation targets: 1 juz = 2 hizb. */
export function targetHizbCount(targetJuz: number): number {
  const juz = Number(targetJuz) || 0;
  return Math.max(1, Math.ceil(juz * 2));
}

export function parseMemorizationUnit(raw: unknown): MemorizationUnit {
  return raw === "hizb" ? "hizb" : "juz";
}

/** O(1) — maps legacy task type to default input widget. */
export function defaultInputTypeFromTaskType(type: TaskType): TaskInputType {
  return type === "deduction" ? "counter" : "boolean";
}

export function parseTaskInputType(raw: unknown, fallbackType: TaskType): TaskInputType {
  if (raw === "boolean" || raw === "numeric" || raw === "counter") return raw;
  return defaultInputTypeFromTaskType(fallbackType);
}

export async function hasTaskInputType(env: Env): Promise<boolean> {
  return tableHasColumn(env, "competition_tasks", "input_type");
}

export function competitionTaskSelectSql(hasInputType: boolean): string {
  return hasInputType
    ? "id, name_ar, weight, type, input_type, sort_order, created_at"
    : "id, name_ar, weight, type, sort_order, created_at";
}

export function studentDailyFaces(
  unit: MemorizationUnit,
  targetAmount: number,
  dayCount: number,
): number {
  return dailyFaces(totalFacesFromUnit(unit, targetAmount), dayCount);
}

export function parseTargetScope(raw: string | null | undefined): TargetScope {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as TargetScope;
    return normalizeTargetScope(parsed);
  } catch {
    return {};
  }
}

/** O(n) — يطبّع المعرفات إلى أرقام؛ مصفوفة فارغة = «الكل» (تجاوز الفلتر) */
export function normalizeTargetScope(scope: TargetScope): TargetScope {
  const normIds = (arr?: number[]) =>
    (arr ?? [])
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  return {
    circle_ids: normIds(scope.circle_ids),
    track_ids: normIds(scope.track_ids),
    stage_ids: normIds(scope.stage_ids).filter(
      (n) => n !== EXCLUDED_COMPETITION_STAGE_ID,
    ),
  };
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

export type SirdSettings = {
  base_hizb_score: number;
  mistake_deduction: number;
  warning_deduction: number;
  pass_threshold: number;
};

export const DEFAULT_SIRD_SETTINGS: SirdSettings = {
  base_hizb_score: 20,
  mistake_deduction: 2.5,
  warning_deduction: 0.5,
  pass_threshold: 14,
};

/** O(1) — parse sird weight settings from competition rules_json. */
export function parseSirdSettings(rules: Record<string, unknown> | null | undefined): SirdSettings {
  const raw = (rules?.sird ?? rules?.scoring?.sird ?? {}) as Record<string, unknown>;
  return {
    base_hizb_score: Number(raw.base_hizb_score ?? DEFAULT_SIRD_SETTINGS.base_hizb_score),
    mistake_deduction: Number(raw.mistake_deduction ?? DEFAULT_SIRD_SETTINGS.mistake_deduction),
    warning_deduction: Number(raw.warning_deduction ?? DEFAULT_SIRD_SETTINGS.warning_deduction),
    pass_threshold: Number(raw.pass_threshold ?? DEFAULT_SIRD_SETTINGS.pass_threshold),
  };
}

/** O(1) — score = base − mistakes×weight − warnings×weight; pass if score ≥ threshold. */
export function computeSirdPeriodScore(
  mistakes: number,
  warnings: number,
  settings: SirdSettings,
): { score: number; is_passed: boolean } {
  const m = Math.max(0, Math.round(Number(mistakes) || 0));
  const w = Math.max(0, Math.round(Number(warnings) || 0));
  const score =
    Math.round(
      (settings.base_hizb_score -
        m * settings.mistake_deduction -
        w * settings.warning_deduction) *
        100,
    ) / 100;
  return {
    score,
    is_passed: score >= settings.pass_threshold,
  };
}

export type SirdPeriodRecord = {
  period_index: number;
  hizb_number: number;
  mistakes_count: number;
  warnings_count: number;
  is_passed: boolean;
  score: number | null;
};

export async function hasSirdPeriodRecords(env: Env): Promise<boolean> {
  return await hasTable(env, "sird_period_records");
}

/** O(P) — P = period rows for one student. */
export async function loadSirdPeriodsForStudent(
  env: Env,
  competitionId: number,
  studentId: number,
): Promise<SirdPeriodRecord[]> {
  if (!(await hasSirdPeriodRecords(env))) return [];
  const rows = await env.DB.prepare(
    `SELECT period_index, hizb_number, mistakes_count, warnings_count, is_passed, score
     FROM sird_period_records
     WHERE competition_id = ? AND student_id = ?
     ORDER BY period_index`,
  )
    .bind(competitionId, studentId)
    .all<{
      period_index: number;
      hizb_number: number;
      mistakes_count: number;
      warnings_count: number;
      is_passed: number;
      score: number | null;
    }>();
  return (rows.results ?? []).map((r) => ({
    period_index: Number(r.period_index),
    hizb_number: Number(r.hizb_number ?? 0),
    mistakes_count: Number(r.mistakes_count ?? 0),
    warnings_count: Number(r.warnings_count ?? 0),
    is_passed: Number(r.is_passed) === 1,
    score: r.score != null ? Number(r.score) : null,
  }));
}

/** O(S×P) — all period rows for competition; Space O(S×P). */
export async function loadSirdPeriodsMatrix(
  env: Env,
  competitionId: number,
): Promise<Map<number, SirdPeriodRecord[]>> {
  const out = new Map<number, SirdPeriodRecord[]>();
  if (!(await hasSirdPeriodRecords(env))) return out;
  const rows = await env.DB.prepare(
    `SELECT student_id, period_index, hizb_number, mistakes_count, warnings_count, is_passed, score
     FROM sird_period_records
     WHERE competition_id = ?
     ORDER BY student_id, period_index`,
  )
    .bind(competitionId)
    .all<{
      student_id: number;
      period_index: number;
      hizb_number: number;
      mistakes_count: number;
      warnings_count: number;
      is_passed: number;
      score: number | null;
    }>();
  for (const r of rows.results ?? []) {
    const sid = Number(r.student_id);
    const list = out.get(sid) ?? [];
    list.push({
      period_index: Number(r.period_index),
      hizb_number: Number(r.hizb_number ?? 0),
      mistakes_count: Number(r.mistakes_count ?? 0),
      warnings_count: Number(r.warnings_count ?? 0),
      is_passed: Number(r.is_passed) === 1,
      score: r.score != null ? Number(r.score) : null,
    });
    out.set(sid, list);
  }
  return out;
}

export type SirdStudentStats = {
  student_id: number;
  full_name_ar: string;
  read_count: number;
  passed_count: number;
  failed_count: number;
  total_mistakes: number;
  total_warnings: number;
  mastery_pct: number;
};

/** O(P) per student — aggregate period matrix into dashboard columns. */
export function aggregateSirdStudentStats(
  studentId: number,
  fullNameAr: string,
  periods: SirdPeriodRecord[],
): SirdStudentStats {
  let read = 0;
  let passed = 0;
  let failed = 0;
  let totalMistakes = 0;
  let totalWarnings = 0;

  for (const p of periods) {
    const recited = Number(p.hizb_number) > 0;
    if (!recited) continue;
    read += 1;
    totalMistakes += Number(p.mistakes_count) || 0;
    totalWarnings += Number(p.warnings_count) || 0;
    if (p.is_passed) passed += 1;
    else failed += 1;
  }

  const masteryPct = read > 0 ? Math.round((passed / read) * 100) : 0;

  return {
    student_id: studentId,
    full_name_ar: fullNameAr,
    read_count: read,
    passed_count: passed,
    failed_count: failed,
    total_mistakes: totalMistakes,
    total_warnings: totalWarnings,
    mastery_pct: masteryPct,
  };
}

/** O(1) — upsert single period row (audit trail handled separately). */
export async function upsertSirdPeriodRecord(
  env: Env,
  competitionId: number,
  studentId: number,
  periodIndex: number,
  payload: {
    hizb_number: number;
    mistakes_count: number;
    warnings_count: number;
    is_passed: boolean;
    score: number;
  },
  recordedByUserId?: number | null,
): Promise<void> {
  if (!(await hasSirdPeriodRecords(env))) return;
  await env.DB.prepare(
    `INSERT INTO sird_period_records
     (competition_id, student_id, period_index, hizb_number, mistakes_count,
      warnings_count, is_passed, score, recorded_by_user_id, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(competition_id, student_id, period_index) DO UPDATE SET
       hizb_number = excluded.hizb_number,
       mistakes_count = excluded.mistakes_count,
       warnings_count = excluded.warnings_count,
       is_passed = excluded.is_passed,
       score = excluded.score,
       recorded_by_user_id = excluded.recorded_by_user_id,
       recorded_at = datetime('now')`,
  )
    .bind(
      competitionId,
      studentId,
      periodIndex,
      Number(payload.hizb_number) || 0,
      Math.max(0, Math.round(Number(payload.mistakes_count) || 0)),
      Math.max(0, Math.round(Number(payload.warnings_count) || 0)),
      payload.is_passed ? 1 : 0,
      payload.score,
      recordedByUserId ?? null,
    )
    .run();
}

export async function hasCompetitionCategory(env: Env): Promise<boolean> {
  return await tableHasColumn(env, "competitions", "category");
}

export type CompetitionFilterOptions = {
  circles: Array<{ id: number; name_ar: string; stage_id: number | null }>;
  tracks: Array<{ id: number; name_ar: string }>;
};

/**
 * O(C + T) — circles/tracks only; independent of competition_targets.
 * Never throws — returns empty arrays on missing tables/columns.
 */
export async function loadCompetitionFilterOptions(
  env: Env,
  complexId: number,
): Promise<CompetitionFilterOptions> {
  const out: CompetitionFilterOptions = { circles: [], tracks: [] };

  if (await hasTable(env, "circles")) {
    const hasActive = await tableHasColumn(env, "circles", "is_active");
    const hasStage = await tableHasColumn(env, "circles", "stage_id");
    const activeClause = hasActive ? " AND COALESCE(CAST(c.is_active AS INTEGER), 1) = 1" : "";
    const stageCol = hasStage ? ", c.stage_id" : ", NULL AS stage_id";
    try {
      const rows = await env.DB.prepare(
        `SELECT c.id, c.name_ar${stageCol}
         FROM circles c
         WHERE c.complex_id = ?${activeClause}
         ORDER BY c.name_ar`,
      )
        .bind(complexId)
        .all<{ id: number; name_ar: string; stage_id: number | null }>();
      out.circles = (rows.results ?? []).map((r) => ({
        id: Number(r.id),
        name_ar: String(r.name_ar ?? ""),
        stage_id: r.stage_id != null ? Number(r.stage_id) : null,
      }));
    } catch (err) {
      console.error("loadCompetitionFilterOptions circles failed:", err);
    }
  }

  if (await hasTable(env, "tracks")) {
    const hasActive = await tableHasColumn(env, "tracks", "is_active");
    const activeClause = hasActive ? " AND COALESCE(CAST(t.is_active AS INTEGER), 1) = 1" : "";
    try {
      const rows = await env.DB.prepare(
        `SELECT t.id, t.name_ar FROM tracks t
         WHERE t.complex_id = ?${activeClause}
         ORDER BY t.name_ar`,
      )
        .bind(complexId)
        .all<{ id: number; name_ar: string }>();
      out.tracks = (rows.results ?? []).map((r) => ({
        id: Number(r.id),
        name_ar: String(r.name_ar ?? ""),
      }));
    } catch (err) {
      console.error("loadCompetitionFilterOptions tracks failed:", err);
    }
  }

  return out;
}

/**
 * O(K) — K = عدد المراحل × كلمات البحث; يبني شرط OR للـ stage_id و school_grade LIKE.
 * Time O(K) binds; Space O(K).
 */
function appendStageFilterSql(
  stageIds: number[],
  hasStageCol: boolean,
  hasSchoolGrade: boolean,
  filters: string[],
  binds: (string | number)[],
): void {
  if (!stageIds.length || !hasStageCol) return;

  const parts: string[] = [];
  const idPh = stageIds.map(() => "?").join(",");
  parts.push(`s.stage_id IN (${idPh})`);
  parts.push(`c.stage_id IN (${idPh})`);
  binds.push(...stageIds, ...stageIds);

  if (hasSchoolGrade) {
    for (const sid of stageIds) {
      const keywords = STAGE_GRADE_KEYWORDS[sid] ?? [STAGE_LABELS[sid] ?? ""];
      for (const kw of keywords) {
        if (!kw) continue;
        parts.push(`s.school_grade LIKE ?`);
        binds.push(`%${kw}%`);
      }
    }
  }

  filters.push(`(${parts.join(" OR ")})`);
}

/**
 * O(S) time, O(S) space — S ≤ 500; single query with LEFT JOINs only.
 * Students always listed from `students`; optional competition_targets LEFT JOIN
 * pre-fills saved targets when editing (never filters rows out).
 * Always excludes talqeen (stage_id = 1).
 */
export async function queryPreviewStudents(
  env: Env,
  complexId: number,
  scope: ScopeMode,
  targetScope: TargetScope,
  competitionId?: number,
): Promise<PreviewStudentRow[]> {
  const normalized = normalizeTargetScope(targetScope);
  const scopeWhere = await buildStudentsInScopeWhere(env, scope);
  const binds: (string | number)[] = [...studentsInScopeBinds(complexId, scope)];
  const filters: string[] = [];

  const circleIds = normalized.circle_ids ?? [];
  const trackIds = normalized.track_ids ?? [];
  const stageIds = normalized.stage_ids ?? [];

  const hasStageCol = await tableHasColumn(env, "students", "stage_id");
  const hasSchoolGrade = await tableHasColumn(env, "students", "school_grade");
  const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
  const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
  const circleHistCol = await historyCircleColumn(env, "h");
  const trackHistCol = await historyTrackColumn(env, "h");
  const hasLegacyHistory = await hasTable(env, "student_circle_history");
  const hasLegacyPlacement =
    hasLegacyHistory &&
    circleHistCol !== null &&
    (await tableHasColumn(env, "student_circle_history", "to_at"));

  const engineTargets = competitionId
    ? await hasEngineTargets(env)
    : false;

  let fromJoin = "LEFT JOIN circles c ON c.id = s.current_circle_id";

  if (hasCurrentCircle) {
    if (circleIds.length) {
      const ph = circleIds.map(() => "?").join(",");
      filters.push(`CAST(s.current_circle_id AS INTEGER) IN (${ph})`);
      binds.push(...circleIds);
    }
    if (trackIds.length && hasCurrentTrack) {
      const ph = trackIds.map(() => "?").join(",");
      filters.push(`CAST(s.current_track_id AS INTEGER) IN (${ph})`);
      binds.push(...trackIds);
    }
  } else if (hasLegacyPlacement && circleHistCol) {
    const active = await activePlacementSql(env, "h");
    fromJoin = `LEFT JOIN student_circle_history h ON h.student_id = s.id AND ${active}
                LEFT JOIN circles c ON c.id = ${circleHistCol}`;
    if (circleIds.length) {
      const ph = circleIds.map(() => "?").join(",");
      filters.push(`CAST(${circleHistCol} AS INTEGER) IN (${ph})`);
      binds.push(...circleIds);
    }
    if (trackIds.length && trackHistCol) {
      const ph = trackIds.map(() => "?").join(",");
      filters.push(`CAST(${trackHistCol} AS INTEGER) IN (${ph})`);
      binds.push(...trackIds);
    }
  } else if (!hasCurrentCircle) {
    fromJoin = "LEFT JOIN circles c ON 1=0";
  }

  if (engineTargets && competitionId) {
    fromJoin += `
     LEFT JOIN competition_targets ct
       ON ct.student_id = s.id AND ct.competition_id = ${competitionId}`;
  }

  if (hasStageCol) {
    filters.push(
      `(COALESCE(s.stage_id, 0) != ${EXCLUDED_COMPETITION_STAGE_ID})`,
      `(c.stage_id IS NULL OR c.stage_id != ${EXCLUDED_COMPETITION_STAGE_ID})`,
    );
    if (hasSchoolGrade) {
      filters.push(
        `(s.school_grade IS NULL OR s.school_grade NOT LIKE '%تلقين%')`,
      );
    }
  }

  appendStageFilterSql(stageIds, hasStageCol, hasSchoolGrade, filters, binds);

  const filterSql = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const memCol = (await tableHasColumn(env, "students", "memorization_amount"))
    ? "s.memorization_amount"
    : "NULL AS memorization_amount";
  const stageCol = hasStageCol ? "s.stage_id" : "NULL AS stage_id";
  const targetCurrentCol =
    engineTargets && competitionId
      ? "ct.current_memorization AS saved_current_memorization, ct.target_amount AS saved_target_amount"
      : "NULL AS saved_current_memorization, NULL AS saved_target_amount";

  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.id AS student_id, s.full_name_ar, ${memCol}, ${stageCol},
            c.name_ar AS circle_name, ${targetCurrentCol}
     FROM students s
     ${fromJoin}
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
      saved_current_memorization: number | null;
      saved_target_amount: number | null;
    }>();

  return (rows.results ?? []).map((r) => {
    const parsed = parseMemorizationJuz(r.memorization_amount);
    const current =
      r.saved_current_memorization != null
        ? Number(r.saved_current_memorization)
        : parsed;
    const target =
      r.saved_target_amount != null ? Number(r.saved_target_amount) : 0;
    return {
      student_id: r.student_id,
      full_name_ar: r.full_name_ar,
      circle_name: r.circle_name,
      stage_id: r.stage_id,
      memorization_amount: r.memorization_amount,
      current_memorization: current,
      target_amount: target,
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

  const hasInputType = flags.engineTasks ? await hasTaskInputType(env) : false;
  const taskCols = competitionTaskSelectSql(hasInputType);
  const tasksPromise = flags.engineTasks
    ? env.DB.prepare(
        `SELECT competition_id, ${taskCols}
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

/** O(K) — single batch transaction: logs → tasks → targets → attendance → ledger → competition */
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

  const [hasLogs, hasTasks, hasTargets, hasAtt, hasLedger, hasSird] = await Promise.all([
    hasTable(env, "competition_logs"),
    hasTable(env, "competition_tasks"),
    hasTable(env, "competition_targets"),
    hasTable(env, "competition_attendance"),
    hasTable(env, "quran_daily_ledger"),
    hasSirdPeriodRecords(env),
  ]);

  const stmts: ReturnType<typeof env.DB.prepare>[] = [];
  if (hasLogs) {
    stmts.push(
      env.DB.prepare(`DELETE FROM competition_logs WHERE competition_id = ?`).bind(
        competitionId,
      ),
    );
  }
  if (hasTasks) {
    stmts.push(
      env.DB.prepare(`DELETE FROM competition_tasks WHERE competition_id = ?`).bind(
        competitionId,
      ),
    );
  }
  if (hasTargets) {
    stmts.push(
      env.DB.prepare(`DELETE FROM competition_targets WHERE competition_id = ?`).bind(
        competitionId,
      ),
    );
  }
  if (hasAtt) {
    stmts.push(
      env.DB.prepare(
        `DELETE FROM competition_attendance WHERE competition_id = ?`,
      ).bind(competitionId),
    );
  }
  if (hasLedger) {
    stmts.push(
      env.DB.prepare(
        `DELETE FROM quran_daily_ledger WHERE context_type = 'competition' AND context_id = ?`,
      ).bind(competitionId),
    );
  }
  if (hasSird) {
    stmts.push(
      env.DB.prepare(`DELETE FROM sird_period_records WHERE competition_id = ?`).bind(
        competitionId,
      ),
    );
  }
  stmts.push(
    env.DB.prepare(`DELETE FROM competitions WHERE id = ? AND complex_id = ?`).bind(
      competitionId,
      complexId,
    ),
  );

  await env.DB.batch(stmts);
  return true;
}

/** O(1) batch — delete task logs then task row */
export async function deleteCompetitionTask(
  env: Env,
  competitionId: number,
  taskId: number,
): Promise<void> {
  const stmts: ReturnType<typeof env.DB.prepare>[] = [];
  if (await hasTable(env, "competition_logs")) {
    stmts.push(
      env.DB.prepare(
        `DELETE FROM competition_logs WHERE competition_id = ? AND task_id = ?`,
      ).bind(competitionId, taskId),
    );
  }
  stmts.push(
    env.DB.prepare(
      `DELETE FROM competition_tasks WHERE id = ? AND competition_id = ?`,
    ).bind(taskId, competitionId),
  );
  await env.DB.batch(stmts);
}

export type DashboardTargetRow = {
  student_id: number;
  full_name_ar: string;
  current_memorization: number;
  target_amount: number;
  achieved_amount: number;
};

/** O(1) — update single student target_amount */
export async function updateStudentTargetAmount(
  env: Env,
  competitionId: number,
  studentId: number,
  targetAmount: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE competition_targets SET target_amount = ?
     WHERE competition_id = ? AND student_id = ?`,
  )
    .bind(targetAmount, competitionId, studentId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** O(1) — remove one student from competition targets */
export async function deleteStudentTarget(
  env: Env,
  competitionId: number,
  studentId: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `DELETE FROM competition_targets WHERE competition_id = ? AND student_id = ?`,
  )
    .bind(competitionId, studentId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * O(D) — seed one addition task per competition day for new_memorization.
 * Time O(D); Space O(D) batch statements.
 */
export async function seedMemorizationDailyTasks(
  env: Env,
  competitionId: number,
  startDate: string,
  endDate: string,
  unit: MemorizationUnit,
  representativeTarget: number,
): Promise<void> {
  if (!(await hasEngineTasks(env))) return;
  const hasInputType = await hasTaskInputType(env);
  const days = countCompetitionDays(startDate, endDate);
  const facesPerDay = dailyFaces(
    totalFacesFromUnit(unit, representativeTarget),
    days,
  );
  const stmts: ReturnType<typeof env.DB.prepare>[] = [];
  for (let d = 1; d <= days; d++) {
    if (hasInputType) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO competition_tasks
           (competition_id, name_ar, weight, type, input_type, sort_order)
           VALUES (?, ?, ?, 'addition', 'numeric', ?)`,
        ).bind(
          competitionId,
          `اليوم ${d} — ${facesPerDay} وجه`,
          facesPerDay,
          d,
        ),
      );
    } else {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO competition_tasks (competition_id, name_ar, weight, type, sort_order)
           VALUES (?, ?, ?, 'addition', ?)`,
        ).bind(
          competitionId,
          `اليوم ${d} — ${facesPerDay} وجه`,
          facesPerDay,
          d,
        ),
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

/** @deprecated use seedMemorizationDailyTasks */
export const seedNewMemorizationDailyTasks = seedMemorizationDailyTasks;

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
