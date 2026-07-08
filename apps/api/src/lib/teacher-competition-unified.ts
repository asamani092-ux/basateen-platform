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

export const TEACHER_CIRCLE_OWNERSHIP = "teacher_circle";

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
  const row = hasCreatedBy
    ? await env.DB.prepare(
        `SELECT id, rules_json FROM competitions
         WHERE id = ? AND complex_id = ? AND created_by_user_id = ?`,
      )
        .bind(competitionId, complexId, teacherUserId)
        .first<{ id: number; rules_json: string }>()
    : await env.DB.prepare(
        `SELECT id, rules_json FROM competitions WHERE id = ? AND complex_id = ?`,
      )
        .bind(competitionId, complexId)
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
    binds.push(JSON.stringify({ circle_ids: [circleId] }));
  }
  if (hasCreatedBy) {
    cols.push("created_by_user_id");
    vals.push("?");
    binds.push(teacherUserId);
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
