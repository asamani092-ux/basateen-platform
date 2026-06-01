import type { Env } from "../types";
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
  usesV25FlatStaffSchema,
  v25SupervisorFlagsForRole,
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

/** O(k) — k = حلقات المسار؛ ربط المستخدم بكل حلقات المسار */
async function assignUserToTrackCircles(
  env: Env,
  userId: number,
  trackId: number,
  complexId: number,
): Promise<void> {
  if (!(await hasTable(env, "teacher_assignments"))) return;

  const hasCircleTrack = await tableHasColumn(env, "circles", "track_id");
  const hasTrackCircles = await hasTable(env, "track_circles");
  let circleSql = `SELECT id FROM circles WHERE complex_id = ? AND COALESCE(is_active, 1) = 1 AND (`;
  const parts: string[] = [];
  if (hasCircleTrack) parts.push(`track_id = ?`);
  if (hasTrackCircles) parts.push(`id IN (SELECT circle_id FROM track_circles WHERE track_id = ?)`);
  if (parts.length === 0) return;
  circleSql += parts.join(" OR ") + ")";
  const circleBinds: number[] = [complexId];
  for (let i = 0; i < parts.length; i++) circleBinds.push(trackId);

  const circles = await env.DB.prepare(circleSql)
    .bind(...circleBinds)
    .all<{ id: number }>();

  await env.DB.prepare(`DELETE FROM teacher_assignments WHERE user_id = ?`)
    .bind(userId)
    .run();

  for (const c of circles.results ?? []) {
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
      .bind(c.id)
      .run();
    await env.DB.prepare(
      `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
    )
      .bind(userId, c.id)
      .run();
  }

  if (await tableHasColumn(env, "tracks", "supervisor_id")) {
    await env.DB.prepare(
      `UPDATE tracks SET supervisor_id = ? WHERE id = ? AND complex_id = ?`,
    )
      .bind(userId, trackId, complexId)
      .run();
  }
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
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const dbRole = normalizeSupervisorRoleForDb(body.role);
  const hasRoleCol = await usersHaveRoleColumn(env);
  const hasScopeCol = await tableHasColumn(env, "users", "supervisor_scope");
  const hasStageScope = await tableHasColumn(env, "users", "stage_scope");

  const cols = ["complex_id", "email", "mobile", "password_hash", "full_name_ar"];
  const vals: (string | number)[] = [
    complexId,
    emailForMobile(body.mobile, dbRole),
    body.mobile,
    passwordHash,
    body.full_name_ar,
  ];

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

  let body: {
    full_name_ar?: string;
    mobile?: string;
    circle_id?: number;
    track_id?: number;
    role?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.full_name_ar?.trim() || !body.mobile?.trim()) {
    return json({ error: "name_and_mobile_required" }, 400);
  }
  const staffRole =
    body.role === "track_supervisor" ? "track_supervisor" : "teacher";
  const trackId = Number(body.track_id);
  const circleId = Number(body.circle_id);
  const useTrack =
    staffRole === "track_supervisor" &&
    Number.isFinite(trackId) &&
    trackId > 0;

  if (!useTrack && (!Number.isFinite(circleId) || circleId <= 0)) {
    return json(
      {
        error:
          staffRole === "track_supervisor" ? "track_id_required" : "circle_id_required",
      },
      400,
    );
  }
  if (useTrack) {
    const track = await env.DB.prepare(
      `SELECT id FROM tracks WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1`,
    )
      .bind(trackId, auth!.complexId)
      .first();
    if (!track) return json({ error: "track_not_found" }, 404);
  } else {
    const circle = await env.DB.prepare(
      `SELECT id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(circleId, auth!.complexId)
      .first();
    if (!circle) return json({ error: "circle_not_found" }, 404);
  }

  const mobile = body.mobile.trim();
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE mobile = ?`,
  )
    .bind(mobile)
    .first();
  if (existing) return json({ error: "mobile_already_used" }, 409);

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const ins = await env.DB.prepare(
    `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      auth!.complexId,
      emailForMobile(mobile, staffRole),
      mobile,
      passwordHash,
      body.full_name_ar.trim(),
      staffRole,
    )
    .run();

  const userId = ins.meta.last_row_id as number;
  await env.DB.prepare(
    `INSERT INTO user_sections (user_id, section) VALUES (?, 'education')`,
  )
    .bind(userId)
    .run();

  if (useTrack) {
    await assignUserToTrackCircles(env, userId, trackId, auth!.complexId);
  } else {
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
      .bind(circleId)
      .run();
    await env.DB.prepare(
      `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
    )
      .bind(userId, circleId)
      .run();
  }

  return json({ ok: true, id: userId });
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
        `SELECT id, full_name_ar, mobile, role, COALESCE(supervisor_scope, 'global') AS supervisor_scope, is_active
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
                END AS role,
                COALESCE(stage_scope, 'global') AS supervisor_scope
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
    circle_id?: number;
    track_id?: number;
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
  const mobile = body.mobile.trim();
  const existing = await env.DB.prepare(`SELECT id FROM users WHERE mobile = ?`)
    .bind(mobile)
    .first();
  if (existing) return json({ error: "mobile_already_used" }, 409);

  const userId = await insertSupervisorUser(env, auth!.complexId, {
    full_name_ar: body.full_name_ar.trim(),
    mobile,
    role,
    supervisor_scope: scope,
  });

  await syncSupervisorSections(env, userId, role);

  if (dbRole === "track_supervisor") {
    const trackId = Number(body.track_id);
    const circleId = Number(body.circle_id);
    if (Number.isFinite(trackId) && trackId > 0) {
      const track = await env.DB.prepare(
        `SELECT id FROM tracks WHERE id = ? AND complex_id = ? AND COALESCE(is_active, 1) = 1`,
      )
        .bind(trackId, auth!.complexId)
        .first();
      if (!track) return json({ error: "track_not_found" }, 404);
      await assignUserToTrackCircles(env, userId, trackId, auth!.complexId);
    } else if (Number.isFinite(circleId) && circleId > 0) {
      const circle = await env.DB.prepare(
        `SELECT id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
      )
        .bind(circleId, auth!.complexId)
        .first();
      if (!circle) return json({ error: "circle_not_found" }, 404);
      if (await hasTable(env, "teacher_assignments")) {
        await env.DB.prepare(`DELETE FROM teacher_assignments WHERE user_id = ?`)
          .bind(userId)
          .run();
        await env.DB.prepare(
          `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
        )
          .bind(userId, circleId)
          .run();
      }
    } else {
      return json({ error: "track_id_required" }, 400);
    }
  }

  return json({ ok: true, id: userId });
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
        const passwordHash = await hashPassword(DEFAULT_PASSWORD);
        if (hasRole) {
          const tIns = await env.DB.prepare(
            `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role)
             VALUES (?, ?, ?, ?, ?, 'teacher')`,
          )
            .bind(
              auth!.complexId,
              emailForMobile(mobile, "teacher"),
              mobile,
              passwordHash,
              body.new_teacher.full_name_ar.trim(),
            )
            .run();
          teacherId = tIns.meta.last_row_id as number;
          if (await hasTable(env, "user_sections")) {
            await env.DB.prepare(
              `INSERT INTO user_sections (user_id, section) VALUES (?, 'education')`,
            )
              .bind(teacherId)
              .run();
          }
        } else {
          const tIns = await env.DB.prepare(
            `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, is_teacher)
             VALUES (?, ?, ?, ?, ?, 1)`,
          )
            .bind(
              auth!.complexId,
              emailForMobile(mobile, "teacher"),
              mobile,
              passwordHash,
              body.new_teacher.full_name_ar.trim(),
            )
            .run();
          teacherId = tIns.meta.last_row_id as number;
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
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
      .bind(circleId)
      .run();
    await env.DB.prepare(
      `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
    )
      .bind(teacherId, circleId)
      .run();
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

export async function handleAdminTracksCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  let body: {
    name_ar?: string;
    default_capacity?: number;
    supervisor_id?: number;
    stage_ids?: number[];
    circle_ids?: number[];
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.name_ar?.trim()) return json({ error: "name_required" }, 400);
  const defaultCapacity = Number(body.default_capacity ?? 20);
  if (!Number.isFinite(defaultCapacity) || defaultCapacity < 1) {
    return json({ error: "default_capacity_required" }, 400);
  }

  const hasSupervisorCol = await tableHasColumn(env, "tracks", "supervisor_id");
  const hasTrackStages = await hasTable(env, "track_stages");

  if (hasSupervisorCol && !hasTrackStages) {
    const supervisorId = Number(body.supervisor_id);
    if (!Number.isFinite(supervisorId)) {
      return json({ error: "supervisor_required" }, 400);
    }
    const sup = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(supervisorId, auth!.complexId)
      .first<{ id: number }>();
    if (!sup) return json({ error: "supervisor_not_found" }, 404);

    const ins = await env.DB.prepare(
      `INSERT INTO tracks (complex_id, name_ar, supervisor_id, default_capacity)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(auth!.complexId, body.name_ar.trim(), supervisorId, defaultCapacity)
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
    body.name_ar.trim(),
    defaultCapacity,
  ];
  if (hasSupervisorCol) {
    const supervisorId = Number(body.supervisor_id);
    if (!Number.isFinite(supervisorId)) {
      return json({ error: "supervisor_required" }, 400);
    }
    const sup = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(supervisorId, auth!.complexId)
      .first<{ id: number }>();
    if (!sup) return json({ error: "supervisor_not_found" }, 404);
    cols.push("supervisor_id");
    vals.push(supervisorId);
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
    circle_id?: number;
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
    const dup = await env.DB.prepare(
      `SELECT id FROM users WHERE mobile = ? AND id != ?`,
    )
      .bind(body.mobile.trim(), userId)
      .first();
    if (dup) return json({ error: "mobile_already_used" }, 409);
    await env.DB.prepare(`UPDATE users SET mobile = ? WHERE id = ?`)
      .bind(body.mobile.trim(), userId)
      .run();
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE users SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();
  }
  if (body.circle_id != null) {
    const circleId = Number(body.circle_id);
    if (Number.isFinite(circleId) && circleId > 0) {
      if (await hasTable(env, "teacher_assignments")) {
        await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
          .bind(circleId)
          .run();
        await env.DB.prepare(`DELETE FROM teacher_assignments WHERE user_id = ?`)
          .bind(userId)
          .run();
        await env.DB.prepare(
          `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
        )
          .bind(userId, circleId)
          .run();
      } else if (await tableHasColumn(env, "circles", "teacher_id")) {
        await env.DB.prepare(
          `UPDATE circles SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
        )
          .bind(userId, auth!.complexId)
          .run();
        await env.DB.prepare(
          `UPDATE circles SET teacher_id = ? WHERE id = ? AND complex_id = ?`,
        )
          .bind(userId, circleId, auth!.complexId)
          .run();
      }
    }
  }

  return json({ ok: true });
}

export async function handleAdminTeachersDelete(
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

  if (await tableHasColumn(env, "circles", "teacher_id")) {
    await env.DB.prepare(
      `UPDATE circles SET teacher_id = NULL WHERE teacher_id = ? AND complex_id = ?`,
    )
      .bind(userId, auth!.complexId)
      .run();
  }
  if (await hasTable(env, "teacher_assignments")) {
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE user_id = ?`)
      .bind(userId)
      .run();
  }
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();

  return json({ ok: true });
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
    const dup = await env.DB.prepare(
      `SELECT id FROM users WHERE mobile = ? AND id != ?`,
    )
      .bind(body.mobile.trim(), userId)
      .first();
    if (dup) return json({ error: "mobile_already_used" }, 409);
    await env.DB.prepare(`UPDATE users SET mobile = ? WHERE id = ?`)
      .bind(body.mobile.trim(), userId)
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

    await clearUserRelationsBeforeDelete(env, userId, auth!.complexId);

    try {
      await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
      return json({ ok: true });
    } catch (deleteErr) {
      if (await tableHasColumn(env, "users", "is_active")) {
        await env.DB.prepare(`UPDATE users SET is_active = 0 WHERE id = ?`)
          .bind(userId)
          .run();
        return json({ ok: true, soft_deleted: true });
      }
      throw deleteErr;
    }
  } catch (error: unknown) {
    console.error("[admin-gm] supervisors delete:", error);
    return json(
      {
        error: "supervisor_delete_failed",
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
  if (method === "GET" && path === "/api/admin/teachers") {
    return handleAdminTeachersList(request, env);
  }
  if (method === "POST" && path === "/api/admin/teachers") {
    return handleAdminTeachersCreate(request, env);
  }
  if (method === "GET" && path === "/api/admin/supervisors") {
    return handleAdminSupervisorsList(request, env);
  }
  if (method === "POST" && path === "/api/admin/supervisors") {
    return handleAdminSupervisorsCreate(request, env);
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

