/**
 * Unified staff roster — schema from 023_rebuild_v25.sql (+ legacy role column).
 */
import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import { usersHaveRoleColumn } from "./db-user";
import { usesV25FlatStaffSchema, V25_CIRCLE_STAGE_TO_ID_SQL } from "./schema-v25";

export type StaffListRow = {
  id: number;
  full_name_ar: string;
  mobile: string | null;
  is_active: number;
  role: string;
  circle_id: number | null;
  circle_name: string | null;
  track_id: number | null;
  track_name: string | null;
  supervisor_scope: string | null;
};

const SOVEREIGN_USER_ID = 1;

export function staffListSqlV25(): string {
  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            CASE
              WHEN COALESCE(u.is_admin, 0) = 1 THEN 'super_admin'
              WHEN COALESCE(u.is_educational, 0) = 1 THEN 'edu_supervisor'
              WHEN COALESCE(u.is_programs, 0) = 1 THEN 'programs_supervisor'
              WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
              WHEN COALESCE(u.is_teacher, 0) = 1 THEN 'teacher'
              ELSE 'teacher'
            END AS role,
            (SELECT c.id FROM circles c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND c.is_active = 1 LIMIT 1) AS circle_id,
            (SELECT c.name_ar FROM circles c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND c.is_active = 1 LIMIT 1) AS circle_name,
            (SELECT t.id FROM tracks t
             WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
               AND t.is_active = 1 LIMIT 1) AS track_id,
            (SELECT t.name_ar FROM tracks t
             WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
               AND t.is_active = 1 LIMIT 1) AS track_name,
            COALESCE(u.stage_scope, 'global') AS supervisor_scope
     FROM users u
     WHERE u.complex_id = ?
       AND (
         COALESCE(u.is_teacher, 0) = 1
         OR COALESCE(u.is_track_supervisor, 0) = 1
         OR COALESCE(u.is_educational, 0) = 1
         OR COALESCE(u.is_programs, 0) = 1
         OR COALESCE(u.is_admin, 0) = 1
       )
     ORDER BY u.full_name_ar`;
}

export async function staffListSql(env: Env): Promise<string> {
  if (await usesV25FlatStaffSchema(env)) {
    return staffListSqlV25();
  }

  const hasRole = await usersHaveRoleColumn(env);
  if (hasRole) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
              CASE u.role
                WHEN 'general_supervisor' THEN 'super_admin'
                WHEN 'admin_supervisor' THEN 'super_admin'
                WHEN 'prog_supervisor' THEN 'programs_supervisor'
                ELSE u.role
              END AS role,
              (SELECT c.id FROM circles c
               WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
                 AND COALESCE(c.is_active, 1) = 1 LIMIT 1) AS circle_id,
              (SELECT c.name_ar FROM circles c
               WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
                 AND COALESCE(c.is_active, 1) = 1 LIMIT 1) AS circle_name,
              (SELECT t.id FROM tracks t
               WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
                 AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_id,
              (SELECT t.name_ar FROM tracks t
               WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
                 AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_name,
              COALESCE(u.supervisor_scope, u.stage_scope, 'global') AS supervisor_scope
       FROM users u
       WHERE u.complex_id = ?
         AND u.role IN (
           'teacher', 'track_supervisor', 'edu_supervisor', 'programs_supervisor',
           'prog_supervisor', 'admin_supervisor', 'general_supervisor', 'super_admin'
         )
       ORDER BY u.full_name_ar`;
  }

  return staffListSqlV25();
}

async function clearStaffUserRelations(
  env: Env,
  userId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  const childDeletes: Array<[string, string]> = [
    ["sessions", "user_id"],
    ["user_sections", "user_id"],
    ["supervisor_scopes", "user_id"],
    ["teacher_assignments", "user_id"],
    ["staff_attendance", "user_id"],
  ];
  for (const [table, column] of childDeletes) {
    if (!(await hasTable(env, table))) continue;
    if (!(await tableHasColumn(env, table, column))) continue;
    stmts.push(
      env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(userId),
    );
  }
  return stmts;
}

/** Detach circles/tracks before DELETE (v25: NOT NULL → reassign to sovereign id=1). */
async function detachStaffStructureStatements(
  env: Env,
  userId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  const v25 = await usesV25FlatStaffSchema(env);
  const fallbackId = SOVEREIGN_USER_ID;

  if (await tableHasColumn(env, "circles", "teacher_id")) {
    if (v25 && userId !== fallbackId) {
      stmts.push(
        env.DB.prepare(
          `UPDATE circles SET teacher_id = ? WHERE teacher_id = ? AND complex_id = ?`,
        ).bind(fallbackId, userId, complexId),
      );
    } else {
      stmts.push(
        env.DB.prepare(
          `UPDATE circles SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
        ).bind(userId, complexId),
      );
    }
  }

  if (await tableHasColumn(env, "tracks", "supervisor_id")) {
    if (v25 && userId !== fallbackId) {
      stmts.push(
        env.DB.prepare(
          `UPDATE tracks SET supervisor_id = ? WHERE supervisor_id = ? AND complex_id = ?`,
        ).bind(fallbackId, userId, complexId),
      );
    } else {
      stmts.push(
        env.DB.prepare(
          `UPDATE tracks SET supervisor_id = NULL WHERE supervisor_id = ? AND complex_id = ?`,
        ).bind(userId, complexId),
      );
    }
  }

  return stmts;
}

export async function safeDeleteStaffUser(
  env: Env,
  userId: number,
  complexId: number,
): Promise<{ soft_deleted?: boolean }> {
  if (userId === SOVEREIGN_USER_ID) {
    throw new Error("cannot_delete_sovereign_user");
  }

  const exists = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND complex_id = ?`,
  )
    .bind(userId, complexId)
    .first();
  if (!exists) {
    throw new Error("staff_not_found");
  }

  const batch: D1PreparedStatement[] = [
    ...(await detachStaffStructureStatements(env, userId, complexId)),
    ...(await clearStaffUserRelations(env, userId, complexId)),
    env.DB.prepare(`DELETE FROM users WHERE id = ? AND complex_id = ?`).bind(
      userId,
      complexId,
    ),
  ];

  try {
    await env.DB.batch(batch);
    return {};
  } catch (err) {
    if (await tableHasColumn(env, "users", "is_active")) {
      await env.DB.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`)
        .bind(userId)
        .run();
      return { soft_deleted: true };
    }
    throw err;
  }
}

export { SOVEREIGN_USER_ID, V25_CIRCLE_STAGE_TO_ID_SQL };
