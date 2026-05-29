import type { Env } from "../types";
import type { UserRole } from "../types";
import { hashPassword } from "../lib/password";
import {
  computeCapacity,
  getCircleCapacity,
  capacityWarningMessage,
} from "../lib/circle-capacity";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { usersHaveRoleColumn } from "../lib/db-user";
import { activePlacementSql, hasTable, tableHasColumn } from "../lib/db-schema";

const GM_ONLY: UserRole[] = ["super_admin"];
const DEFAULT_PASSWORD = "Basateen123!";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function requireGm(auth: Awaited<ReturnType<typeof getAuth>>) {
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, GM_ONLY)) return json({ error: "forbidden" }, 403);
  return null;
}

function emailForMobile(mobile: string, role: string): string {
  const clean = mobile.replace(/\D/g, "");
  return `${role}-${clean}@basateen.local`;
}

export async function handleAdminTeachersList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            ta.circle_id, c.name_ar AS circle_name, COALESCE(c.stage_id, 2) AS stage_id
     FROM users u
     LEFT JOIN teacher_assignments ta ON ta.user_id = u.id
     LEFT JOIN circles c ON c.id = ta.circle_id
     WHERE u.complex_id = ? AND u.role = 'teacher'
     ORDER BY u.full_name_ar`,
  )
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
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.full_name_ar?.trim() || !body.mobile?.trim()) {
    return json({ error: "name_and_mobile_required" }, 400);
  }
  const circleId = Number(body.circle_id);
  if (!Number.isFinite(circleId) || circleId <= 0) {
    return json({ error: "circle_id_required" }, 400);
  }

  const circle = await env.DB.prepare(
    `SELECT id FROM circles WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(circleId, auth!.complexId)
    .first();

  if (!circle) return json({ error: "circle_not_found" }, 404);

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
     VALUES (?, ?, ?, ?, ?, 'teacher')`,
  )
    .bind(
      auth!.complexId,
      emailForMobile(mobile, "teacher"),
      mobile,
      passwordHash,
      body.full_name_ar.trim(),
    )
    .run();

  const userId = ins.meta.last_row_id as number;
  await env.DB.prepare(
    `INSERT INTO user_sections (user_id, section) VALUES (?, 'education')`,
  )
    .bind(userId)
    .run();

  await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
    .bind(circleId)
    .run();
  await env.DB.prepare(
    `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
  )
    .bind(userId, circleId)
    .run();

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
         WHERE complex_id = ? AND role IN ('edu_supervisor', 'prog_supervisor', 'admin_supervisor', 'general_supervisor')
         ORDER BY full_name_ar`,
      )
        .bind(auth!.complexId)
        .all()
    : await env.DB.prepare(
        `SELECT id, full_name_ar, mobile, is_active,
                CASE
                  WHEN COALESCE(is_track_supervisor, 0) = 1 THEN 'track_supervisor'
                  WHEN COALESCE(is_educational, 0) = 1 THEN 'edu_supervisor'
                  WHEN COALESCE(is_programs, 0) = 1 THEN 'prog_supervisor'
                  WHEN COALESCE(is_admin, 0) = 1 THEN 'admin_supervisor'
                  ELSE 'admin_supervisor'
                END AS role,
                COALESCE(stage_scope, 'global') AS supervisor_scope
         FROM users
         WHERE complex_id = ? AND is_active = 1
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
  if (
    !role ||
    !["edu_supervisor", "prog_supervisor", "general_supervisor"].includes(role)
  ) {
    return json({ error: "invalid_supervisor_role" }, 400);
  }
  if (!body.full_name_ar?.trim() || !body.mobile?.trim()) {
    return json({ error: "name_and_mobile_required" }, 400);
  }

  const scope = body.supervisor_scope?.trim() || "global";
  const mobile = body.mobile.trim();
  const existing = await env.DB.prepare(`SELECT id FROM users WHERE mobile = ?`)
    .bind(mobile)
    .first();
  if (existing) return json({ error: "mobile_already_used" }, 409);

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const ins = await env.DB.prepare(
    `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role, supervisor_scope)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      auth!.complexId,
      emailForMobile(mobile, role),
      mobile,
      passwordHash,
      body.full_name_ar.trim(),
      role,
      scope,
    )
    .run();

  const userId = ins.meta.last_row_id as number;
  const sections =
    role === "prog_supervisor"
      ? ["programs"]
      : role === "edu_supervisor"
        ? ["admin", "education"]
        : ["admin", "education", "programs"];

  for (const section of sections) {
    await env.DB.prepare(
      `INSERT INTO user_sections (user_id, section) VALUES (?, ?)`,
    )
      .bind(userId, section)
      .run();
  }

  return json({ ok: true, id: userId });
}

export async function handleAdminCirclesSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
  if (denied) return denied;

  const hasRole = await usersHaveRoleColumn(env);
  const hasTeacherAssignments = await hasTable(env, "teacher_assignments");
  const activePlacement = await activePlacementSql(env, "h");
  const teacherJoin = hasTeacherAssignments
    ? `LEFT JOIN teacher_assignments ta ON ta.circle_id = c.id
     LEFT JOIN users u ON u.id = ta.user_id AND ${
       hasRole ? "u.role = 'teacher'" : "u.is_teacher = 1"
     }`
    : "";
  const teacherIdCol = hasTeacherAssignments
    ? "u.id AS teacher_id, u.full_name_ar AS teacher_name"
    : "NULL AS teacher_id, NULL AS teacher_name";

  const rows = await env.DB.prepare(
    `SELECT c.id, c.name_ar, COALESCE(c.stage_id, 2) AS stage_id,
            COALESCE(c.default_capacity, c.capacity, 20) AS default_capacity,
            c.track_id, t.name_ar AS track_name, c.is_active,
            ${teacherIdCol},
            (SELECT COUNT(*) FROM student_circle_history h
             WHERE h.circle_id = c.id AND ${activePlacement}) AS student_count
     FROM circles c
     LEFT JOIN tracks t ON t.id = c.track_id
     ${teacherJoin}
     WHERE c.complex_id = ?
     ORDER BY c.stage_id, c.name_ar`,
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
}

export async function handleAdminCirclesCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  const denied = requireGm(auth);
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
  let teacherId = Number(body.teacher_user_id);
  if (!Number.isFinite(teacherId) || teacherId <= 0) {
    if (
      body.new_teacher?.full_name_ar?.trim() &&
      body.new_teacher?.mobile?.trim()
    ) {
      const mobile = body.new_teacher.mobile.trim();
      const passwordHash = await hashPassword(DEFAULT_PASSWORD);
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
      await env.DB.prepare(
        `INSERT INTO user_sections (user_id, section) VALUES (?, 'education')`,
      )
        .bind(teacherId)
        .run();
    } else {
      return json({ error: "teacher_required" }, 400);
    }
  } else {
    const teacher = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND complex_id = ? AND role = 'teacher' AND is_active = 1`,
    )
      .bind(teacherId, auth!.complexId)
      .first();
    if (!teacher) return json({ error: "teacher_not_found" }, 404);
  }

  const trackId =
    body.track_id != null && body.track_id !== undefined
      ? Number(body.track_id)
      : null;

  const ins = await env.DB.prepare(
    `INSERT INTO circles (complex_id, track_id, name_ar, capacity, default_capacity, stage_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      auth!.complexId,
      trackId,
      body.name_ar.trim(),
      defaultCapacity,
      defaultCapacity,
      stageId,
    )
    .run();

  const circleId = ins.meta.last_row_id as number;
  await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
    .bind(circleId)
    .run();
  await env.DB.prepare(
    `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
  )
    .bind(teacherId, circleId)
    .run();

  if (trackId) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO track_circles (track_id, circle_id) VALUES (?, ?)`,
    )
      .bind(trackId, circleId)
      .run();
  }

  return json({ ok: true, id: circleId });
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
  if (hasSupervisorCol && body.supervisor_id != null) {
    const supervisorId = Number(body.supervisor_id);
    if (!Number.isFinite(supervisorId)) {
      return json({ error: "supervisor_required" }, 400);
    }
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

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND complex_id = ? AND role = 'teacher'`,
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
    }
  }

  return json({ ok: true });
}

export async function handleAdminSupervisorsPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
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

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND complex_id = ? AND role IN ('edu_supervisor','prog_supervisor','admin_supervisor', 'general_supervisor')`,
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
  if (body.role && ["edu_supervisor", "prog_supervisor", "general_supervisor"].includes(body.role)) {
    await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
      .bind(body.role, userId)
      .run();
  }
  if (body.supervisor_scope != null) {
    await env.DB.prepare(`UPDATE users SET supervisor_scope = ? WHERE id = ?`)
      .bind(body.supervisor_scope, userId)
      .run();
  }
  if (body.is_active != null) {
    await env.DB.prepare(`UPDATE users SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, userId)
      .run();
  }

  return json({ ok: true });
}

export async function handleAdminGmRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

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
  if (method === "PATCH" && /^\/api\/admin\/supervisors\/\d+$/.test(path)) {
    return handleAdminSupervisorsPatch(request, env, url);
  }

  return null;
}

