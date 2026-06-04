/**
 * Unified staff roster — schema from 023_rebuild_v25.sql (+ legacy role column).
 */
import type { Env } from "../types";
import { hashPassword } from "./password";
import { hasTable, tableHasColumn } from "./db-schema";
import { usersHaveRoleColumn } from "./db-user";
import {
  usesV25FlatStaffSchema,
  v25TeacherFlags,
  v25TrackSupervisorFlags,
  V25_CIRCLE_STAGE_TO_ID_SQL,
} from "./schema-v25";

/** Table used for reads (canonical `circles` preferred). */
export async function primaryCirclesTable(env: Env): Promise<string | null> {
  if (await hasTable(env, "circles")) return "circles";
  if (await hasTable(env, "circles_legacy_035")) return "circles_legacy_035";
  if (await hasTable(env, "circles_fix_036")) return "circles_fix_036";
  return null;
}

/** All circle tables that may exist after a partial 035/036 migration. */
export async function staffCircleTableNames(env: Env): Promise<string[]> {
  const names: string[] = [];
  if (await hasTable(env, "circles")) names.push("circles");
  if (await hasTable(env, "circles_legacy_035")) names.push("circles_legacy_035");
  if (await hasTable(env, "circles_fix_036")) names.push("circles_fix_036");
  return names;
}

function circleAssignmentCols(circlesTable: string | null): {
  circleId: string;
  circleName: string;
} {
  if (!circlesTable) {
    return {
      circleId: "NULL AS circle_id",
      circleName: "NULL AS circle_name",
    };
  }
  const active = `COALESCE(c.is_active, 1) = 1`;
  return {
    circleId: `(SELECT c.id FROM ${circlesTable} c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND ${active} LIMIT 1) AS circle_id`,
    circleName: `(SELECT c.name_ar FROM ${circlesTable} c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND ${active} LIMIT 1) AS circle_name`,
  };
}

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
const DEFAULT_PASSWORD = "Basateen123!";

function emailForMobile(mobile: string, role: string): string {
  const clean = mobile.replace(/\D/g, "");
  return `${role}-${clean}@basateen.local`;
}

/** إدراج معلم أو مشرف مسار — يدعم عمود role أو أعلام v25 */
export async function insertStaffUser(
  env: Env,
  complexId: number,
  body: {
    full_name_ar: string;
    mobile: string;
    role: "teacher" | "track_supervisor";
  },
): Promise<number> {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const hasRoleCol = await usersHaveRoleColumn(env);
  const cols = ["complex_id", "email", "mobile", "password_hash", "full_name_ar"];
  const vals: (string | number)[] = [
    complexId,
    emailForMobile(body.mobile, body.role),
    body.mobile,
    passwordHash,
    body.full_name_ar,
  ];

  if (hasRoleCol) {
    cols.push("role");
    vals.push(body.role);
  } else if (await usesV25FlatStaffSchema(env)) {
    const flags =
      body.role === "track_supervisor"
        ? v25TrackSupervisorFlags()
        : v25TeacherFlags();
    for (const [flag, value] of Object.entries(flags)) {
      if (await tableHasColumn(env, "users", flag)) {
        cols.push(flag);
        vals.push(value);
      }
    }
  } else if (await tableHasColumn(env, "users", "is_teacher")) {
    cols.push("is_teacher");
    vals.push(body.role === "teacher" ? 1 : 0);
    if (await tableHasColumn(env, "users", "is_track_supervisor")) {
      cols.push("is_track_supervisor");
      vals.push(body.role === "track_supervisor" ? 1 : 0);
    }
  }

  const placeholders = cols.map(() => "?").join(", ");
  const ins = await env.DB.prepare(
    `INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders})`,
  )
    .bind(...vals)
    .run();

  return Number(ins.meta.last_row_id);
}

function staffListSqlV25(circlesTable: string | null): string {
  const { circleId, circleName } = circleAssignmentCols(circlesTable);
  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            CASE
              WHEN COALESCE(u.is_admin, 0) = 1 THEN 'super_admin'
              WHEN COALESCE(u.is_educational, 0) = 1 THEN 'edu_supervisor'
              WHEN COALESCE(u.is_programs, 0) = 1 THEN 'programs_supervisor'
              WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
              WHEN COALESCE(u.is_teacher, 0) = 1 THEN 'teacher'
              ELSE 'teacher'
            END AS role,
            ${circleId},
            ${circleName},
            (SELECT t.id FROM tracks t
             WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
               AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_id,
            (SELECT t.name_ar FROM tracks t
             WHERE t.supervisor_id = u.id AND t.complex_id = u.complex_id
               AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_name,
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
  const circlesTable = await primaryCirclesTable(env);

  if (await usesV25FlatStaffSchema(env)) {
    return staffListSqlV25(circlesTable);
  }

  const hasRole = await usersHaveRoleColumn(env);
  const { circleId, circleName } = circleAssignmentCols(circlesTable);
  if (hasRole) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
              CASE u.role
                WHEN 'general_supervisor' THEN 'super_admin'
                WHEN 'admin_supervisor' THEN 'super_admin'
                WHEN 'prog_supervisor' THEN 'programs_supervisor'
                ELSE u.role
              END AS role,
              ${circleId},
              ${circleName},
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

  return staffListSqlV25(circlesTable);
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

/** فك ارتباط الحلقات/المسارات قبل الحذف (teacher_id / supervisor_id → NULL). */
async function detachStaffStructureStatements(
  env: Env,
  userId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];

  for (const table of await staffCircleTableNames(env)) {
    if (!(await tableHasColumn(env, table, "teacher_id"))) continue;
    stmts.push(
      env.DB.prepare(
        `UPDATE ${table} SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
      ).bind(userId, complexId),
    );
  }

  if (await tableHasColumn(env, "tracks", "supervisor_id")) {
    stmts.push(
      env.DB.prepare(
        `UPDATE tracks SET supervisor_id = NULL WHERE supervisor_id = ? AND complex_id = ?`,
      ).bind(userId, complexId),
    );
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
    console.error("[admin-staff] delete batch failed:", err);
    if (await tableHasColumn(env, "users", "is_active")) {
      await env.DB.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`)
        .bind(userId)
        .run();
      for (const table of await staffCircleTableNames(env)) {
        if (!(await tableHasColumn(env, table, "teacher_id"))) continue;
        try {
          await env.DB.prepare(
            `UPDATE ${table} SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
          )
            .bind(userId, complexId)
            .run();
        } catch {
          /* legacy table may still be NOT NULL until 036 recover */
        }
      }
      return { soft_deleted: true };
    }
    throw err;
  }
}

export { SOVEREIGN_USER_ID, V25_CIRCLE_STAGE_TO_ID_SQL };
