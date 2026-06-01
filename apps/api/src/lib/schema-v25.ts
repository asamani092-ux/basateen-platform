/**
 * Canonical v2.5 schema (023_rebuild_v25.sql) — no guessed column names.
 * Legacy DBs with `users.role` or `circles.track_id` use dynamic SQL elsewhere.
 */
import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import { usersHaveRoleColumn } from "./db-user";

/** circles.stage TEXT → stage_id 1–4 */
export const V25_CIRCLE_STAGE_TO_ID_SQL = `CASE c.stage
  WHEN 'tlaqeen' THEN 1
  WHEN 'primary' THEN 2
  WHEN 'middle' THEN 3
  WHEN 'secondary' THEN 4
  ELSE 2
END`;

export async function usesV25FlatStaffSchema(env: Env): Promise<boolean> {
  if (await usersHaveRoleColumn(env)) return false;
  if (!(await tableHasColumn(env, "users", "is_teacher"))) return false;
  if (!(await tableHasColumn(env, "users", "is_track_supervisor"))) return false;
  if (!(await tableHasColumn(env, "circles", "teacher_id"))) return false;
  if (!(await tableHasColumn(env, "circles", "stage"))) return false;
  if (!(await hasTable(env, "tracks"))) return false;
  if (!(await tableHasColumn(env, "tracks", "supervisor_id"))) return false;
  return true;
}

/** GET /api/admin/teachers — v25 users + circles + tracks (023) */
export function teachersListSqlV25(): string {
  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            CASE
              WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
              ELSE 'teacher'
            END AS role,
            c.id AS circle_id,
            c.name_ar AS circle_name,
            tr.name_ar AS track_name,
            ${V25_CIRCLE_STAGE_TO_ID_SQL} AS stage_id
     FROM users u
     LEFT JOIN circles c
       ON c.teacher_id = u.id
      AND c.complex_id = u.complex_id
      AND c.is_active = 1
     LEFT JOIN tracks tr
       ON tr.supervisor_id = u.id
      AND tr.complex_id = u.complex_id
      AND tr.is_active = 1
     WHERE u.complex_id = ?
       AND (
         COALESCE(u.is_teacher, 0) = 1
         OR COALESCE(u.is_track_supervisor, 0) = 1
       )
     ORDER BY u.full_name_ar`;
}

export const V25_SUPERVISOR_FLAG_RESET = {
  is_admin: 0,
  is_educational: 0,
  is_programs: 0,
  is_teacher: 0,
  is_track_supervisor: 0,
} as const;

/** Map API supervisor role → v25 flat flags (023 users table). */
export function v25SupervisorFlagsForRole(
  role: string,
): Record<keyof typeof V25_SUPERVISOR_FLAG_RESET, number> {
  const base = { ...V25_SUPERVISOR_FLAG_RESET };
  if (role === "edu_supervisor") return { ...base, is_educational: 1 };
  if (role === "programs_supervisor" || role === "prog_supervisor") {
    return { ...base, is_programs: 1 };
  }
  if (role === "track_supervisor") return { ...base, is_track_supervisor: 1 };
  /* admin_supervisor | general_supervisor | super_admin → مشرف عام */
  return { ...base, is_admin: 1 };
}
