import type { Env } from "../types";
import { loadUserScope, parseSupervisorScope } from "./supervisor-scope";

export const MATRIX_STAGES = [
  "tlaqeen",
  "primary",
  "middle",
  "secondary",
] as const;

export type MatrixStage = (typeof MATRIX_STAGES)[number];

export const STAGE_ID_TO_MATRIX: Record<number, MatrixStage> = {
  1: "tlaqeen",
  2: "primary",
  3: "middle",
  4: "secondary",
};

export const MATRIX_STAGE_LABELS: Record<MatrixStage, string> = {
  tlaqeen: "تلقين",
  primary: "ابتدائي",
  middle: "متوسط",
  secondary: "ثانوي",
};

export type EduMatrixUserFlags = {
  is_educational: number;
  is_teacher: number;
  is_track_supervisor: number;
  role: string;
};

export async function loadMatrixUserFlags(
  env: Env,
  userId: number,
): Promise<EduMatrixUserFlags | null> {
  const row = await env.DB.prepare(
    `SELECT role,
            COALESCE(is_educational, 0) AS is_educational,
            COALESCE(is_teacher, 0) AS is_teacher,
            COALESCE(is_track_supervisor, 0) AS is_track_supervisor
     FROM users WHERE id = ? AND is_active = 1`,
  )
    .bind(userId)
    .first<EduMatrixUserFlags>();

  return row ?? null;
}

/** Infer flags from legacy role when columns are unset */
export function effectiveMatrixFlags(flags: EduMatrixUserFlags): EduMatrixUserFlags {
  const isTeacher =
    flags.is_teacher === 1 || flags.role === "teacher" ? 1 : 0;
  const isEducational =
    flags.is_educational === 1 ||
    flags.role === "edu_supervisor" ||
    flags.role === "general_manager" ||
    flags.role === "general_supervisor"
      ? 1
      : 0;
  const isTrackSupervisor =
    flags.is_track_supervisor === 1 ? 1 : 0;
  return {
    ...flags,
    is_teacher: isTeacher,
    is_educational: isEducational,
    is_track_supervisor: isTrackSupervisor,
  };
}

export function matrixStageFilterFromScope(
  scope: ReturnType<typeof parseSupervisorScope>,
  stageParam: string | null,
): { sql: string; binds: string[] } {
  if (stageParam && MATRIX_STAGES.includes(stageParam as MatrixStage)) {
    return { sql: "s.stage = ?", binds: [stageParam] };
  }
  if (scope.type === "global") {
    return { sql: "1=1", binds: [] };
  }
  const stages = scope.stageIds
    .map((id) => STAGE_ID_TO_MATRIX[id])
    .filter(Boolean) as MatrixStage[];
  if (stages.length === 0) {
    return { sql: "1=1", binds: [] };
  }
  const ph = stages.map(() => "?").join(",");
  return { sql: `s.stage IN (${ph})`, binds: stages };
}

export async function matrixSupervisorScope(env: Env, userId: number) {
  const row = await env.DB.prepare(
    "SELECT supervisor_scope FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<{ supervisor_scope: string | null }>();
  return parseSupervisorScope(row?.supervisor_scope);
}

export async function supervisorCanAccessMatrix(env: Env, userId: number) {
  const flags = await loadMatrixUserFlags(env, userId);
  if (!flags) return false;
  const eff = effectiveMatrixFlags(flags);
  return (
    eff.is_educational === 1 ||
    flags.role === "edu_supervisor" ||
    flags.role === "general_manager"
  );
}

export function autoLinkFromMetrics(body: {
  has_memorized?: number;
  has_repeated?: number;
  has_reviewed?: number;
  has_linked?: number;
}): number {
  if (body.has_linked === 1) return 1;
  const m = body.has_memorized === 1;
  const r = body.has_repeated === 1;
  const v = body.has_reviewed === 1;
  return m && r && v ? 1 : 0;
}

export async function upsertMatrixAttendance(
  env: Env,
  opts: {
    studentId: number;
    date: string;
    contextType: string;
    contextId: number;
    recordedBy: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO edu_matrix_attendance
       (student_id, date, context_type, context_id, status, recorded_by, recorded_at)
     VALUES (?, ?, ?, ?, 'present', ?, datetime('now'))
     ON CONFLICT(student_id, date, context_type, context_id) DO UPDATE SET
       status = 'present',
       recorded_by = excluded.recorded_by,
       recorded_at = datetime('now')`,
  )
    .bind(
      opts.studentId,
      opts.date,
      opts.contextType,
      opts.contextId,
      opts.recordedBy,
    )
    .run();
}
