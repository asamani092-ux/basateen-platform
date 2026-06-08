/**
 * Unified staff roster — standard CRUD against users + circles (023/v25).
 */
import type { Env } from "../types";
import { hashPassword } from "./password";
import { hasTable, tableHasColumn } from "./db-schema";
import { prepareCircleHardDelete, runHardDeleteBatch } from "./db-batch";
import {
  collectHardDeleteCircleBatch,
  collectHardDeleteTrackBatch,
} from "./admin-educational-groups";
import { usersHaveRoleColumn } from "./db-user";
import {
  usesV25FlatStaffSchema,
  v25TeacherFlags,
  v25TrackSupervisorFlags,
  V25_CIRCLE_STAGE_TO_ID_SQL,
} from "./schema-v25";

function circleAssignmentCols(hasCircles: boolean): {
  circleId: string;
  circleName: string;
} {
  if (!hasCircles) {
    return {
      circleId: "NULL AS circle_id",
      circleName: "NULL AS circle_name",
    };
  }
  return {
    circleId: `(SELECT c.id FROM circles c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND COALESCE(c.is_active, 1) = 1 LIMIT 1) AS circle_id`,
    circleName: `(SELECT c.name_ar FROM circles c
             WHERE c.teacher_id = u.id AND c.complex_id = u.complex_id
               AND COALESCE(c.is_active, 1) = 1 LIMIT 1) AS circle_name`,
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
};

const SOVEREIGN_USER_ID = 1;
const DEFAULT_PASSWORD = "Basateen123!";

function emailForMobile(mobile: string, role: string): string {
  const clean = mobile.replace(/\D/g, "");
  return `${role}-${clean}@basateen.local`;
}

/** إدراج معلم أو مشرف مسار */
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

function staffListSqlV25(hasCircles: boolean): string {
  const { circleId, circleName } = circleAssignmentCols(hasCircles);
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
               AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_name
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
  const hasCircles = await hasTable(env, "circles");

  if (await usesV25FlatStaffSchema(env)) {
    return staffListSqlV25(hasCircles);
  }

  const hasRole = await usersHaveRoleColumn(env);
  const { circleId, circleName } = circleAssignmentCols(hasCircles);
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
                 AND COALESCE(t.is_active, 1) = 1 LIMIT 1) AS track_name
       FROM users u
       WHERE u.complex_id = ?
         AND u.role IN (
           'teacher', 'track_supervisor', 'edu_supervisor', 'programs_supervisor',
           'prog_supervisor', 'admin_supervisor', 'general_supervisor', 'super_admin'
         )
       ORDER BY u.full_name_ar`;
  }

  return staffListSqlV25(hasCircles);
}

async function clearStaffUserRelations(
  env: Env,
  userId: number,
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

/** حذف نهائي للحلقات/المسارات المرتبطة بالمنسوب — O(c+t) */
async function collectStaffOwnedStructureDeletes(
  env: Env,
  userId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];

  if (
    (await hasTable(env, "circles")) &&
    (await tableHasColumn(env, "circles", "teacher_id"))
  ) {
    const circles = await env.DB.prepare(
      `SELECT id FROM circles WHERE teacher_id = ? AND complex_id = ?`,
    )
      .bind(userId, complexId)
      .all<{ id: number }>();
    for (const c of circles.results ?? []) {
      stmts.push(
        ...(await collectHardDeleteCircleBatch(env, c.id, complexId)),
      );
    }
  }

  if (
    (await hasTable(env, "tracks")) &&
    (await tableHasColumn(env, "tracks", "supervisor_id"))
  ) {
    const tracks = await env.DB.prepare(
      `SELECT id FROM tracks WHERE supervisor_id = ? AND complex_id = ?`,
    )
      .bind(userId, complexId)
      .all<{ id: number }>();
    for (const t of tracks.results ?? []) {
      stmts.push(
        ...(await collectHardDeleteTrackBatch(env, t.id, complexId)),
      );
    }
  }

  return stmts;
}

export async function safeDeleteStaffUser(
  env: Env,
  userId: number,
  complexId: number,
): Promise<void> {
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

  await prepareCircleHardDelete(env);

  const batch: D1PreparedStatement[] = [
    ...(await collectStaffOwnedStructureDeletes(env, userId, complexId)),
    ...(await clearStaffUserRelations(env, userId)),
    env.DB.prepare(`DELETE FROM users WHERE id = ? AND complex_id = ?`).bind(
      userId,
      complexId,
    ),
  ];

  await runHardDeleteBatch(env, batch);
}

export { SOVEREIGN_USER_ID, V25_CIRCLE_STAGE_TO_ID_SQL };
