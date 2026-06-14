/**
 * Unified staff roster — standard CRUD against users + circles (023/v25).
 */
import type { Env } from "../types";
import { hashPassword } from "./password";
import { hasTable, tableHasColumn } from "./db-schema";
import { usersHaveRoleColumn } from "./db-user";
import {
  usesV25FlatStaffSchema,
  v25TeacherFlags,
  v25TrackSupervisorFlags,
  v25SupervisorFlagsForRole,
  V25_CIRCLE_STAGE_TO_ID_SQL,
} from "./schema-v25";

type StaffListJoinCols = {
  joins: string;
  circleIdCol: string;
  circleNameCol: string;
  trackIdCol: string;
  trackNameCol: string;
};

/** O(1) — أعمدة وربط للعرض فقط عبر LEFT JOIN (حلقة/مسار مسند). */
async function staffListJoinCols(env: Env): Promise<StaffListJoinCols> {
  const hasCircles = await hasTable(env, "circles");
  const hasTracks = await hasTable(env, "tracks");
  const hasAssignments = await hasTable(env, "teacher_assignments");
  const hasTeacherOnCircle =
    hasCircles && (await tableHasColumn(env, "circles", "teacher_id"));
  const hasTrackSupervisor =
    hasTracks && (await tableHasColumn(env, "tracks", "supervisor_id"));
  const hasCircleIsActive =
    hasCircles && (await tableHasColumn(env, "circles", "is_active"));
  const hasTrackIsActive =
    hasTracks && (await tableHasColumn(env, "tracks", "is_active"));
  const tracksHaveComplexId =
    hasTrackSupervisor && (await tableHasColumn(env, "tracks", "complex_id"));

  const circleActive = hasCircleIsActive ? " AND COALESCE(c.is_active, 1) = 1" : "";
  const trackActive = hasTrackIsActive
    ? " AND COALESCE(t_sup.is_active, 1) = 1"
    : "";
  const trackJoinOn = tracksHaveComplexId
    ? `t_sup.supervisor_id = u.id AND t_sup.complex_id = u.complex_id${trackActive}`
    : `t_sup.supervisor_id = u.id${trackActive}`;
  const trackJoin = hasTrackSupervisor
    ? `LEFT JOIN tracks t_sup ON ${trackJoinOn}`
    : "";

  if (hasAssignments && hasCircles) {
    return {
      joins: `LEFT JOIN teacher_assignments ta ON ta.user_id = u.id
     LEFT JOIN circles c ON c.id = ta.circle_id AND c.complex_id = u.complex_id${circleActive}
     ${trackJoin}`.trim(),
      circleIdCol: "c.id AS circle_id",
      circleNameCol: "c.name_ar AS circle_name",
      trackIdCol: hasTrackSupervisor ? "t_sup.id AS track_id" : "NULL AS track_id",
      trackNameCol: hasTrackSupervisor
        ? "t_sup.name_ar AS track_name"
        : "NULL AS track_name",
    };
  }

  if (hasTeacherOnCircle) {
    return {
      joins: `LEFT JOIN circles c ON c.teacher_id = u.id AND c.complex_id = u.complex_id${circleActive}
     ${trackJoin}`.trim(),
      circleIdCol: "c.id AS circle_id",
      circleNameCol: "c.name_ar AS circle_name",
      trackIdCol: hasTrackSupervisor ? "t_sup.id AS track_id" : "NULL AS track_id",
      trackNameCol: hasTrackSupervisor
        ? "t_sup.name_ar AS track_name"
        : "NULL AS track_name",
    };
  }

  return {
    joins: trackJoin,
    circleIdCol: "NULL AS circle_id",
    circleNameCol: "NULL AS circle_name",
    trackIdCol: hasTrackSupervisor ? "t_sup.id AS track_id" : "NULL AS track_id",
    trackNameCol: hasTrackSupervisor
      ? "t_sup.name_ar AS track_name"
      : "NULL AS track_name",
  };
}

/** O(1) — حلقة نشطة أخرى يُسند إليها المعلم (باستثناء حلقة محددة). */
export async function findTeacherOtherActiveCircle(
  env: Env,
  complexId: number,
  teacherId: number,
  excludeCircleId?: number,
): Promise<{ id: number } | null> {
  const exclude =
    excludeCircleId != null && Number.isFinite(excludeCircleId)
      ? excludeCircleId
      : -1;

  if (await tableHasColumn(env, "circles", "teacher_id")) {
    const hasIsActive = await tableHasColumn(env, "circles", "is_active");
    const activeFilter = hasIsActive ? "AND COALESCE(is_active, 1) = 1" : "";
    const row = await env.DB.prepare(
      `SELECT id FROM circles
       WHERE complex_id = ? AND teacher_id = ? AND id != ? ${activeFilter}
       LIMIT 1`,
    )
      .bind(complexId, teacherId, exclude)
      .first<{ id: number }>();
    if (row) return row;
  }

  if (await hasTable(env, "teacher_assignments")) {
    const hasIsActive = await tableHasColumn(env, "circles", "is_active");
    const activeFilter = hasIsActive ? "AND COALESCE(c.is_active, 1) = 1" : "";
    const row = await env.DB.prepare(
      `SELECT c.id FROM teacher_assignments ta
       JOIN circles c ON c.id = ta.circle_id
       WHERE c.complex_id = ? AND ta.user_id = ? AND c.id != ? ${activeFilter}
       LIMIT 1`,
    )
      .bind(complexId, teacherId, exclude)
      .first<{ id: number }>();
    if (row) return row;
  }

  return null;
}

/** O(1) — مسار نشط آخر يُسند إليه المشرف (باستثناء مسار محدد). */
export async function findSupervisorOtherActiveTrack(
  env: Env,
  complexId: number,
  supervisorId: number,
  excludeTrackId?: number,
): Promise<{ id: number } | null> {
  if (!(await tableHasColumn(env, "tracks", "supervisor_id"))) return null;

  const hasIsActive = await tableHasColumn(env, "tracks", "is_active");
  const activeFilter = hasIsActive ? "AND COALESCE(is_active, 1) = 1" : "";
  const hasComplexId = await tableHasColumn(env, "tracks", "complex_id");
  const exclude =
    excludeTrackId != null && Number.isFinite(excludeTrackId) ? excludeTrackId : -1;

  if (hasComplexId) {
    return env.DB.prepare(
      `SELECT id FROM tracks
       WHERE complex_id = ? AND supervisor_id = ? AND id != ? ${activeFilter}
       LIMIT 1`,
    )
      .bind(complexId, supervisorId, exclude)
      .first<{ id: number }>();
  }

  return env.DB.prepare(
    `SELECT id FROM tracks
     WHERE supervisor_id = ? AND id != ? ${activeFilter}
     LIMIT 1`,
  )
    .bind(supervisorId, exclude)
    .first<{ id: number }>();
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

type StaffContactRow = {
  id: number;
  is_active: number;
  deleted_at: string | null;
  complex_id: number;
};

function isStaffInactive(row: {
  is_active: number;
  deleted_at?: string | null;
}): boolean {
  return Number(row.is_active ?? 1) === 0 || row.deleted_at != null;
}

/** O(1) — بحث موظف غير نشط بالجوال أو الهوية (إن وُجد العمود). */
export async function findInactiveStaffByContact(
  env: Env,
  complexId: number,
  contact: { mobile: string; national_id?: string | null },
): Promise<StaffContactRow | null> {
  const mobile = contact.mobile.trim();
  if (!mobile) return null;

  const hasDeletedAt = await tableHasColumn(env, "users", "deleted_at");
  const hasNationalId = await tableHasColumn(env, "users", "national_id");
  const deletedCol = hasDeletedAt ? ", deleted_at" : ", NULL AS deleted_at";

  const byMobile = await env.DB.prepare(
    `SELECT id, is_active, complex_id${deletedCol}
     FROM users WHERE mobile = ? AND complex_id = ?`,
  )
    .bind(mobile, complexId)
    .first<StaffContactRow>();
  if (byMobile && isStaffInactive(byMobile)) return byMobile;

  const nationalId = contact.national_id?.trim();
  if (hasNationalId && nationalId) {
    const byNational = await env.DB.prepare(
      `SELECT id, is_active, complex_id${deletedCol}
       FROM users WHERE national_id = ? AND complex_id = ?`,
    )
      .bind(nationalId, complexId)
      .first<StaffContactRow>();
    if (byNational && isStaffInactive(byNational)) return byNational;
  }

  return null;
}

/** O(1) — إعادة تفعيل موظف محذوف soft مع تحديث الحقول الأساسية. */
export async function reactivateStaffUser(
  env: Env,
  userId: number,
  complexId: number,
  body: {
    full_name_ar: string;
    mobile: string;
    role: "teacher" | "track_supervisor";
  },
): Promise<void> {
  const sets = ["is_active = 1", "full_name_ar = ?", "mobile = ?", "email = ?"];
  const binds: (string | number)[] = [
    body.full_name_ar.trim(),
    body.mobile.trim(),
    emailForMobile(body.mobile, body.role),
  ];

  if (await tableHasColumn(env, "users", "deleted_at")) {
    sets.push("deleted_at = NULL");
  }

  binds.push(userId, complexId);
  await env.DB.prepare(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND complex_id = ?`,
  )
    .bind(...binds)
    .run();

  const hasRoleCol = await usersHaveRoleColumn(env);
  if (hasRoleCol) {
    await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
      .bind(body.role, userId)
      .run();
  } else if (await usesV25FlatStaffSchema(env)) {
    const flags =
      body.role === "track_supervisor"
        ? v25TrackSupervisorFlags()
        : v25TeacherFlags();
    for (const [flag, value] of Object.entries(flags)) {
      if (await tableHasColumn(env, "users", flag)) {
        await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
          .bind(value, userId)
          .run();
      }
    }
  } else if (await tableHasColumn(env, "users", "is_teacher")) {
    await env.DB.prepare(`UPDATE users SET is_teacher = ? WHERE id = ?`)
      .bind(body.role === "teacher" ? 1 : 0, userId)
      .run();
    if (await tableHasColumn(env, "users", "is_track_supervisor")) {
      await env.DB.prepare(`UPDATE users SET is_track_supervisor = ? WHERE id = ?`)
        .bind(body.role === "track_supervisor" ? 1 : 0, userId)
        .run();
    }
  }
}

export type StaffUpsertResult = {
  id: number;
  reactivated: boolean;
};

/**
 * O(1) — إنشاء أو إعادة تفعيل معلم/مشرف مسار.
 * إذا وُجد سجل غير نشط بنفس الجوال/الهوية يُحدَّث بدلاً من الإدراج.
 */
export async function upsertStaffUser(
  env: Env,
  complexId: number,
  body: {
    full_name_ar: string;
    mobile: string;
    role: "teacher" | "track_supervisor";
    national_id?: string | null;
  },
): Promise<StaffUpsertResult> {
  const inactive = await findInactiveStaffByContact(env, complexId, body);
  if (inactive) {
    await reactivateStaffUser(env, inactive.id, complexId, body);
    return { id: inactive.id, reactivated: true };
  }

  const activeDup = await env.DB.prepare(
    `SELECT id FROM users WHERE mobile = ? AND COALESCE(is_active, 1) = 1`,
  )
    .bind(body.mobile.trim())
    .first();
  if (activeDup) {
    throw new Error("mobile_already_used");
  }

  const id = await insertStaffUser(env, complexId, body);
  return { id, reactivated: false };
}

/** O(1) — إعادة تفعيل مشرف مع تحديث الدور والنطاق. */
export async function reactivateSupervisorUser(
  env: Env,
  userId: number,
  complexId: number,
  body: {
    full_name_ar: string;
    mobile: string;
    role: string;
    supervisor_scope?: string;
  },
  normalizeRole: (role: string) => string,
): Promise<void> {
  const dbRole = normalizeRole(body.role);
  const sets = ["is_active = 1", "full_name_ar = ?", "mobile = ?", "email = ?"];
  const binds: (string | number)[] = [
    body.full_name_ar.trim(),
    body.mobile.trim(),
    emailForMobile(body.mobile, dbRole),
  ];

  if (await tableHasColumn(env, "users", "deleted_at")) {
    sets.push("deleted_at = NULL");
  }

  binds.push(userId, complexId);
  await env.DB.prepare(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND complex_id = ?`,
  )
    .bind(...binds)
    .run();

  const hasRoleCol = await usersHaveRoleColumn(env);
  if (hasRoleCol) {
    await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
      .bind(dbRole, userId)
      .run();
  } else if (await usesV25FlatStaffSchema(env)) {
    const flags = v25SupervisorFlagsForRole(dbRole);
    for (const [flag, value] of Object.entries(flags)) {
      if (await tableHasColumn(env, "users", flag)) {
        await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
          .bind(value, userId)
          .run();
      }
    }
  }

  const scope = body.supervisor_scope?.trim();
  if (scope) {
    if (await tableHasColumn(env, "users", "supervisor_scope")) {
      await env.DB.prepare(`UPDATE users SET supervisor_scope = ? WHERE id = ?`)
        .bind(scope, userId)
        .run();
    } else if (await tableHasColumn(env, "users", "stage_scope")) {
      await env.DB.prepare(`UPDATE users SET stage_scope = ? WHERE id = ?`)
        .bind(scope, userId)
        .run();
    }
  }
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

async function staffListSqlV25(env: Env): Promise<string> {
  const joinCols = await staffListJoinCols(env);
  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            CASE
              WHEN COALESCE(u.is_admin, 0) = 1 THEN 'super_admin'
              WHEN COALESCE(u.is_educational, 0) = 1 THEN 'edu_supervisor'
              WHEN COALESCE(u.is_programs, 0) = 1 THEN 'programs_supervisor'
              WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor'
              WHEN COALESCE(u.is_teacher, 0) = 1 THEN 'teacher'
              ELSE 'teacher'
            END AS role,
            ${joinCols.circleIdCol},
            ${joinCols.circleNameCol},
            ${joinCols.trackIdCol},
            ${joinCols.trackNameCol}
     FROM users u
     ${joinCols.joins}
     WHERE u.complex_id = ?
       AND COALESCE(u.is_active, 1) = 1
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
    return staffListSqlV25(env);
  }

  const hasRole = await usersHaveRoleColumn(env);
  const joinCols = await staffListJoinCols(env);
  if (hasRole) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
              CASE u.role
                WHEN 'general_supervisor' THEN 'super_admin'
                WHEN 'admin_supervisor' THEN 'super_admin'
                WHEN 'prog_supervisor' THEN 'programs_supervisor'
                ELSE u.role
              END AS role,
              ${joinCols.circleIdCol},
              ${joinCols.circleNameCol},
              ${joinCols.trackIdCol},
              ${joinCols.trackNameCol}
       FROM users u
       ${joinCols.joins}
       WHERE u.complex_id = ?
         AND COALESCE(u.is_active, 1) = 1
         AND u.role IN (
           'teacher', 'track_supervisor', 'edu_supervisor', 'programs_supervisor',
           'prog_supervisor', 'admin_supervisor', 'general_supervisor', 'super_admin'
         )
       ORDER BY u.full_name_ar`;
  }

  return staffListSqlV25(env);
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

async function unassignStaffFromGroups(
  env: Env,
  userId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  if (
    (await hasTable(env, "circles")) &&
    (await tableHasColumn(env, "circles", "teacher_id"))
  ) {
    stmts.push(
      env.DB.prepare(
        `UPDATE circles SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
      ).bind(userId, complexId),
    );
  }
  if (
    (await hasTable(env, "tracks")) &&
    (await tableHasColumn(env, "tracks", "supervisor_id"))
  ) {
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

  const batch: D1PreparedStatement[] = [
    ...(await unassignStaffFromGroups(env, userId, complexId)),
    ...(await clearStaffUserRelations(env, userId)),
    env.DB.prepare(
      `UPDATE users SET is_active = 0 WHERE id = ? AND complex_id = ?`,
    ).bind(userId, complexId),
  ];

  await env.DB.batch(batch);
}

export { SOVEREIGN_USER_ID, V25_CIRCLE_STAGE_TO_ID_SQL };
