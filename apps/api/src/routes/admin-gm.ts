import type { Env } from "../types";
import { pageMeta, parsePageParams } from "../lib/pagination";
import type { UserRole } from "../types";
import { hashPassword } from "../lib/password";
import {
  computeCapacity,
  getCircleCapacity,
  capacityWarningMessage,
} from "../lib/circle-capacity";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import {
  circleCapacityExpr,
  circleIsActiveSelectExpr,
  circleStageIdExpr,
  circleStudentCountSubquery,
  circleTeacherJoinSql,
  circleTrackSelectSql,
  createCircleRow,
  teachersListSql,
} from "../lib/admin-gm-schema";
import {
  fetchEducationalGroups,
  parseEducationalEntityType,
  safeDeleteEducationalGroup,
} from "../lib/admin-educational-groups";
import {
  StaffSoftDeletedError,
  type SoftDeletedStaffInfo,
  assertStaffMobileAvailableForCreate,
  findInactiveStaffByContact,
  findActiveUserIdByMobileVariants,
  findSupervisorOtherActiveTrack,
  findTeacherOtherActiveCircle,
  insertStaffUser,
  reactivateSupervisorUser,
  clearStaffGroupAssignments,
  resolveStaffCurrentRole,
  safeDeleteStaffUser,
  staffListSql,
  SOVEREIGN_USER_ID,
  upsertStaffUser,
} from "../lib/admin-staff";
import { d1ErrorJson } from "../lib/map-d1-error";
import { mobileForStorage, mobileLookupVariants } from "../lib/mobile";
import {
  circleCreateSchema,
  staffTeacherCreateSchema,
  trackCreateSchema,
} from "../lib/staff-schema";
import {
  usesV25FlatStaffSchema,
  v25SupervisorFlagsForRole,
  v25TeacherFlags,
  v25TrackSupervisorFlags,
} from "../lib/schema-v25";
import { usersHaveRoleColumn } from "../lib/db-user";
import { activePlacementSql, hasTable, tableHasColumn } from "../lib/db-schema";

const GM_ONLY: UserRole[] = ["super_admin"];
const CIRCLE_ADMIN_ROLES: UserRole[] = [
  "super_admin",
  "admin_supervisor",
  "edu_supervisor",
];
const DEFAULT_PASSWORD = "Basateen123!";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function jsonStaffSoftDeleted(err: StaffSoftDeletedError): Response {
  return json(
    {
      error: "staff_soft_deleted",
      message: "هذا الرقم لمنسوب محذوف — يمكن استعادته",
      staff: err.info,
    },
    409,
  );
}

function requireGm(auth: Awaited<ReturnType<typeof getAuth>>) {
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, GM_ONLY)) return json({ error: "forbidden" }, 403);
  return null;
}

function requireCircleAdmin(auth: Awaited<ReturnType<typeof getAuth>>) {
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, CIRCLE_ADMIN_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }
  return null;
}

function emailForMobile(mobile: string, role: string): string {
  const clean = mobile.replace(/\D/g, "");
  return `${role}-${clean}@basateen.local`;
}

/** O(1) — إسناد معلم لحلقة (مصدر الحقيقة: تبويب الحلقات). */
async function assignTeacherToCircle(
  env: Env,
  complexId: number,
  circleId: number,
  teacherId: number,
): Promise<Response | null> {
  const conflict = await findTeacherOtherActiveCircle(
    env,
    complexId,
    teacherId,
    circleId,
  );
  if (conflict) {
    return json(
      {
        error: "teacher_already_assigned",
        message: "هذا المعلم مسند بالفعل لحلقة أخرى",
      },
      409,
    );
  }

  if (await tableHasColumn(env, "circles", "teacher_id")) {
    await env.DB.prepare(
      `UPDATE circles SET teacher_id = ? WHERE id = ? AND complex_id = ?`,
    )
      .bind(teacherId, circleId, complexId)
      .run();
  }
  if (await hasTable(env, "teacher_assignments")) {
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
      .bind(circleId)
      .run();
    await env.DB.prepare(
      `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
    )
      .bind(teacherId, circleId)
      .run();
  }
  return null;
}

/** O(1) — إسناد مشرف لمسار (مصدر الحقيقة: تبويب المسارات). */
async function assignSupervisorToTrack(
  env: Env,
  complexId: number,
  trackId: number,
  supervisorId: number,
): Promise<Response | null> {
  const conflict = await findSupervisorOtherActiveTrack(
    env,
    complexId,
    supervisorId,
    trackId,
  );
  if (conflict) {
    return json(
      {
        error: "supervisor_already_assigned",
        message: "هذا المشرف مسند بالفعل لمسار آخر",
      },
      409,
    );
  }

  if (await tableHasColumn(env, "tracks", "supervisor_id")) {
    await env.DB.prepare(
      `UPDATE tracks SET supervisor_id = ? WHERE id = ? AND complex_id = ?`,
    )
      .bind(supervisorId, trackId, complexId)
      .run();
  }
  return null;
}

/** أدوار المشرفين المسموح إنشاؤها/تعديلها (v3.2 — خمسة أدوار تشغيلية) */
const SUPERVISOR_INPUT_ROLES = [
  "super_admin",
  "edu_supervisor",
  "programs_supervisor",
  "prog_supervisor",
  "track_supervisor",
  "general_supervisor",
  "admin_supervisor",
] as const;

const SUPERVISOR_DB_ROLE_SQL = `'edu_supervisor','programs_supervisor','prog_supervisor','admin_supervisor','general_supervisor'`;

function normalizeSupervisorRoleForDb(role: string): UserRole {
  if (role === "prog_supervisor" || role === "programs_supervisor") {
    return "programs_supervisor";
  }
  if (
    role === "general_supervisor" ||
    role === "admin_supervisor" ||
    role === "super_admin"
  ) {
    return "admin_supervisor";
  }
  if (role === "edu_supervisor" || role === "track_supervisor") {
    return role;
  }
  return role as UserRole;
}

function isSupervisorInputRole(role: string): boolean {
  return SUPERVISOR_INPUT_ROLES.includes(
    role as (typeof SUPERVISOR_INPUT_ROLES)[number],
  );
}

function legacySupervisorFlags(role: string): Record<string, number> {
  return v25SupervisorFlagsForRole(normalizeSupervisorRoleForDb(role));
}

async function applyFlatSupervisorRole(
  env: Env,
  userId: number,
  role: string,
): Promise<void> {
  const flags = v25SupervisorFlagsForRole(normalizeSupervisorRoleForDb(role));
  for (const [flag, value] of Object.entries(flags)) {
    if (await tableHasColumn(env, "users", flag)) {
      await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
        .bind(value, userId)
        .run();
    }
  }
}

async function insertSupervisorUser(
  env: Env,
  complexId: number,
  body: {
    full_name_ar: string;
    mobile: string;
    role: string;
    supervisor_scope: string;
  },
): Promise<number> {
  const mobile = mobileForStorage(body.mobile);
  if (!mobile) throw new Error("invalid_mobile");
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const dbRole = normalizeSupervisorRoleForDb(body.role);
  const hasRoleCol = await usersHaveRoleColumn(env);
  const hasScopeCol = await tableHasColumn(env, "users", "supervisor_scope");
  const hasStageScope = await tableHasColumn(env, "users", "stage_scope");

  const cols = ["complex_id", "email", "mobile", "password_hash", "full_name_ar", "is_active"];
  const vals: (string | number | null)[] = [
    complexId,
    emailForMobile(mobile, dbRole),
    mobile,
    passwordHash,
    body.full_name_ar,
    1,
  ];

  if (await tableHasColumn(env, "users", "deleted_at")) {
    cols.push("deleted_at");
    vals.push(null);
  }

  if (hasRoleCol) {
    cols.push("role");
    vals.push(dbRole);
  } else if (await usesV25FlatStaffSchema(env)) {
    for (const [flag, value] of Object.entries(
      v25SupervisorFlagsForRole(dbRole),
    )) {
      if (await tableHasColumn(env, "users", flag)) {
        cols.push(flag);
        vals.push(value);
      }
    }
  } else {
    for (const [flag, value] of Object.entries(legacySupervisorFlags(body.role))) {
      if (await tableHasColumn(env, "users", flag)) {
        cols.push(flag);
        vals.push(value);
      }
    }
  }

  if (hasScopeCol) {
    cols.push("supervisor_scope");
    vals.push(body.supervisor_scope);
  } else if (hasStageScope) {
    cols.push("stage_scope");
    vals.push(body.supervisor_scope);
  }

  const placeholders = cols.map(() => "?").join(", ");
  const ins = await env.DB.prepare(
    `INSERT INTO users (${cols.join(", ")}) VALUES (${placeholders})`,
  )
    .bind(...vals)
    .run();

  return Number(ins.meta.last_row_id);
}

async function syncSupervisorSections(
  env: Env,
  userId: number,
  role: string,
): Promise<void> {
  if (!(await hasTable(env, "user_sections"))) return;
  await env.DB.prepare(`DELETE FROM user_sections WHERE user_id = ?`)
    .bind(userId)
    .run();
  const dbRole = normalizeSupervisorRoleForDb(role);
  const sections =
    dbRole === "programs_supervisor"
      ? ["programs"]
      : dbRole === "edu_supervisor"
        ? ["admin", "education"]
        : dbRole === "track_supervisor"
          ? ["education"]
          : ["admin", "education", "programs"];
  for (const section of sections) {
    await env.DB.prepare(
      `INSERT INTO user_sections (user_id, section) VALUES (?, ?)`,
    )
      .bind(userId, section)
      .run();
  }
}

export async function handleAdminStaffList(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const url = new URL(request.url);
    const pageParams = parsePageParams(url);
    const roleFilter = url.searchParams.get("role")?.trim();
    const statusRaw = url.searchParams.get("status")?.trim();
    const status =
      statusRaw === "active" ||
      statusRaw === "suspended" ||
      statusRaw === "deleted"
        ? statusRaw
        : "all";
    let sql = await staffListSql(env, status);
    const binds: (string | number)[] = [auth!.complexId];
    if (roleFilter) {
      sql = sql.replace(
        /ORDER BY u\.full_name_ar\s*$/i,
        "AND u.role = ? ORDER BY u.full_name_ar",
      );
      binds.push(roleFilter);
    }
    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS c FROM (${sql})`)
      .bind(...binds)
      .first<{ c: number }>();
    const total = Number(countRow?.c ?? 0);

    const rows = await env.DB.prepare(`${sql} LIMIT ? OFFSET ?`)
      .bind(...binds, pageParams.pageSize, pageParams.offset)
      .all<{
        id: number;
        full_name_ar: string;
        mobile: string | null;
        is_active: number;
        role: string;
        circle_id: number | null;
        circle_name: string | null;
        track_id: number | null;
        track_name: string | null;
        deleted_at: string | null;
      }>();

    return json({ items: rows.results ?? [], page: pageMeta(total, pageParams) });
  } catch (error: unknown) {
    console.error("[admin-gm] staff list:", error);
    const message =
      error instanceof Error ? error.message : "staff_list_failed";
    return json({ items: [], error: "staff_list_failed", message }, 500);
  }
}

export async function handleAdminStaffDelete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const m = url.pathname.match(/^\/api\/admin\/staff\/(\d+)$/);
    const userId = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(userId)) return json({ error: "invalid_id" }, 400);

    await safeDeleteStaffUser(env, userId, auth!.complexId);
    return json({ ok: true });
  } catch (error: unknown) {
    console.error("[admin-gm] staff delete:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete staff member";
    const status =
      message === "cannot_delete_sovereign_user"
        ? 403
        : message === "staff_not_found"
          ? 404
          : 500;
    return json({ error: "admin_gm_error", message }, status);
  }
}

export async function handleAdminStaffPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const m = url.pathname.match(/^\/api\/admin\/staff\/(\d+)$/);
    const userId = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(userId)) return json({ error: "invalid_id" }, 400);
    if (userId === SOVEREIGN_USER_ID) {
      return json({ error: "cannot_modify_sovereign_user" }, 403);
    }

    let body: {
      full_name_ar?: string;
      mobile?: string;
      role?: UserRole | string;
      supervisor_scope?: string;
      is_active?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const user = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ?`,
    )
      .bind(userId, auth!.complexId)
      .first();
    if (!user) return json({ error: "staff_not_found" }, 404);

    const currentRole =
      body.role != null
        ? await resolveStaffCurrentRole(env, userId)
        : null;

    if (body.full_name_ar?.trim()) {
      await env.DB.prepare(`UPDATE users SET full_name_ar = ? WHERE id = ?`)
        .bind(body.full_name_ar.trim(), userId)
        .run();
    }
    if (body.mobile?.trim()) {
      const mobile = mobileForStorage(body.mobile.trim());
      if (!mobile) {
        return json(
          {
            error: "invalid_mobile",
            message: "رقم جوال سعودي غير صالح (مثال: 0500000000)",
          },
          400,
        );
      }
      const dupId = await findActiveUserIdByMobileVariants(
        env,
        mobileLookupVariants(mobile),
        userId,
      );
      if (dupId) return json({ error: "mobile_already_used" }, 409);
      await env.DB.prepare(`UPDATE users SET mobile = ? WHERE id = ?`)
        .bind(mobile, userId)
        .run();
    }
    if (body.is_active != null) {
      const sets = ["is_active = ?"];
      const binds: (number)[] = [body.is_active ? 1 : 0];
      if (
        body.is_active &&
        (await tableHasColumn(env, "users", "deleted_at"))
      ) {
        sets.push("deleted_at = NULL");
      }
      binds.push(userId);
      await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();
    }

    if (body.role) {
      const incomingRole =
        body.role === "general_supervisor" || body.role === "admin_supervisor"
          ? "super_admin"
          : body.role === "prog_supervisor"
            ? "programs_supervisor"
            : body.role;
      if (currentRole && incomingRole !== currentRole) {
        await clearStaffGroupAssignments(env, userId, auth!.complexId);
      }
      if (body.role === "teacher") {
        if (await usersHaveRoleColumn(env)) {
          await env.DB.prepare(`UPDATE users SET role = 'teacher' WHERE id = ?`)
            .bind(userId)
            .run();
        } else if (await usesV25FlatStaffSchema(env)) {
          for (const [flag, value] of Object.entries(v25TeacherFlags())) {
            if (await tableHasColumn(env, "users", flag)) {
              await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
                .bind(value, userId)
                .run();
            }
          }
        }
        await syncSupervisorSections(env, userId, "teacher");
      } else if (body.role === "track_supervisor") {
        if (await usersHaveRoleColumn(env)) {
          await env.DB.prepare(`UPDATE users SET role = 'track_supervisor' WHERE id = ?`)
            .bind(userId)
            .run();
        } else if (await usesV25FlatStaffSchema(env)) {
          for (const [flag, value] of Object.entries(v25TrackSupervisorFlags())) {
            if (await tableHasColumn(env, "users", flag)) {
              await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
                .bind(value, userId)
                .run();
            }
          }
        }
        await syncSupervisorSections(env, userId, "track_supervisor");
      } else if (isSupervisorInputRole(body.role)) {
        const dbRole = normalizeSupervisorRoleForDb(body.role);
        if (await usersHaveRoleColumn(env)) {
          await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
            .bind(dbRole, userId)
            .run();
        } else if (await usesV25FlatStaffSchema(env)) {
          await applyFlatSupervisorRole(env, userId, body.role);
        }
        await syncSupervisorSections(env, userId, dbRole);
      }
    }

    if (body.supervisor_scope != null) {
      if (await tableHasColumn(env, "users", "supervisor_scope")) {
        await env.DB.prepare(`UPDATE users SET supervisor_scope = ? WHERE id = ?`)
          .bind(body.supervisor_scope, userId)
          .run();
      } else if (await tableHasColumn(env, "users", "stage_scope")) {
        await env.DB.prepare(`UPDATE users SET stage_scope = ? WHERE id = ?`)
          .bind(body.supervisor_scope, userId)
          .run();
      }
    }

    return json({ ok: true });
  } catch (error: unknown) {
    console.error("[admin-gm] staff patch:", error);
    return json(
      {
        error: "admin_gm_error",
        message:
          error instanceof Error ? error.message : "Failed to update staff member",
      },
      500,
    );
  }
}

export async function handleAdminTeachersList(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const sql = await teachersListSql(env);
    const rows = await env.DB.prepare(sql)
      .bind(auth!.complexId)
      .all<{
        id: number;
        full_name_ar: string;
        mobile: string | null;
        is_active: number;
        circle_id: number | null;
        circle_name: string | null;
        stage_id: number;
      }>();

    return json({ items: rows.results ?? [] });
  } catch (error: unknown) {
    console.error("[admin-gm] teachers list:", error);
    return json({ items: [] });
  }
}

export async function handleAdminTeachersCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = staffTeacherCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(
      { error: issue?.message ?? "validation_failed" },
      400,
    );
  }

  const body = parsed.data;
  const staffRole = body.role;

  const mobile = body.mobile;
  try {
    const upserted = await upsertStaffUser(env, auth!.complexId, {
      full_name_ar: body.full_name_ar,
      mobile,
      role: staffRole,
    });
    const userId = upserted.id;

    if (await hasTable(env, "user_sections")) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (?, 'education')`,
      )
        .bind(userId)
        .run();
    }

    return json({ ok: true, id: userId, reactivated: upserted.reactivated });
  } catch (error: unknown) {
    if (error instanceof StaffSoftDeletedError) {
      return jsonStaffSoftDeleted(error);
    }
    const d1 = d1ErrorJson(error);
    if (d1) return d1;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "mobile_already_used") {
      return json(
        {
          error: "duplicate_mobile",
          message:
            "رقم الجوال مسجل مسبقاً — تأكد أنه مختلف عن المنسوب الأول (05xxxxxxxx ≠ 9665xxxxxxxx لنفس الرقم)",
        },
        409,
      );
    }
    if (msg === "invalid_mobile") {
      return json(
        {
          error: "invalid_mobile",
          message: "رقم جوال سعودي غير صالح (مثال: 0500000000)",
        },
        400,
      );
    }
    console.error("[admin-gm] teachers create:", error);
    return json(
      {
        error: "admin_gm_error",
        message: msg || "Failed to create staff member",
      },
      500,
    );
  }
}

export async function handleAdminSupervisorsList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const hasRole = await usersHaveRoleColumn(env);
  const rows = hasRole
    ? await env.DB.prepare(
        `SELECT id, full_name_ar, mobile, role, is_active
         FROM users
         WHERE complex_id = ? AND role IN (${SUPERVISOR_DB_ROLE_SQL})
         ORDER BY full_name_ar`,
      )
        .bind(auth!.complexId)
        .all()
    : await env.DB.prepare(
        `SELECT id, full_name_ar, mobile, is_active,
                CASE
                  WHEN COALESCE(is_track_supervisor, 0) = 1 THEN 'track_supervisor'
                  WHEN COALESCE(is_educational, 0) = 1 THEN 'edu_supervisor'
                  WHEN COALESCE(is_programs, 0) = 1 THEN 'programs_supervisor'
                  WHEN COALESCE(is_admin, 0) = 1 THEN 'admin_supervisor'
                  ELSE 'admin_supervisor'
                END AS role
         FROM users
         WHERE complex_id = ?
           AND (
             COALESCE(is_track_supervisor, 0) = 1 OR COALESCE(is_educational, 0) = 1 OR
             COALESCE(is_programs, 0) = 1 OR COALESCE(is_admin, 0) = 1
           )
         ORDER BY full_name_ar`,
      )
        .bind(auth!.complexId)
        .all();

  return json({ items: rows.results ?? [] });
}

export async function handleAdminSupervisorsCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  let body: {
    full_name_ar?: string;
    mobile?: string;
    role?: UserRole;
    supervisor_scope?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const role = body.role;
  if (!role || !isSupervisorInputRole(role)) {
    return json({ error: "invalid_supervisor_role" }, 400);
  }
  const dbRole = normalizeSupervisorRoleForDb(role);
  if (!body.full_name_ar?.trim() || !body.mobile?.trim()) {
    return json({ error: "name_and_mobile_required" }, 400);
  }

  const scope = body.supervisor_scope?.trim() || "global";
  const mobile = mobileForStorage(body.mobile.trim());
  if (!mobile) {
    return json(
      {
        error: "invalid_mobile",
        message: "رقم جوال سعودي غير صالح (مثال: 0500000000)",
      },
      400,
    );
  }

  try {
    await assertStaffMobileAvailableForCreate(env, auth!.complexId, mobile);

    const userId = await insertSupervisorUser(env, auth!.complexId, {
      full_name_ar: body.full_name_ar.trim(),
      mobile,
      role,
      supervisor_scope: scope,
    });

    await syncSupervisorSections(env, userId, role);

    return json({ ok: true, id: userId, reactivated: false });
  } catch (error: unknown) {
    if (error instanceof StaffSoftDeletedError) {
      return jsonStaffSoftDeleted(error);
    }
    const d1 = d1ErrorJson(error);
    if (d1) return d1;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "mobile_already_used") {
      return json(
        {
          error: "duplicate_mobile",
          message:
            "رقم الجوال مسجل مسبقاً — تأكد أنه مختلف عن المنسوب الأول (05xxxxxxxx ≠ 9665xxxxxxxx لنفس الرقم)",
        },
        409,
      );
    }
    console.error("[admin-gm] supervisors create:", error);
    return json(
      {
        error: "admin_gm_error",
        message: msg || "Failed to create supervisor",
      },
      500,
    );
  }
}

export async function handleAdminEducationalGroupsList(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const items = await fetchEducationalGroups(env, auth!.complexId);
    return json({ items });
  } catch (error: unknown) {
    console.error("[admin-gm] educational-groups list:", error);
    return json({ items: [] });
  }
}

export async function handleAdminEducationalGroupsDelete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const m = url.pathname.match(
      /^\/api\/admin\/educational-groups\/(circle|track)\/(\d+)$/,
    );
    const entityType = parseEducationalEntityType(m?.[1] ?? null);
    const id = m ? Number(m[2]) : NaN;
    if (!entityType || !Number.isFinite(id)) {
      return json({ error: "invalid_id_or_type" }, 400);
    }

    await safeDeleteEducationalGroup(env, entityType, id, auth!.complexId);
    return new Response(null, { status: 200 });
  } catch (error: unknown) {
    console.error("[admin-gm] educational-groups delete:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete group";
    const status =
      message === "circle_not_found" || message === "track_not_found"
        ? 404
        : 500;
    return json({ error: "admin_gm_error", message }, status);
  }
}

export async function handleAdminCirclesSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const stageExpr = await circleStageIdExpr(env);
    const capacityExpr = await circleCapacityExpr(env);
    const isActiveExpr = await circleIsActiveSelectExpr(env);
    const track = await circleTrackSelectSql(env);
    const teacher = await circleTeacherJoinSql(env);
    const studentCount = await circleStudentCountSubquery(env);

    const rows = await env.DB.prepare(
      `SELECT c.id, c.name_ar, ${stageExpr} AS stage_id,
              ${capacityExpr} AS default_capacity,
              ${track.trackIdCol}, ${track.trackNameCol},
              ${isActiveExpr},
              ${teacher.teacherIdCol}, ${teacher.teacherNameCol},
              ${studentCount} AS student_count
       FROM circles c
       ${track.joinSql}
       ${teacher.joinSql}
       WHERE c.complex_id = ?
       ORDER BY stage_id, c.name_ar`,
    )
      .bind(auth!.complexId)
      .all<{
        id: number;
        name_ar: string;
        stage_id: number;
        default_capacity: number;
        track_id: number | null;
        track_name: string | null;
        is_active: number;
        teacher_id: number | null;
        teacher_name: string | null;
        student_count: number;
      }>();

    const items = (rows.results ?? []).map((r) => {
      const cap = computeCapacity(r.default_capacity, r.student_count);
      return {
        ...r,
        ...cap,
        capacity_warning: capacityWarningMessage({
          circle_id: r.id,
          ...cap,
        }),
      };
    });

    return json({ items });
  } catch (error: unknown) {
    console.error("[admin-gm] circles summary:", error);
    return json({ items: [] });
  }
}

export async function handleAdminCirclesCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireCircleAdmin(auth);
    if (denied) return denied;

    let body: {
      name_ar?: string;
      stage_id?: number;
      default_capacity?: number;
      teacher_user_id?: number;
      new_teacher?: { full_name_ar?: string; mobile?: string };
      track_id?: number | null;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!body.name_ar?.trim()) return json({ error: "name_required" }, 400);
    const stageId = Number(body.stage_id);
    if (!Number.isFinite(stageId) || stageId < 1 || stageId > 4) {
      return json({ error: "invalid_stage_id" }, 400);
    }
    const defaultCapacity = Number(body.default_capacity);
    if (!Number.isFinite(defaultCapacity) || defaultCapacity < 1) {
      return json({ error: "default_capacity_required" }, 400);
    }

    const hasRole = await usersHaveRoleColumn(env);
    let teacherId = Number(body.teacher_user_id);

    if (!Number.isFinite(teacherId) || teacherId <= 0) {
      if (
        body.new_teacher?.full_name_ar?.trim() &&
        body.new_teacher?.mobile?.trim()
      ) {
        const mobile = body.new_teacher.mobile.trim();
        try {
          const upserted = await upsertStaffUser(env, auth!.complexId, {
            full_name_ar: body.new_teacher.full_name_ar.trim(),
            mobile,
            role: "teacher",
          });
          teacherId = upserted.id;
          if (await hasTable(env, "user_sections")) {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (?, 'education')`,
            )
              .bind(teacherId)
              .run();
          }
        } catch (error: unknown) {
          if (error instanceof StaffSoftDeletedError) {
            return jsonStaffSoftDeleted(error);
          }
          const d1 = d1ErrorJson(error);
          if (d1) return d1;
          const msg = error instanceof Error ? error.message : String(error);
          if (msg === "mobile_already_used") {
            return json(
              {
                error: "duplicate_mobile",
                message: "رقم الجوال مسجل مسبقاً في النظام",
              },
              409,
            );
          }
          throw error;
        }
      } else {
        return json({ error: "teacher_required" }, 400);
      }
    } else {
      const teacherFilter = hasRole
        ? "role = 'teacher'"
        : "COALESCE(is_teacher, 0) = 1";
      const teacher = await env.DB.prepare(
        `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${teacherFilter} AND COALESCE(is_active, 1) = 1`,
      )
        .bind(teacherId, auth!.complexId)
        .first();
      if (!teacher) return json({ error: "teacher_not_found" }, 404);
    }

    const trackId =
      body.track_id != null && body.track_id !== undefined
        ? Number(body.track_id)
        : null;

    const teacherConflict = await findTeacherOtherActiveCircle(
      env,
      auth!.complexId,
      teacherId,
    );
    if (teacherConflict) {
      return json(
        {
          error: "teacher_already_assigned",
          message: "هذا المعلم مسند بالفعل لحلقة أخرى",
        },
        409,
      );
    }

    const circleId = await createCircleRow(env, auth!.complexId, {
      name_ar: body.name_ar.trim(),
      stage_id: stageId,
      capacity: defaultCapacity,
      teacher_id: teacherId,
      track_id: Number.isFinite(trackId) ? trackId : null,
    });

    return json({ ok: true, id: circleId });
  } catch (error: unknown) {
    console.error("[admin-gm] circles create:", error);
    return json(
      {
        error: "admin_circles_create_error",
        message:
          error instanceof Error ? error.message : "Failed to create circle",
      },
      500,
    );
  }
}

export async function handleAdminCirclesPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const m = url.pathname.match(/^\/api\/admin\/circles\/(\d+)$/);
  const circleId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(circleId)) return json({ error: "invalid_id" }, 400);

  let body: {
    name_ar?: string;
    stage_id?: number;
    default_capacity?: number;
    teacher_user_id?: number;
    track_id?: number | null;
    is_active?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM circles WHERE id = ? AND complex_id = ?`,
  )
    .bind(circleId, auth!.complexId)
    .first();
  if (!existing) return json({ error: "circle_not_found" }, 404);

  if (body.default_capacity != null) {
    const dc = Number(body.default_capacity);
    if (!Number.isFinite(dc) || dc < 1) {
      return json({ error: "invalid_default_capacity" }, 400);
    }
    await env.DB.prepare(
      `UPDATE circles SET default_capacity = ?, capacity = ? WHERE id = ?`,
    )
      .bind(dc, dc, circleId)
      .run();
  }
  if (body.name_ar?.trim()) {
    await env.DB.prepare(`UPDATE circles SET name_ar = ? WHERE id = ?`)
      .bind(body.name_ar.trim(), circleId)
      .run();
  }
  if (body.stage_id != null) {
    const sid = Number(body.stage_id);
    if (sid >= 1 && sid <= 4) {
      await env.DB.prepare(`UPDATE circles SET stage_id = ? WHERE id = ?`)
        .bind(sid, circleId)
        .run();
    }
  }
  if (body.track_id !== undefined) {
    await env.DB.prepare(`UPDATE circles SET track_id = ? WHERE id = ?`)
      .bind(body.track_id, circleId)
      .run();
    if (body.track_id) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO track_circles (track_id, circle_id) VALUES (?, ?)`,
      )
        .bind(body.track_id, circleId)
        .run();
    }
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE circles SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, circleId)
      .run();
  }
  if (body.teacher_user_id != null) {
    const teacherId = Number(body.teacher_user_id);
    if (!Number.isFinite(teacherId) || teacherId <= 0) {
      return json({ error: "teacher_required" }, 400);
    }
    const hasRole = await usersHaveRoleColumn(env);
    const teacherFilter = hasRole
      ? "role = 'teacher'"
      : "COALESCE(is_teacher, 0) = 1";
    const teacher = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${teacherFilter} AND COALESCE(is_active, 1) = 1`,
    )
      .bind(teacherId, auth!.complexId)
      .first();
    if (!teacher) return json({ error: "teacher_not_found" }, 404);

    const assignErr = await assignTeacherToCircle(
      env,
      auth!.complexId,
      circleId,
      teacherId,
    );
    if (assignErr) return assignErr;
  }

  return json({ ok: true });
}

export async function handleAdminTracksList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const hasSupervisorCol = await tableHasColumn(env, "tracks", "supervisor_id");
  const hasTrackStages = await hasTable(env, "track_stages");
  const hasStudentsCurrentTrack = await tableHasColumn(
    env,
    "students",
    "current_track_id",
  );

  if (hasSupervisorCol && !hasTrackStages) {
    const tracks = await env.DB.prepare(
      `SELECT t.id, t.name_ar, t.supervisor_id,
              COALESCE(t.default_capacity, 20) AS default_capacity,
              COALESCE(t.is_active, 1) AS is_active,
              u.full_name_ar AS supervisor_name
       FROM tracks t
       LEFT JOIN users u ON u.id = t.supervisor_id
       WHERE t.complex_id = ?
       ORDER BY t.name_ar`,
    )
      .bind(auth!.complexId)
      .all<{
        id: number;
        name_ar: string;
        supervisor_id: number;
        supervisor_name: string | null;
        default_capacity: number;
        is_active: number;
      }>();

    const items = [];
    for (const t of tracks.results ?? []) {
      let studentCount = 0;
      if (hasStudentsCurrentTrack) {
        const sc = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM students
           WHERE current_track_id = ? AND complex_id = ? AND is_active = 1`,
        )
          .bind(t.id, auth!.complexId)
          .first<{ c: number }>();
        studentCount = sc?.c ?? 0;
      }
      items.push({
        id: t.id,
        name_ar: t.name_ar,
        default_capacity: t.default_capacity,
        is_active: t.is_active,
        supervisor_id: t.supervisor_id,
        supervisor_name: t.supervisor_name,
        stage_ids: [] as number[],
        circle_ids: [] as number[],
        circles: [] as Array<{ id: number; name_ar: string }>,
        student_count: studentCount,
      });
    }
    return json({ items });
  }

  const tracks = await env.DB.prepare(
    `SELECT t.id, t.name_ar, COALESCE(t.default_capacity, 20) AS default_capacity,
            COALESCE(t.is_active, 1) AS is_active
     FROM tracks t
     WHERE t.complex_id = ?
     ORDER BY t.name_ar`,
  )
    .bind(auth!.complexId)
    .all<{
      id: number;
      name_ar: string;
      default_capacity: number;
      is_active: number;
    }>();

  const activePlacement = await activePlacementSql(env, "h");
  const items = [];
  for (const t of tracks.results ?? []) {
    const stages = hasTrackStages
      ? await env.DB.prepare(
          `SELECT stage_id FROM track_stages WHERE track_id = ? ORDER BY stage_id`,
        )
          .bind(t.id)
          .all<{ stage_id: number }>()
      : { results: [] as { stage_id: number }[] };

    const hasTrackCircles = await hasTable(env, "track_circles");
    const circles = hasTrackCircles
      ? await env.DB.prepare(
          `SELECT c.id, c.name_ar FROM track_circles tc
           JOIN circles c ON c.id = tc.circle_id
           WHERE tc.track_id = ?`,
        )
          .bind(t.id)
          .all<{ id: number; name_ar: string }>()
      : { results: [] as { id: number; name_ar: string }[] };

    let studentCount = 0;
    if (hasStudentsCurrentTrack) {
      const sc = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM students
         WHERE current_track_id = ? AND complex_id = ? AND is_active = 1`,
      )
        .bind(t.id, auth!.complexId)
        .first<{ c: number }>();
      studentCount = sc?.c ?? 0;
    } else {
      const sc = await env.DB.prepare(
        `SELECT COUNT(DISTINCT h.student_id) AS c
         FROM student_circle_history h
         WHERE h.track_id = ? AND ${activePlacement}`,
      )
        .bind(t.id)
        .first<{ c: number }>();
      studentCount = sc?.c ?? 0;
    }

    items.push({
      ...t,
      stage_ids: (stages.results ?? []).map((s) => s.stage_id),
      circle_ids: (circles.results ?? []).map((c) => c.id),
      circles: circles.results ?? [],
      student_count: studentCount,
    });
  }

  return json({ items });
}

async function resolveTrackSupervisorId(
  env: Env,
  complexId: number,
  body: {
    supervisor_id?: number | null;
    new_supervisor?: { full_name_ar: string; mobile: string };
  },
): Promise<
  { id: number } | { error: string; status: number; staff?: SoftDeletedStaffInfo }
> {
  let supervisorId = Number(body.supervisor_id ?? 0);
  if (Number.isFinite(supervisorId) && supervisorId > 0) {
    const sup = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1`,
    )
      .bind(supervisorId, complexId)
      .first<{ id: number }>();
    if (!sup) return { error: "supervisor_not_found", status: 404 };
    return { id: supervisorId };
  }

  if (
    body.new_supervisor?.full_name_ar?.trim() &&
    body.new_supervisor?.mobile?.trim()
  ) {
    const mobile = body.new_supervisor.mobile.trim();
    try {
      const upserted = await upsertStaffUser(env, complexId, {
        full_name_ar: body.new_supervisor.full_name_ar.trim(),
        mobile,
        role: "track_supervisor",
      });
      if (await hasTable(env, "user_sections")) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (?, 'education')`,
        )
          .bind(upserted.id)
          .run();
      }
      return { id: upserted.id };
    } catch (error: unknown) {
      if (error instanceof StaffSoftDeletedError) {
        return { error: "staff_soft_deleted", status: 409, staff: error.info };
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "mobile_already_used") {
        return { error: "duplicate_mobile", status: 409 };
      }
      throw error;
    }
  }

  return { error: "supervisor_required", status: 400 };
}

export async function handleAdminTracksCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = trackCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json(
      { error: issue?.message ?? "validation_failed" },
      400,
    );
  }

  const body = parsed.data;
  const defaultCapacity = body.default_capacity;

  const hasSupervisorCol = await tableHasColumn(env, "tracks", "supervisor_id");
  const hasTrackStages = await hasTable(env, "track_stages");

  if (hasSupervisorCol && !hasTrackStages) {
    const resolved = await resolveTrackSupervisorId(env, auth!.complexId, body);
    if ("error" in resolved) {
      return json({ error: resolved.error }, resolved.status);
    }

    const conflict = await findSupervisorOtherActiveTrack(
      env,
      auth!.complexId,
      resolved.id,
    );
    if (conflict) {
      return json(
        {
          error: "supervisor_already_assigned",
          message: "هذا المشرف مسند بالفعل لمسار آخر",
        },
        409,
      );
    }

    const ins = await env.DB.prepare(
      `INSERT INTO tracks (complex_id, name_ar, supervisor_id, default_capacity)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(auth!.complexId, body.name_ar, resolved.id, defaultCapacity)
      .run();

    return json({ ok: true, id: ins.meta.last_row_id as number });
  }

  const stageIds = (body.stage_ids ?? []).filter(
    (s) => Number.isFinite(s) && s >= 1 && s <= 4,
  );
  if (stageIds.length === 0) return json({ error: "stage_ids_required" }, 400);

  const cols = ["complex_id", "name_ar", "default_capacity"];
  const vals: (string | number)[] = [
    auth!.complexId,
    body.name_ar,
    defaultCapacity,
  ];
  if (hasSupervisorCol) {
    const resolved = await resolveTrackSupervisorId(env, auth!.complexId, body);
    if ("error" in resolved) {
      return json({ error: resolved.error }, resolved.status);
    }
    const conflict = await findSupervisorOtherActiveTrack(
      env,
      auth!.complexId,
      resolved.id,
    );
    if (conflict) {
      return json(
        {
          error: "supervisor_already_assigned",
          message: "هذا المشرف مسند بالفعل لمسار آخر",
        },
        409,
      );
    }
    cols.push("supervisor_id");
    vals.push(resolved.id);
  }

  const ins = await env.DB.prepare(
    `INSERT INTO tracks (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
  )
    .bind(...vals)
    .run();

  const trackId = ins.meta.last_row_id as number;

  if (hasTrackStages) {
    for (const stageId of stageIds) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO track_stages (track_id, stage_id) VALUES (?, ?)`,
      )
        .bind(trackId, stageId)
        .run();
    }
  }

  const hasTrackCircles = await hasTable(env, "track_circles");
  if (hasTrackCircles) {
    for (const circleId of body.circle_ids ?? []) {
      const cid = Number(circleId);
      if (!Number.isFinite(cid)) continue;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO track_circles (track_id, circle_id) VALUES (?, ?)`,
      )
        .bind(trackId, cid)
        .run();
      const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
      if (hasCircleTrack) {
        await env.DB.prepare(
          `UPDATE circles SET track_id = ? WHERE id = ? AND complex_id = ?`,
        )
          .bind(trackId, cid, auth!.complexId)
          .run();
      }
    }
  }

  return json({ ok: true, id: trackId });
}

export async function handleAdminTracksPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const m = url.pathname.match(/^\/api\/admin\/tracks\/(\d+)$/);
  const trackId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(trackId)) return json({ error: "invalid_id" }, 400);

  let body: {
    name_ar?: string;
    default_capacity?: number;
    is_active?: number;
    stage_ids?: number[];
    circle_ids?: number[];
    supervisor_id?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const track = await env.DB.prepare(
    `SELECT id FROM tracks WHERE id = ? AND complex_id = ?`,
  )
    .bind(trackId, auth!.complexId)
    .first();
  if (!track) return json({ error: "track_not_found" }, 404);

  if (body.name_ar?.trim()) {
    await env.DB.prepare(`UPDATE tracks SET name_ar = ? WHERE id = ?`)
      .bind(body.name_ar.trim(), trackId)
      .run();
  }
  if (body.default_capacity != null) {
    const dc = Number(body.default_capacity);
    if (dc >= 1) {
      await env.DB.prepare(`UPDATE tracks SET default_capacity = ? WHERE id = ?`)
        .bind(dc, trackId)
        .run();
    }
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE tracks SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, trackId)
      .run();
  }
  if (body.supervisor_id != null) {
    const supervisorId = Number(body.supervisor_id);
    if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
      return json({ error: "supervisor_required" }, 400);
    }
    const hasRole = await usersHaveRoleColumn(env);
    const supervisorFilter = hasRole
      ? "role = 'track_supervisor'"
      : "COALESCE(is_track_supervisor, 0) = 1";
    const supervisor = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${supervisorFilter} AND COALESCE(is_active, 1) = 1`,
    )
      .bind(supervisorId, auth!.complexId)
      .first();
    if (!supervisor) return json({ error: "supervisor_not_found" }, 404);

    const assignErr = await assignSupervisorToTrack(
      env,
      auth!.complexId,
      trackId,
      supervisorId,
    );
    if (assignErr) return assignErr;
  }
  if (body.stage_ids && (await hasTable(env, "track_stages"))) {
    await env.DB.prepare(`DELETE FROM track_stages WHERE track_id = ?`)
      .bind(trackId)
      .run();
    for (const sid of body.stage_ids) {
      if (sid >= 1 && sid <= 4) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO track_stages (track_id, stage_id) VALUES (?, ?)`,
        )
          .bind(trackId, sid)
          .run();
      }
    }
  }
  if (body.circle_ids && (await hasTable(env, "track_circles"))) {
    await env.DB.prepare(`DELETE FROM track_circles WHERE track_id = ?`)
      .bind(trackId)
      .run();
    const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
    for (const cid of body.circle_ids) {
      const circleId = Number(cid);
      if (!Number.isFinite(circleId)) continue;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO track_circles (track_id, circle_id) VALUES (?, ?)`,
      )
        .bind(trackId, circleId)
        .run();
      if (hasCircleTrack) {
        await env.DB.prepare(
          `UPDATE circles SET track_id = ? WHERE id = ? AND complex_id = ?`,
        )
          .bind(trackId, circleId, auth!.complexId)
          .run();
      }
    }
  }

  return json({ ok: true });
}

export async function handleAdminTeachersPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const m = url.pathname.match(/^\/api\/admin\/teachers\/(\d+)$/);
  const userId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(userId)) return json({ error: "invalid_id" }, 400);

  let body: {
    full_name_ar?: string;
    mobile?: string;
    is_active?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const hasRole = await usersHaveRoleColumn(env);
  const teacherFilter = hasRole
    ? "role IN ('teacher', 'track_supervisor')"
    : "(COALESCE(is_teacher, 0) = 1 OR COALESCE(is_track_supervisor, 0) = 1)";
  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${teacherFilter}`,
  )
    .bind(userId, auth!.complexId)
    .first();
  if (!user) return json({ error: "teacher_not_found" }, 404);

  if (body.full_name_ar?.trim()) {
    await env.DB.prepare(`UPDATE users SET full_name_ar = ? WHERE id = ?`)
      .bind(body.full_name_ar.trim(), userId)
      .run();
  }
  if (body.mobile?.trim()) {
    const mobile = mobileForStorage(body.mobile.trim());
    if (!mobile) {
      return json(
        {
          error: "invalid_mobile",
          message: "رقم جوال سعودي غير صالح (مثال: 0500000000)",
        },
        400,
      );
    }
    const dupId = await findActiveUserIdByMobileVariants(
      env,
      mobileLookupVariants(mobile),
      userId,
    );
    if (dupId) return json({ error: "mobile_already_used" }, 409);
    await env.DB.prepare(`UPDATE users SET mobile = ? WHERE id = ?`)
      .bind(mobile, userId)
      .run();
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE users SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();
  }

  return json({ ok: true });
}

export async function handleAdminTeachersDelete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const m = url.pathname.match(/^\/api\/admin\/teachers\/(\d+)$/);
  const staffUrl = new URL(url);
  staffUrl.pathname = `/api/admin/staff/${m?.[1] ?? ""}`;
  return handleAdminStaffDelete(request, env, staffUrl);
}

export async function handleAdminSupervisorsPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const m = url.pathname.match(/^\/api\/admin\/supervisors\/(\d+)$/);
  const userId = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(userId)) return json({ error: "invalid_id" }, 400);

  let body: {
    full_name_ar?: string;
    mobile?: string;
    role?: UserRole;
    supervisor_scope?: string;
    is_active?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const hasRole = await usersHaveRoleColumn(env);
  const supervisorFilter = hasRole
    ? `role IN (${SUPERVISOR_DB_ROLE_SQL})`
    : `(
        COALESCE(is_track_supervisor, 0) = 1 OR COALESCE(is_educational, 0) = 1 OR
        COALESCE(is_programs, 0) = 1 OR COALESCE(is_admin, 0) = 1
      )`;
  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${supervisorFilter}`,
  )
    .bind(userId, auth!.complexId)
    .first();
  if (!user) return json({ error: "supervisor_not_found" }, 404);

  if (body.full_name_ar?.trim()) {
    await env.DB.prepare(`UPDATE users SET full_name_ar = ? WHERE id = ?`)
      .bind(body.full_name_ar.trim(), userId)
      .run();
  }
  if (body.mobile?.trim()) {
    const mobile = mobileForStorage(body.mobile.trim());
    if (!mobile) {
      return json(
        {
          error: "invalid_mobile",
          message: "رقم جوال سعودي غير صالح (مثال: 0500000000)",
        },
        400,
      );
    }
    const dupId = await findActiveUserIdByMobileVariants(
      env,
      mobileLookupVariants(mobile),
      userId,
    );
    if (dupId) return json({ error: "mobile_already_used" }, 409);
    await env.DB.prepare(`UPDATE users SET mobile = ? WHERE id = ?`)
      .bind(mobile, userId)
      .run();
  }
  if (body.role && isSupervisorInputRole(body.role)) {
    const dbRole = normalizeSupervisorRoleForDb(body.role);
    if (await usersHaveRoleColumn(env)) {
      await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
        .bind(dbRole, userId)
        .run();
    } else if (await usesV25FlatStaffSchema(env)) {
      await applyFlatSupervisorRole(env, userId, body.role);
    } else {
      const flags = legacySupervisorFlags(body.role);
      for (const [flag, value] of Object.entries(flags)) {
        if (await tableHasColumn(env, "users", flag)) {
          await env.DB.prepare(`UPDATE users SET ${flag} = ? WHERE id = ?`)
            .bind(value, userId)
            .run();
        }
      }
    }
    await syncSupervisorSections(env, userId, dbRole);
  }
  if (body.supervisor_scope != null) {
    if (await tableHasColumn(env, "users", "supervisor_scope")) {
      await env.DB.prepare(`UPDATE users SET supervisor_scope = ? WHERE id = ?`)
        .bind(body.supervisor_scope, userId)
        .run();
    } else if (await tableHasColumn(env, "users", "stage_scope")) {
      await env.DB.prepare(`UPDATE users SET stage_scope = ? WHERE id = ?`)
        .bind(body.supervisor_scope, userId)
        .run();
    }
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE users SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();
  }

  return json({ ok: true });
  } catch (error: unknown) {
    console.error("[admin-gm] supervisors patch:", error);
    return json(
      {
        error: "supervisor_patch_failed",
        message:
          error instanceof Error ? error.message : "Failed to update supervisor",
      },
      500,
    );
  }
}

async function clearUserRelationsBeforeDelete(
  env: Env,
  userId: number,
  complexId: number,
): Promise<void> {
  const childDeletes: Array<[string, string]> = [
    ["sessions", "user_id"],
    ["user_sections", "user_id"],
    ["supervisor_scopes", "user_id"],
    ["teacher_assignments", "user_id"],
    ["staff_attendance", "user_id"],
    ["teacher_daily_marks", "user_id"],
    ["teacher_escalations", "created_by_user_id"],
    ["teacher_escalations", "resolved_by_user_id"],
  ];
  for (const [table, column] of childDeletes) {
    if (!(await hasTable(env, table))) continue;
    if (!(await tableHasColumn(env, table, column))) continue;
    await env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`)
      .bind(userId)
      .run();
  }
  if (await tableHasColumn(env, "circles", "teacher_id")) {
    await env.DB.prepare(
      `UPDATE circles SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
    )
      .bind(userId, complexId)
      .run();
  }
}

export async function handleAdminSupervisorsDelete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    const denied = requireGm(auth);
    if (denied) return denied;

    const m = url.pathname.match(/^\/api\/admin\/supervisors\/(\d+)$/);
    const userId = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(userId)) return json({ error: "invalid_id" }, 400);

    const hasRole = await usersHaveRoleColumn(env);
    const supervisorFilter = hasRole
      ? `role IN (${SUPERVISOR_DB_ROLE_SQL})`
      : `(
        COALESCE(is_track_supervisor, 0) = 1 OR COALESCE(is_educational, 0) = 1 OR
        COALESCE(is_programs, 0) = 1 OR COALESCE(is_admin, 0) = 1
      )`;
    const user = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND ${supervisorFilter}`,
    )
      .bind(userId, auth!.complexId)
      .first();
    if (!user) return json({ error: "supervisor_not_found" }, 404);

    const staffUrl = new URL(url);
    staffUrl.pathname = `/api/admin/staff/${userId}`;
    return handleAdminStaffDelete(request, env, staffUrl);
  } catch (error: unknown) {
    console.error("[admin-gm] supervisors delete:", error);
    return json(
      {
        error: "admin_gm_error",
        message:
          error instanceof Error ? error.message : "Failed to delete supervisor",
      },
      500,
    );
  }
}

export async function handleAdminGmRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  try {
    return await handleAdminGmRouterImpl(request, env, url, path, method);
  } catch (error: unknown) {
    console.error("[admin-gm] router:", error);
    return json(
      {
        error: "admin_gm_error",
        message:
          error instanceof Error ? error.message : "Uncaught admin-gm error",
      },
      500,
    );
  }
}

async function handleAdminGmRouterImpl(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  method: string,
): Promise<Response | null> {
  if (method === "GET" && path === "/api/admin/staff") {
    return handleAdminStaffList(request, env);
  }
  if (method === "PATCH" && /^\/api\/admin\/staff\/\d+$/.test(path)) {
    return handleAdminStaffPatch(request, env, url);
  }
  if (method === "DELETE" && /^\/api\/admin\/staff\/\d+$/.test(path)) {
    return handleAdminStaffDelete(request, env, url);
  }
  if (method === "GET" && path === "/api/admin/teachers") {
    return handleAdminStaffList(request, env);
  }
  if (method === "POST" && path === "/api/admin/teachers") {
    return handleAdminTeachersCreate(request, env);
  }
  if (method === "GET" && path === "/api/admin/supervisors") {
    return handleAdminStaffList(request, env);
  }
  if (method === "POST" && path === "/api/admin/supervisors") {
    return handleAdminSupervisorsCreate(request, env);
  }
  if (method === "GET" && path === "/api/admin/educational-groups") {
    return handleAdminEducationalGroupsList(request, env);
  }
  if (
    method === "DELETE" &&
    /^\/api\/admin\/educational-groups\/(circle|track)\/\d+$/.test(path)
  ) {
    return handleAdminEducationalGroupsDelete(request, env, url);
  }
  if (method === "GET" && path === "/api/admin/circles/summary") {
    return handleAdminCirclesSummary(request, env);
  }
  if (method === "POST" && path === "/api/admin/circles") {
    return handleAdminCirclesCreate(request, env);
  }
  if (method === "PATCH" && /^\/api\/admin\/circles\/\d+$/.test(path)) {
    return handleAdminCirclesPatch(request, env, url);
  }
  if (method === "GET" && path === "/api/admin/tracks") {
    return handleAdminTracksList(request, env);
  }
  if (method === "POST" && path === "/api/admin/tracks") {
    return handleAdminTracksCreate(request, env);
  }
  if (method === "PATCH" && /^\/api\/admin\/tracks\/\d+$/.test(path)) {
    return handleAdminTracksPatch(request, env, url);
  }
  if (method === "PATCH" && /^\/api\/admin\/teachers\/\d+$/.test(path)) {
    return handleAdminTeachersPatch(request, env, url);
  }
  if (method === "DELETE" && /^\/api\/admin\/teachers\/\d+$/.test(path)) {
    return handleAdminTeachersDelete(request, env, url);
  }
  if (method === "PATCH" && /^\/api\/admin\/supervisors\/\d+$/.test(path)) {
    return handleAdminSupervisorsPatch(request, env, url);
  }
  if (method === "DELETE" && /^\/api\/admin\/supervisors\/\d+$/.test(path)) {
    return handleAdminSupervisorsDelete(request, env, url);
  }

  return null;
}

