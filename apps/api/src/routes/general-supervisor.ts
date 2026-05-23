import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import {
  loadUserScope,
  parseSupervisorScope,
  STAGE_LABELS,
  staffScopeBinds,
  staffScopeWhere,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  type ScopeMode,
} from "../lib/supervisor-scope";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireGs(auth: Awaited<ReturnType<typeof getAuth>>) {
  if (!requireAuth(auth)) return null;
  if (!requireRoles(auth!, ["general_supervisor"])) return null;
  return auth;
}

async function gsScope(env: Env, userId: number): Promise<ScopeMode> {
  return loadUserScope(env, userId);
}

export async function handleGeneralSupervisorRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/general-supervisor/")) return null;

  const auth = await getAuth(request, env);
  const gs = await requireGs(auth);
  if (!gs) {
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    return json({ error: "forbidden" }, 403);
  }

  const scope = await gsScope(env, gs.userId);

  if (request.method === "GET" && path === "/api/general-supervisor/scope") {
    const row = await env.DB.prepare(
      `SELECT supervisor_scope FROM users WHERE id = ?`,
    )
      .bind(gs.userId)
      .first<{ supervisor_scope: string | null }>();
    return json({
      scope: parseSupervisorScope(row?.supervisor_scope),
      supervisor_scope: row?.supervisor_scope ?? "global",
      stage_labels: STAGE_LABELS,
    });
  }

  if (
    request.method === "GET" &&
    path === "/api/general-supervisor/staff-attendance/today"
  ) {
    const date = url.searchParams.get("date")?.trim() || todayIso();
    const staff = await env.DB.prepare(
      `SELECT u.id, u.full_name_ar, u.role,
              sa.status AS saved_status, sa.recorded_at
       FROM users u
       LEFT JOIN staff_attendance sa
         ON sa.user_id = u.id AND sa.attendance_date = ? AND sa.complex_id = ?
       WHERE ${staffScopeWhere(scope)}
       ORDER BY u.role, u.full_name_ar`,
    )
      .bind(
        date,
        gs.complexId,
        gs.complexId,
        ...staffScopeBinds(gs.complexId, scope),
      )
      .all<{
        id: number;
        full_name_ar: string;
        role: string;
        saved_status: string | null;
        recorded_at: string | null;
      }>();

    const items = (staff.results ?? []).map((r) => ({
      user_id: r.id,
      full_name_ar: r.full_name_ar,
      role: r.role,
      status: r.saved_status ?? "present",
      recorded_at: r.recorded_at,
    }));

    return json({ date, items, default_status: "present" });
  }

  if (
    request.method === "POST" &&
    path === "/api/general-supervisor/staff-attendance/init-today"
  ) {
    const date = todayIso();
    const staff = await env.DB.prepare(
      `SELECT u.id FROM users u WHERE ${staffScopeWhere(scope)}`,
    )
      .bind(gs.complexId, ...staffScopeBinds(gs.complexId, scope))
      .all<{ id: number }>();

    for (const row of staff.results ?? []) {
      await env.DB.prepare(
        `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, recorded_by_user_id)
         VALUES (?, ?, ?, 'present', ?)
         ON CONFLICT(user_id, attendance_date) DO NOTHING`,
      )
        .bind(gs.complexId, row.id, date, gs.userId)
        .run();
    }

    return json({ ok: true, date, count: staff.results?.length ?? 0 });
  }

  if (
    request.method === "POST" &&
    path === "/api/general-supervisor/staff-attendance/upsert"
  ) {
    let body: { user_id?: number; status?: string; attendance_date?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const userId = Number(body.user_id);
    if (!Number.isFinite(userId)) return json({ error: "user_id_required" }, 400);
    const status = body.status ?? "present";
    if (!["present", "absent", "excused"].includes(status)) {
      return json({ error: "invalid_status" }, 400);
    }
    const date = body.attendance_date?.trim() || todayIso();

    const allowed = await env.DB.prepare(
      `SELECT u.id FROM users u WHERE ${staffScopeWhere(scope)} AND u.id = ?`,
    )
      .bind(gs.complexId, ...staffScopeBinds(gs.complexId, scope), userId)
      .first();

    if (!allowed) return json({ error: "staff_out_of_scope" }, 403);

    await env.DB.prepare(
      `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, recorded_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         recorded_by_user_id = excluded.recorded_by_user_id,
         recorded_at = datetime('now')`,
    )
      .bind(gs.complexId, userId, date, status, gs.userId)
      .run();

    return json({ ok: true, user_id: userId, status, attendance_date: date });
  }

  if (request.method === "GET" && path === "/api/general-supervisor/applications") {
    const stageWhere = stageFilterWhere(scope, "a.stage_id");
    const status = url.searchParams.get("status") ?? "pending";
    const binds: (number | string)[] = [
      gs.complexId,
      status,
      ...stageFilterBinds(scope),
    ];

    const rows = await env.DB.prepare(
      `SELECT a.* FROM student_applications a
       WHERE a.complex_id = ? AND a.status = ? AND ${stageWhere}
       ORDER BY a.created_at DESC LIMIT 100`,
    )
      .bind(...binds)
      .all();

    return json({ items: rows.results ?? [] });
  }

  if (request.method === "POST" && path === "/api/general-supervisor/applications") {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const required = [
      "full_name_ar",
      "phone",
      "national_id",
      "school_grade",
      "stage_id",
      "guardian_phone",
    ] as const;
    for (const k of required) {
      const v = String(body[k] ?? "").trim();
      if (!v) return json({ error: `missing_${k}` }, 400);
    }

    const stageId = Number(body.stage_id);
    if (!Number.isFinite(stageId) || stageId < 1 || stageId > 4) {
      return json({ error: "invalid_stage" }, 400);
    }
    if (scope.type === "stages" && !scope.stageIds.includes(stageId)) {
      return json({ error: "stage_out_of_scope" }, 403);
    }

    const opt = (k: string) => {
      const v = body[k];
      if (v == null || String(v).trim() === "") return null;
      return String(v).trim();
    };

    const ins = await env.DB.prepare(
      `INSERT INTO student_applications (
        complex_id, full_name_ar, phone, national_id, school_grade, stage_id, age,
        guardian_phone, guardian_national_id, guardian_work, health_notes,
        status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(
        gs.complexId,
        String(body.full_name_ar).trim(),
        String(body.phone).trim(),
        String(body.national_id).trim(),
        String(body.school_grade).trim(),
        stageId,
        body.age != null && String(body.age).trim() !== ""
          ? Number(body.age)
          : null,
        String(body.guardian_phone).trim(),
        opt("guardian_national_id"),
        opt("guardian_work"),
        opt("health_notes"),
        gs.userId,
      )
      .run();

    return json({ ok: true, id: ins.meta.last_row_id });
  }

  const acceptMatch = path.match(
    /^\/api\/general-supervisor\/applications\/(\d+)\/accept$/,
  );
  if (request.method === "POST" && acceptMatch) {
    const appId = Number(acceptMatch[1]);
    const app = await env.DB.prepare(
      `SELECT * FROM student_applications WHERE id = ? AND complex_id = ? AND status = 'pending'`,
    )
      .bind(appId, gs.complexId)
      .first<Record<string, unknown>>();

    if (!app) return json({ error: "not_found" }, 404);
    const stageId = Number(app.stage_id);
    if (scope.type === "stages" && !scope.stageIds.includes(stageId)) {
      return json({ error: "stage_out_of_scope" }, 403);
    }

    let studentId = app.student_id ? Number(app.student_id) : null;

    if (studentId) {
      await env.DB.prepare(
        `UPDATE students SET
          full_name_ar = ?, phone = ?, national_id = ?, school_grade = ?,
          stage_id = ?, age = ?, guardian_phone = ?, guardian_national_id = ?,
          guardian_work = ?, health_notes = ?, admission_status = 'pending_placement',
          is_active = 1, account_status = 'active'
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          app.full_name_ar,
          app.phone,
          app.national_id,
          app.school_grade,
          stageId,
          app.age,
          app.guardian_phone,
          app.guardian_national_id,
          app.guardian_work,
          app.health_notes,
          studentId,
          gs.complexId,
        )
        .run();
    } else {
      const ins = await env.DB.prepare(
        `INSERT INTO students (
          complex_id, full_name_ar, national_id, phone, school_grade, stage_id, age,
          guardian_phone, guardian_national_id, guardian_work, health_notes,
          admission_status, is_active, account_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_placement', 1, 'active')`,
      )
        .bind(
          gs.complexId,
          app.full_name_ar,
          app.national_id,
          app.phone,
          app.school_grade,
          stageId,
          app.age,
          app.guardian_phone,
          app.guardian_national_id,
          app.guardian_work,
          app.health_notes,
        )
        .run();
      studentId = ins.meta.last_row_id as number;
    }

    await env.DB.prepare(
      `UPDATE student_applications SET status = 'accepted', student_id = ?,
        processed_at = datetime('now'), processed_by_user_id = ?
       WHERE id = ?`,
    )
      .bind(studentId, gs.userId, appId)
      .run();

    return json({
      ok: true,
      student_id: studentId,
      admission_status: "pending_placement",
      stage_id: stageId,
    });
  }

  const rejectMatch = path.match(
    /^\/api\/general-supervisor\/applications\/(\d+)\/reject$/,
  );
  if (request.method === "POST" && rejectMatch) {
    const appId = Number(rejectMatch[1]);
    await env.DB.prepare(
      `UPDATE student_applications SET status = 'rejected',
        processed_at = datetime('now'), processed_by_user_id = ?
       WHERE id = ? AND complex_id = ? AND status = 'pending'`,
    )
      .bind(gs.userId, appId, gs.complexId)
      .run();

    return json({ ok: true });
  }

  if (request.method === "GET" && path === "/api/general-supervisor/disciplinary") {
    const stageWhere = stageFilterWhere(scope, "s.stage_id");
    const binds: (number | string)[] = [gs.complexId, ...stageFilterBinds(scope)];

    const rows = await env.DB.prepare(
      `SELECT s.id, s.full_name_ar, s.stage_id, s.account_status,
              COALESCE(d.notice_count, 0) AS notice_count,
              COALESCE(d.escalation_level, 'none') AS escalation_level,
              COALESCE(d.pledge_archived, 0) AS pledge_archived,
              (SELECT COUNT(*) FROM violations v WHERE v.student_id = s.id) AS violation_rows
       FROM students s
       LEFT JOIN student_disciplinary_state d ON d.student_id = s.id
       WHERE s.complex_id = ? AND s.is_active = 1
         AND (${stageWhere} OR s.stage_id IS NULL)
       ORDER BY COALESCE(d.notice_count, 0) DESC, s.full_name_ar
       LIMIT 80`,
    )
      .bind(...binds)
      .all();

    return json({ items: rows.results ?? [] });
  }

  const violMatch = path.match(
    /^\/api\/general-supervisor\/disciplinary\/(\d+)\/violation$/,
  );
  if (request.method === "POST" && violMatch) {
    const studentId = Number(violMatch[1]);
    let body: { description?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const st = await env.DB.prepare(
      `SELECT id, stage_id FROM students WHERE id = ? AND complex_id = ?`,
    )
      .bind(studentId, gs.complexId)
      .first<{ id: number; stage_id: number | null }>();

    if (!st) return json({ error: "not_found" }, 404);
    if (
      scope.type === "stages" &&
      st.stage_id != null &&
      !scope.stageIds.includes(st.stage_id)
    ) {
      return json({ error: "stage_out_of_scope" }, 403);
    }

    const cur = await env.DB.prepare(
      `SELECT notice_count, escalation_level FROM student_disciplinary_state WHERE student_id = ?`,
    )
      .bind(studentId)
      .first<{ notice_count: number; escalation_level: string }>();

    const count = Number(cur?.notice_count ?? 0) + 1;
    let level: "notice" | "alert" | "summons" = "notice";
    let escalation = "notice_1";
    if (count === 2) {
      level = "alert";
      escalation = "notice_2";
    } else if (count >= 3) {
      level = "summons";
      escalation = "summons";
    }

    await env.DB.prepare(
      `INSERT INTO violations (student_id, level, description, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(studentId, level, body.description?.trim() ?? null, gs.userId)
      .run();

    await env.DB.prepare(
      `INSERT INTO student_disciplinary_state (student_id, notice_count, escalation_level, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET
         notice_count = excluded.notice_count,
         escalation_level = excluded.escalation_level,
         updated_at = datetime('now')`,
    )
      .bind(studentId, count, escalation)
      .run();

    return json({ ok: true, notice_count: count, escalation_level: escalation, level });
  }

  const actionMatch = path.match(
    /^\/api\/general-supervisor\/disciplinary\/(\d+)\/action$/,
  );
  if (request.method === "POST" && actionMatch) {
    const studentId = Number(actionMatch[1]);
    let body: { action?: string; note?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const action = body.action;
    if (
      !["archive_pledge", "suspend", "dismiss", "transfer"].includes(action ?? "")
    ) {
      return json({ error: "invalid_action" }, 400);
    }

    if (action === "archive_pledge") {
      await env.DB.prepare(
        `INSERT INTO student_disciplinary_state (student_id, pledge_archived, updated_at)
         VALUES (?, 1, datetime('now'))
         ON CONFLICT(student_id) DO UPDATE SET pledge_archived = 1, updated_at = datetime('now')`,
      )
        .bind(studentId)
        .run();
      await env.DB.prepare(
        `INSERT INTO violations (student_id, level, description, final_action, created_by_user_id)
         VALUES (?, 'notice', ?, 'archive', ?)`,
      )
        .bind(studentId, body.note ?? "أرشفة التعهد", gs.userId)
        .run();
    } else if (action === "suspend") {
      await env.DB.prepare(
        `UPDATE students SET account_status = 'suspended' WHERE id = ? AND complex_id = ?`,
      )
        .bind(studentId, gs.complexId)
        .run();
      await env.DB.prepare(
        `INSERT INTO violations (student_id, level, description, final_action, created_by_user_id)
         VALUES (?, 'summons', ?, 'suspension', ?)`,
      )
        .bind(studentId, body.note ?? "تعليق مؤقت", gs.userId)
        .run();
    } else if (action === "dismiss") {
      await env.DB.prepare(
        `UPDATE students SET is_active = 0, account_status = 'dismissed' WHERE id = ? AND complex_id = ?`,
      )
        .bind(studentId, gs.complexId)
        .run();
      await env.DB.prepare(
        `INSERT INTO violations (student_id, level, description, final_action, created_by_user_id)
         VALUES (?, 'summons', ?, 'dismissal', ?)`,
      )
        .bind(studentId, body.note ?? "فصل الطالب", gs.userId)
        .run();
    } else if (action === "transfer") {
      await env.DB.prepare(
        `INSERT INTO violations (student_id, level, description, final_action, created_by_user_id)
         VALUES (?, 'summons', ?, NULL, ?)`,
      )
        .bind(studentId, body.note ?? "نقل الطالب — يُكمل عبر نقل تراكمي", gs.userId)
        .run();
    }

    return json({ ok: true, action });
  }

  if (request.method === "GET" && path === "/api/general-supervisor/dashboard") {
    const today = todayIso();
    const stageWhere = stageFilterWhere(scope, "s.stage_id");
    const stageBinds = stageFilterBinds(scope);

    const activeStudents = await env.DB.prepare(
      `SELECT COUNT(DISTINCT h.student_id) AS c
       FROM student_circle_history h
       JOIN students s ON s.id = h.student_id
       WHERE h.to_at IS NULL AND h.frozen_at IS NULL AND s.complex_id = ?
         AND (${stageWhere} OR s.stage_id IS NULL)`,
    )
      .bind(gs.complexId, ...stageBinds)
      .first<{ c: number }>();

    const presentToday = await env.DB.prepare(
      `SELECT COUNT(DISTINCT tdm.student_id) AS c
       FROM teacher_daily_marks tdm
       JOIN students s ON s.id = tdm.student_id
       WHERE tdm.mark_date = ? AND tdm.attendance_auto = 1 AND s.complex_id = ?
         AND (${stageWhere} OR s.stage_id IS NULL)`,
    )
      .bind(today, gs.complexId, ...stageBinds)
      .first<{ c: number }>();

    const settings = await env.DB.prepare(
      `SELECT graduates_count, huffadh_count FROM complex_settings WHERE complex_id = ?`,
    )
      .bind(gs.complexId)
      .first<{ graduates_count: number; huffadh_count: number }>();

    const pendingApps = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM student_applications
       WHERE complex_id = ? AND status = 'pending' AND ${stageFilterWhere(scope, "stage_id")}`,
    )
      .bind(gs.complexId, ...stageBinds)
      .first<{ c: number }>();

    const pendingPlacement = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students
       WHERE complex_id = ? AND admission_status = 'pending_placement'
         AND (${stageWhere} OR stage_id IS NULL)`,
    )
      .bind(gs.complexId, ...stageBinds)
      .first<{ c: number }>();

    const total = Number(activeStudents?.c ?? 0);
    const present = Number(presentToday?.c ?? 0);

    return json({
      today,
      kpis: {
        active_students: total,
        present_today: present,
        attendance_rate_today:
          total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
        graduates_count: settings?.graduates_count ?? 0,
        huffadh_count: settings?.huffadh_count ?? 0,
        pending_applications: Number(pendingApps?.c ?? 0),
        pending_placement: Number(pendingPlacement?.c ?? 0),
      },
    });
  }

  if (
    request.method === "GET" &&
    path === "/api/general-supervisor/student-attendance/today"
  ) {
    const date = url.searchParams.get("date")?.trim() || todayIso();
    const scopeWhere = studentsInScopeWhere(scope);
    const binds = [date, gs.complexId, ...studentsInScopeBinds(gs.complexId, scope)];

    const rows = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar, s.stage_id,
              c.name_ar AS circle_name,
              COALESCE(sda.status, 'present') AS status,
              sda.recorded_at,
              sda.source
       FROM students s
       LEFT JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       LEFT JOIN circles c ON c.id = h.circle_id
       LEFT JOIN student_daily_attendance sda
         ON sda.student_id = s.id AND sda.attendance_date = ?
       WHERE ${scopeWhere}
       ORDER BY c.name_ar, s.full_name_ar`,
    )
      .bind(...binds)
      .all<{
        student_id: number;
        full_name_ar: string;
        stage_id: number | null;
        circle_name: string | null;
        status: string;
        recorded_at: string | null;
        source: string | null;
      }>();

    return json({
      date,
      items: rows.results ?? [],
      default_status: "present",
      scope,
    });
  }

  if (
    request.method === "POST" &&
    path === "/api/general-supervisor/student-attendance/init-today"
  ) {
    const date = todayIso();
    const scopeWhere = studentsInScopeWhere(scope);
    const students = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere}`,
    )
      .bind(...studentsInScopeBinds(gs.complexId, scope))
      .all<{ id: number }>();

    for (const row of students.results ?? []) {
      await env.DB.prepare(
        `INSERT INTO student_daily_attendance
         (complex_id, student_id, attendance_date, status, source, recorded_by_user_id)
         VALUES (?, ?, ?, 'present', 'general_supervisor', ?)
         ON CONFLICT(student_id, attendance_date) DO NOTHING`,
      )
        .bind(gs.complexId, row.id, date, gs.userId)
        .run();
    }

    return json({ ok: true, date, count: students.results?.length ?? 0 });
  }

  if (
    request.method === "POST" &&
    path === "/api/general-supervisor/student-attendance/upsert"
  ) {
    let body: {
      student_id?: number;
      status?: string;
      attendance_date?: string;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    if (!Number.isFinite(studentId)) return json({ error: "student_id_required" }, 400);
    const status = body.status ?? "present";
    if (!["present", "absent", "excused"].includes(status)) {
      return json({ error: "invalid_status" }, 400);
    }
    const date = body.attendance_date?.trim() || todayIso();
    const scopeWhere = studentsInScopeWhere(scope);

    const allowed = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ?`,
    )
      .bind(...studentsInScopeBinds(gs.complexId, scope), studentId)
      .first();

    if (!allowed) return json({ error: "student_out_of_scope" }, 403);

    await env.DB.prepare(
      `INSERT INTO student_daily_attendance
       (complex_id, student_id, attendance_date, status, source, recorded_by_user_id, notes)
       VALUES (?, ?, ?, ?, 'general_supervisor', ?, ?)
       ON CONFLICT(student_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         source = 'general_supervisor',
         recorded_by_user_id = excluded.recorded_by_user_id,
         notes = excluded.notes,
         recorded_at = datetime('now')`,
    )
      .bind(
        gs.complexId,
        studentId,
        date,
        status,
        gs.userId,
        body.notes?.trim() ?? null,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO student_attendance_log
       (student_id, attendance_date, status, source, recorded_by_user_id, notes)
       VALUES (?, ?, ?, 'general_supervisor', ?, ?)`,
    )
      .bind(studentId, date, status, gs.userId, body.notes?.trim() ?? null)
      .run();

    return json({ ok: true, student_id: studentId, status, attendance_date: date });
  }

  if (request.method === "GET" && path === "/api/general-supervisor/tv-launch") {
    const session = await env.DB.prepare(
      `SELECT id, tv_launch_key, name_ar, session_date, status
       FROM yom_himma_sessions
       WHERE complex_id = ? AND status IN ('active', 'draft')
       ORDER BY session_date DESC LIMIT 1`,
    )
      .bind(gs.complexId)
      .first<{
        id: number;
        tv_launch_key: string;
        name_ar: string;
        session_date: string;
        status: string;
      }>();

    return json({
      session: session ?? null,
      fallback_url: "/tv-live",
    });
  }

  return json({ error: "Not Found", path }, 404);
}
