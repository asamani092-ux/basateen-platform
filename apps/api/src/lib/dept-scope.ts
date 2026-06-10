import type { Env } from "../types";
import { hasTable, tableHasColumn, studentIsActiveSql } from "./db-schema";

export const STAGE_LABELS: Record<number, string> = {
  1: "تلقين",
  2: "ابتدائي",
  3: "متوسط",
  4: "ثانوي",
};

export type ScopeMode = { type: "global" } | { type: "stages"; stageIds: number[] };

/** O(n) on comma-separated stage ids, n small */
export function parseStageScope(raw: string | null | undefined): ScopeMode {
  const s = (raw ?? "global").trim();
  if (!s || s === "global") return { type: "global" };
  const ids = s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => n >= 1 && n <= 4);
  if (ids.length === 0) return { type: "global" };
  return { type: "stages", stageIds: [...new Set(ids)] };
}

export async function loadUserScope(env: Env, userId: number): Promise<ScopeMode> {
  const raw = await readSupervisorScopeString(env, userId);
  return parseStageScope(raw);
}

/** لا يرمي استثناء — يعود لنطاق عام عند أي فشل */
export async function safeLoadUserScope(env: Env, userId: number): Promise<ScopeMode> {
  try {
    return await loadUserScope(env, userId);
  } catch (err) {
    console.error("safeLoadUserScope failed:", err);
    return { type: "global" };
  }
}

export async function readSupervisorScopeString(
  env: Env,
  userId: number,
): Promise<string> {
  try {
    const hasSupervisorScope = await tableHasColumn(env, "users", "supervisor_scope");
    if (hasSupervisorScope) {
      const row = await env.DB.prepare(
        `SELECT supervisor_scope FROM users WHERE id = ?`,
      )
        .bind(userId)
        .first<{ supervisor_scope: string | null }>();
      return (row?.supervisor_scope ?? "global").trim() || "global";
    }
    const hasStageScope = await tableHasColumn(env, "users", "stage_scope");
    if (hasStageScope) {
      const row = await env.DB.prepare(`SELECT stage_scope FROM users WHERE id = ?`)
        .bind(userId)
        .first<{ stage_scope: string | null }>();
      return (row?.stage_scope ?? "global").trim() || "global";
    }
  } catch (err) {
    console.error("readSupervisorScopeString failed:", err);
  }
  return "global";
}

const ACTIVE_PLACEMENT = "h.to_at IS NULL AND h.frozen_at IS NULL";

export function stageFilterWhere(scope: ScopeMode, column = "stage_id"): string {
  if (scope.type === "global") return "1=1";
  const placeholders = scope.stageIds.map(() => "?").join(",");
  return `${column} IN (${placeholders})`;
}

export function stageFilterBinds(scope: ScopeMode): number[] {
  return scope.type === "global" ? [] : [...scope.stageIds];
}

/** @deprecated استخدم buildStudentsInScopeWhere للتوافق مع v25 */
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
      WHERE h.student_id = s.id AND ${ACTIVE_PLACEMENT}
        AND c.stage_id IN (${ph})
    )
  )`;
}

/** Time O(1); Space O(1) — استعلام نطاق طلاب متوافق مع v25 */
export async function buildStudentsInScopeWhere(
  env: Env,
  scope: ScopeMode,
): Promise<string> {
  const activeSql = await studentIsActiveSql(env, "s");
  if (scope.type === "global") {
    return `s.complex_id = ? AND ${activeSql}`;
  }
  const ph = scope.stageIds.map(() => "?").join(",");
  const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
  if (hasCurrentCircle) {
    return `s.complex_id = ? AND ${activeSql} AND (
      s.stage_id IN (${ph})
      OR EXISTS (
        SELECT 1 FROM circles c
        WHERE c.id = s.current_circle_id AND c.stage_id IN (${ph})
      )
    )`;
  }
  return studentsInScopeWhere(scope).replace(
    "s.is_active = 1",
    activeSql,
  );
}

export function studentsInScopeBinds(
  complexId: number,
  scope: ScopeMode,
): number[] {
  if (scope.type === "global") return [complexId];
  return [complexId, ...scope.stageIds, ...scope.stageIds];
}

const STAFF_ROLE_SQL = `u.role IN (
  'super_admin','admin_supervisor','edu_supervisor','programs_supervisor','prog_supervisor','track_supervisor','teacher',
  'general_manager','general_supervisor'
)`;

/** Staff list for admin dept — flat D1 friendly */
export function staffScopeWhere(scope: ScopeMode): string {
  if (scope.type === "global") {
    return `u.complex_id = ? AND u.is_active = 1 AND ${STAFF_ROLE_SQL}`;
  }
  const ph = scope.stageIds.map(() => "?").join(",");
  const phStr = scope.stageIds.map(() => "?").join(",");
  return `u.complex_id = ? AND u.is_active = 1 AND (
    u.role IN ('admin_supervisor','edu_supervisor','general_supervisor')
    AND u.stage_scope IN (${phStr})
  ) OR u.id IN (
    SELECT ta.user_id FROM teacher_assignments ta
    JOIN circles c ON c.id = ta.circle_id
    WHERE c.stage_id IN (${ph})
  )`;
}

export function staffScopeBinds(
  complexId: number,
  scope: ScopeMode,
): (number | string)[] {
  if (scope.type === "global") return [complexId];
  const ids = scope.stageIds;
  return [complexId, ...ids.map(String)];
}

export async function teacherCanAccessStudent(
  env: Env,
  teacherUserId: number,
  studentId: number,
): Promise<boolean> {
  const hasTa = await hasTable(env, "teacher_assignments");
  if (!hasTa) {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM students WHERE id = ? AND is_active = 1 LIMIT 1`,
    )
      .bind(studentId)
      .first<{ ok: number }>();
    return Boolean(row?.ok);
  }

  const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
  if (hasCurrentCircle) {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok
       FROM students s
       JOIN teacher_assignments ta
         ON ta.circle_id = s.current_circle_id AND ta.user_id = ?
       WHERE s.id = ? AND s.is_active = 1
       LIMIT 1`,
    )
      .bind(teacherUserId, studentId)
      .first<{ ok: number }>();
    return Boolean(row?.ok);
  }

  const row = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM students s
     JOIN student_circle_history h
       ON h.student_id = s.id AND ${ACTIVE_PLACEMENT}
     JOIN teacher_assignments ta ON ta.circle_id = h.circle_id AND ta.user_id = ?
     WHERE s.id = ? AND s.is_active = 1
     LIMIT 1`,
  )
    .bind(teacherUserId, studentId)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function canManageCircle(
  env: Env,
  auth: { userId: number; role: string; complexId: number },
  circleId: number,
): Promise<boolean> {
  if (auth.role === "super_admin" || auth.role === "general_manager") return true;
  if (auth.role === "edu_supervisor" || auth.role === "track_supervisor") {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, auth.complexId)
      .first<{ ok: number }>();
    return Boolean(row?.ok);
  }
  if (auth.role === "teacher") {
    if (!(await hasTable(env, "teacher_assignments"))) return false;
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM teacher_assignments WHERE user_id = ? AND circle_id = ?`,
    )
      .bind(auth.userId, circleId)
      .first<{ ok: number }>();
    return Boolean(row?.ok);
  }
  return false;
}

export function canAccessAdminData(role: string): boolean {
  return role === "super_admin" || role === "edu_supervisor" || role === "general_manager";
}
