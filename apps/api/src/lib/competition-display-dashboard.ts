import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import type { ScopeMode } from "./dept-scope";
import {
  aggregateSirdStudentStats,
  aggregateTargetVolumeMetrics,
  buildCompetitionLeaderboard,
  disciplinePctFromAttendanceLogs,
  disciplinePctFromMetricsStudentDays,
  hasEngineLogs,
  hasEngineTargets,
  hasEngineTasks,
  hasSirdPeriodRecords,
  loadCompetitionLogsForLeaderboard,
  loadCompetitionTargetRows,
  loadCompetitionTaskMeta,
  loadSirdPeriodsMatrix,
  memorizationPointsToJuz,
  parseMemorizationUnit,
  resolveAttendanceTaskId,
  sumMemorizationLogPoints,
  sumReadFacesFromTaskLogs,
  sumSirdReadFaces,
  type MemorizationUnit,
  resolveCompetitionStudents,
} from "./competition-engine";

export type CompetitionDisplayLeader = {
  student_id: number;
  full_name_ar: string | null | undefined;
  achievement_pct?: number;
  overall_pct?: number;
  mastery_pct?: number;
  score?: number;
  read_count?: number;
  passed_count?: number;
};

export type CompetitionDisplayKpis = {
  discipline_pct: number;
  achievement_pct: number;
  overall_pct?: number;
  participants: number;
  target_juz: number;
  target_hizb: number;
  target_faces: number;
  read_faces: number;
  achieved_juz?: number;
  mastery_pct?: number;
  total_read?: number;
  total_passed?: number;
};

export type CompetitionDisplaySnapshot = {
  competition_id: number;
  name_ar: string;
  category: string;
  date_from: string;
  date_to: string;
  kpis: CompetitionDisplayKpis;
  leaders: CompetitionDisplayLeader[];
};

export type LoadCompetitionDisplayDashboardInput = {
  complexId: number;
  competitionId: number;
  scope: ScopeMode;
  dateFrom?: string;
  dateTo?: string;
  leaderboardMode?: "top" | "all";
};

function memorizationUnitFromRules(rules: Record<string, unknown>): MemorizationUnit {
  return parseMemorizationUnit(rules.memorization_unit);
}

/**
 * نفس محرك لوحة edu-dept/competitions/:id/dashboard — لا إعادة حساب منفصلة.
 * الزمن: O(L + T + S) استعلامات مجمّعة؛ المكان: O(S) لخرائط الطلاب والمتصدرين.
 */
export async function loadCompetitionDisplayDashboard(
  env: Env,
  input: LoadCompetitionDisplayDashboardInput,
): Promise<CompetitionDisplaySnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM competitions WHERE id = ? AND complex_id = ?`,
  )
    .bind(input.competitionId, input.complexId)
    .first<Record<string, unknown>>();
  if (!row) return null;

  const id = input.competitionId;
  const dateFrom = input.dateFrom ?? String(row.start_date);
  const dateTo = input.dateTo ?? String(row.end_date);
  const leaderboardMode = input.leaderboardMode ?? "top";
  const hasCompAttendance = await hasTable(env, "competition_attendance");
  const engineTargets = await hasEngineTargets(env);
  const engineTasks = await hasEngineTasks(env);
  const engineLogs = await hasEngineLogs(env);

  const studentIds = await resolveCompetitionStudents(
    env,
    input.complexId,
    id,
    input.scope,
  );
  const totalStudents = studentIds.length;

  const category = String(row.category ?? "recitation");
  const compRules = JSON.parse(String(row.rules_json ?? "{}")) as Record<string, unknown>;
  const memorizationUnit = memorizationUnitFromRules(compRules);

  let targetRowsEarly: Awaited<ReturnType<typeof loadCompetitionTargetRows>> = [];
  if (engineTargets) {
    targetRowsEarly = await loadCompetitionTargetRows(env, id);
  }
  const volumeTargets = aggregateTargetVolumeMetrics(
    category,
    memorizationUnit,
    targetRowsEarly.map((t) => ({ target_amount: Number(t.target_amount ?? 0) })),
  );

  const taskMetaEarly = engineTasks ? await loadCompetitionTaskMeta(env, id) : [];
  const attendanceTaskId = await resolveAttendanceTaskId(env, id, taskMetaEarly);
  const memorizationTaskId =
    taskMetaEarly.find((t) => t.criterion_id === "memorization")?.id ?? null;
  const logsForMetrics = engineLogs
    ? await loadCompetitionLogsForLeaderboard(env, id, dateFrom, dateTo)
    : [];

  let disciplinePct = 0;
  const hasMetricsJsonCol = await tableHasColumn(env, "competition_logs", "metrics_json");
  if (hasMetricsJsonCol && attendanceTaskId) {
    const hasTaskIdCol = await tableHasColumn(env, "competition_logs", "task_id");
    const canonFilter = hasTaskIdCol
      ? " AND (task_id IS NULL OR CAST(task_id AS INTEGER) = 0)"
      : "";
    const metricRows = await env.DB.prepare(
      `SELECT metrics_json FROM competition_logs
       WHERE competition_id = ? AND log_date >= ? AND log_date <= ?${canonFilter}`,
    )
      .bind(id, dateFrom, dateTo)
      .all<{ metrics_json: string }>();
    disciplinePct = disciplinePctFromMetricsStudentDays(
      metricRows.results ?? [],
      attendanceTaskId,
    );
  }
  if (disciplinePct === 0) {
    disciplinePct = disciplinePctFromAttendanceLogs(logsForMetrics, attendanceTaskId);
  }
  if (disciplinePct === 0 && hasCompAttendance && totalStudents > 0) {
    const hasAttStatus = await tableHasColumn(env, "competition_attendance", "status");
    const att = await env.DB.prepare(
      hasAttStatus
        ? `SELECT COUNT(*) AS total_marks,
                  SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_marks
           FROM competition_attendance
           WHERE competition_id = ? AND attendance_date BETWEEN ? AND ?
             AND status IN ('present', 'absent')`
        : `SELECT COUNT(*) AS total_marks,
                  SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) AS present_marks
           FROM competition_attendance
           WHERE competition_id = ? AND attendance_date BETWEEN ? AND ?`,
    )
      .bind(id, dateFrom, dateTo)
      .first<{ total_marks: number; present_marks: number }>();
    const totalMarks = Number(att?.total_marks ?? 0);
    const presentMarks = Number(att?.present_marks ?? 0);
    disciplinePct = totalMarks > 0 ? Math.round((presentMarks / totalMarks) * 100) : 0;
  }

  let metricsJuzFallback = 0;
  if (!memorizationTaskId && hasMetricsJsonCol) {
    const mjRows = await env.DB.prepare(
      `SELECT metrics_json
       FROM competition_logs
       WHERE competition_id = ? AND log_date >= ? AND log_date <= ?`,
    )
      .bind(id, dateFrom, dateTo)
      .all<{ metrics_json: string }>();
    for (const r of mjRows.results ?? []) {
      try {
        const m = JSON.parse(String(r.metrics_json ?? "{}")) as Record<string, unknown>;
        metricsJuzFallback += Math.max(0, Number(m.juz_done ?? 0));
      } catch {
        /* skip */
      }
    }
  }

  if (category === "recitation" && (await hasSirdPeriodRecords(env))) {
    const targetRows = engineTargets ? await loadCompetitionTargetRows(env, id) : [];
    const matrix = await loadSirdPeriodsMatrix(env, id);
    const sirdRows = targetRows.map((t) =>
      aggregateSirdStudentStats(
        t.student_id,
        t.full_name_ar,
        matrix.get(t.student_id) ?? [],
      ),
    );
    const sorted = [...sirdRows].sort((a, b) => b.mastery_pct - a.mastery_pct);
    const leaders =
      leaderboardMode === "all" ? sorted : sorted.slice(0, 5);
    const totalRead = sirdRows.reduce((s, r) => s + r.read_count, 0);
    const totalPassed = sirdRows.reduce((s, r) => s + r.passed_count, 0);
    const masteryPct = totalRead > 0 ? Math.round((totalPassed / totalRead) * 100) : 0;
    const sirdReadFaces = sumSirdReadFaces(matrix);

    return {
      competition_id: id,
      name_ar: String(row.name_ar ?? ""),
      category,
      date_from: dateFrom,
      date_to: dateTo,
      kpis: {
        discipline_pct: disciplinePct,
        achievement_pct: masteryPct,
        participants: totalStudents,
        target_juz: volumeTargets.target_juz,
        target_hizb: volumeTargets.target_hizb,
        target_faces: volumeTargets.target_faces,
        read_faces: sirdReadFaces,
        achieved_juz: 0,
        mastery_pct: masteryPct,
        total_read: totalRead,
        total_passed: totalPassed,
      },
      leaders: leaders.map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        mastery_pct: r.mastery_pct,
        achievement_pct: r.mastery_pct,
        read_count: r.read_count,
        passed_count: r.passed_count,
      })),
    };
  }

  let targetRows: Awaited<ReturnType<typeof loadCompetitionTargetRows>> = [];
  if (engineTargets) {
    targetRows = await loadCompetitionTargetRows(env, id);
  }

  const leaderboardMap = await buildCompetitionLeaderboard(env, id, dateFrom, dateTo);
  const nameMap = new Map(targetRows.map((t) => [t.student_id, t.full_name_ar]));
  const targetByStudent = new Map(
    targetRows.map((t) => [t.student_id, Number(t.target_amount ?? 0)]),
  );

  const leaderStudentIds =
    targetRows.length > 0
      ? targetRows.map((t) => t.student_id)
      : [...leaderboardMap.keys()];

  const allLeaders = leaderStudentIds
    .map((student_id) => {
      const lb = leaderboardMap.get(student_id);
      const overallPct = lb?.overall_pct ?? 0;
      return {
        student_id,
        score: lb?.earned_score ?? 0,
        overall_pct: overallPct,
        full_name_ar: nameMap.get(student_id),
        target_amount: targetByStudent.get(student_id) ?? 0,
        achievement_pct: overallPct,
      };
    })
    .sort((a, b) => (b.overall_pct ?? 0) - (a.overall_pct ?? 0));

  const avgOverall =
    allLeaders.length > 0
      ? Math.round(
          (allLeaders.reduce((s, r) => s + (r.overall_pct ?? 0), 0) / allLeaders.length) * 10,
        ) / 10
      : 0;

  const leaders = leaderboardMode === "all" ? allLeaders : allLeaders.slice(0, 5);

  let achievedSum = 0;
  if (category === "new_memorization" && memorizationTaskId) {
    const memPts = sumMemorizationLogPoints(logsForMetrics, memorizationTaskId);
    for (const t of targetRows) {
      achievedSum += memorizationPointsToJuz(memPts.get(t.student_id) ?? 0);
    }
  }

  const readFaces = sumReadFacesFromTaskLogs(
    logsForMetrics,
    memorizationTaskId,
    metricsJuzFallback,
  );

  return {
    competition_id: id,
    name_ar: String(row.name_ar ?? ""),
    category,
    date_from: dateFrom,
    date_to: dateTo,
    kpis: {
      discipline_pct: disciplinePct,
      achievement_pct: avgOverall,
      overall_pct: avgOverall,
      participants: totalStudents,
      target_juz: volumeTargets.target_juz,
      target_hizb: volumeTargets.target_hizb,
      target_faces: volumeTargets.target_faces,
      read_faces: readFaces,
      achieved_juz: Math.round(achievedSum * 100) / 100,
    },
    leaders,
  };
}
