import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import {
  hasCompetitionCategory,
  hasEngineTargets,
  loadCompetitionDayLogsHydrated,
  buildCompetitionLeaderboard,
  upsertStudentTargets,
  type StudentTargetInput,
} from "./competition-engine";
import { studentsInTeacherCircle } from "./teacher-circle";
import { resolveTrackSupervisorTrackIds } from "./student-placement";

export const TEACHER_CIRCLE_OWNERSHIP = "teacher_circle";
export const COMPETITION_SOURCE_EDU_DEPT = "edu_dept";
export const COMPETITION_SOURCE_TEACHER_CIRCLE = "teacher_circle";

/** شرط SQL لقائمة قسم التعليم — O(1) جزء ثابت */
export function eduDeptSourceSql(alias: string, hasSourceCol: boolean): string {
  const col = alias ? `${alias}.` : "";
  if (hasSourceCol) {
    return `${col}competition_source = '${COMPETITION_SOURCE_EDU_DEPT}'`;
  }
  return `(json_extract(${col}rules_json, '$.ownership') IS NULL OR json_extract(${col}rules_json, '$.ownership') != '${TEACHER_CIRCLE_OWNERSHIP}')`;
}

/** شرط SQL لقائمة حلقة المعلم — O(1) جزء ثابت */
export function teacherCircleSourceSql(alias: string, hasSourceCol: boolean): string {
  const col = alias ? `${alias}.` : "";
  if (hasSourceCol) {
    return `${col}competition_source = '${COMPETITION_SOURCE_TEACHER_CIRCLE}'`;
  }
  return `json_extract(${col}rules_json, '$.ownership') = '${TEACHER_CIRCLE_OWNERSHIP}'`;
}

export async function useUnifiedTeacherCompetitions(env: Env): Promise<boolean> {
  return (
    (await hasCompetitionCategory(env)) &&
    (await hasEngineTargets(env)) &&
    (await tableHasColumn(env, "competitions", "created_by_user_id"))
  );
}

export function teacherCircleRules(extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    ownership: TEACHER_CIRCLE_OWNERSHIP,
    scoring: { default_task_weight: 1 },
    ...(extra ?? {}),
  };
}

export function isTeacherCircleCompetition(rulesJson: string | null | undefined): boolean {
  if (!rulesJson?.trim()) return false;
  try {
    const rules = JSON.parse(rulesJson) as { ownership?: string };
    return rules.ownership === TEACHER_CIRCLE_OWNERSHIP;
  } catch {
    return false;
  }
}

export async function assertTeacherOwnsUnifiedCompetition(
  env: Env,
  competitionId: number,
  teacherUserId: number,
  complexId: number,
): Promise<boolean> {
  const hasCreatedBy = await tableHasColumn(env, "competitions", "created_by_user_id");
  const hasSource = await tableHasColumn(env, "competitions", "competition_source");
  const sourceClause = hasSource
    ? " AND competition_source = ?"
    : " AND json_extract(rules_json, '$.ownership') = ?";
  const sourceBind = hasSource
    ? COMPETITION_SOURCE_TEACHER_CIRCLE
    : TEACHER_CIRCLE_OWNERSHIP;
  const row = hasCreatedBy
    ? await env.DB.prepare(
        `SELECT id, rules_json FROM competitions
         WHERE id = ? AND complex_id = ? AND created_by_user_id = ?${sourceClause}`,
      )
        .bind(competitionId, complexId, teacherUserId, sourceBind)
        .first<{ id: number; rules_json: string }>()
    : await env.DB.prepare(
        `SELECT id, rules_json FROM competitions WHERE id = ? AND complex_id = ?${sourceClause}`,
      )
        .bind(competitionId, complexId, sourceBind)
        .first<{ id: number; rules_json: string }>();
  return Boolean(row && isTeacherCircleCompetition(row.rules_json));
}

export async function createTeacherCircleCompetition(
  env: Env,
  complexId: number,
  teacherUserId: number,
  teacherRole: string,
  name: string,
  startDate: string,
  endDate: string,
  circleId: number,
): Promise<number> {
  const hasCreatedBy = await tableHasColumn(env, "competitions", "created_by_user_id");
  const hasTargetScope = await tableHasColumn(env, "competitions", "target_scope");
  const hasCategory = await tableHasColumn(env, "competitions", "category");
  const hasSource = await tableHasColumn(env, "competitions", "competition_source");

  const students = await studentsInTeacherCircle(
    env,
    complexId,
    teacherUserId,
    teacherRole,
  );
  if (!students?.length) throw new Error("no_students");

  const cols = ["complex_id", "name_ar", "start_date", "end_date", "status", "rules_json"];
  const vals = ["?", "?", "?", "?", "'active'", "?"];
  const binds: (string | number)[] = [
    complexId,
    name,
    startDate,
    endDate,
    JSON.stringify(teacherCircleRules()),
  ];

  if (hasCategory) {
    cols.push("category");
    vals.push("'review'");
  }
  if (hasTargetScope) {
    cols.push("target_scope");
    vals.push("?");
    if (teacherRole === "track_supervisor") {
      const trackIds = await resolveTrackSupervisorTrackIds(
        env,
        teacherUserId,
        complexId,
      );
      binds.push(JSON.stringify({ track_ids: trackIds }));
    } else {
      binds.push(JSON.stringify({ circle_ids: [circleId] }));
    }
  }
  if (hasCreatedBy) {
    cols.push("created_by_user_id");
    vals.push("?");
    binds.push(teacherUserId);
  }
  if (hasSource) {
    cols.push("competition_source");
    vals.push("?");
    binds.push(COMPETITION_SOURCE_TEACHER_CIRCLE);
  }

  const ins = await env.DB.prepare(
    `INSERT INTO competitions (${cols.join(", ")}) VALUES (${vals.join(", ")})`,
  )
    .bind(...binds)
    .run();

  const competitionId = Number(ins.meta.last_row_id);
  const targets: StudentTargetInput[] = students.map((s) => ({
    student_id: s.id,
    current_memorization: 0,
    target_amount: 0,
  }));
  await upsertStudentTargets(env, competitionId, targets);

  return competitionId;
}

export async function loadTeacherCompetitionScores(
  env: Env,
  competitionId: number,
  logDate: string,
): Promise<Array<{ task_id: number; student_id: number; points: number }>> {
  const hydrated = await loadCompetitionDayLogsHydrated(env, competitionId, logDate);
  const out: Array<{ task_id: number; student_id: number; points: number }> = [];
  for (const [sid, audit] of hydrated.entries()) {
    for (const [taskId, pts] of Object.entries(audit.task_points)) {
      out.push({
        student_id: sid,
        task_id: Number(taskId),
        points: Number(pts) || 0,
      });
    }
  }
  return out;
}

export async function teacherCompetitionLeaderboard(
  env: Env,
  competitionId: number,
  students: Array<{ id: number; full_name_ar: string }>,
  dateFrom: string,
  dateTo: string,
) {
  const board = await buildCompetitionLeaderboard(env, competitionId, dateFrom, dateTo);
  return students
    .map((s) => ({
      rank: 0,
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      total_points: board.get(s.id)?.earned_score ?? 0,
    }))
    .sort(
      (a, b) =>
        b.total_points - a.total_points ||
        a.full_name_ar.localeCompare(b.full_name_ar, "ar"),
    )
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
