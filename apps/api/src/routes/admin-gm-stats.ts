import type { Env } from "../types";
import { todayRiyadhIso, addDaysIso } from "../lib/today-riyadh-iso";
import { fetchHimmaAuditFromLedger } from "../lib/himma-ledger-view";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { tableHasColumn } from "../lib/db-schema";
import { fetchSemesterPeriod, semesterQueryRange } from "../lib/semester-period";
import { persistSemesterHistoricalSnapshot } from "../lib/semester-snapshot";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function periodStart(period: string): string {
  const today = todayRiyadhIso();
  if (period === "today") return today;
  if (period === "week") return addDaysIso(today, -6);
  if (period === "month") return addDaysIso(today, -29);
  return addDaysIso(today, -119);
}

export async function handleAdminStats(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  const period = url.searchParams.get("period") ?? "semester";
  let fromDate = periodStart(period);
  let today = todayRiyadhIso();
  if (period === "semester") {
    const sp = await fetchSemesterPeriod(env, auth.complexId);
    const range = semesterQueryRange(sp);
    fromDate = range.start;
    today = range.end;
  }

  const activeStudents = await env.DB.prepare(
    `SELECT COUNT(DISTINCT student_id) AS c
     FROM student_circle_history WHERE to_at IS NULL AND frozen_at IS NULL`,
  ).first<{ c: number }>();

  const presentToday = await env.DB.prepare(
    `SELECT COUNT(DISTINCT tdm.student_id) AS c
     FROM teacher_daily_marks tdm
     JOIN students s ON s.id = tdm.student_id
     WHERE tdm.mark_date = ? AND tdm.attendance_auto = 1 AND s.complex_id = ?`,
  )
    .bind(today, auth.complexId)
    .first<{ c: number }>();

  const presentPeriod = await env.DB.prepare(
    `SELECT COUNT(*) AS c
     FROM teacher_daily_marks tdm
     JOIN students s ON s.id = tdm.student_id
     WHERE tdm.mark_date >= ? AND tdm.attendance_auto = 1 AND s.complex_id = ?`,
  )
    .bind(fromDate, auth.complexId)
    .first<{ c: number }>();

  const teachers = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM users
     WHERE complex_id = ? AND role = 'teacher' AND is_active = 1`,
  )
    .bind(auth.complexId)
    .first<{ c: number }>();

  const supervisors = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM users
     WHERE complex_id = ? AND role IN ('edu_supervisor','programs_supervisor','prog_supervisor','admin_supervisor', 'general_supervisor') AND is_active = 1`,
  )
    .bind(auth.complexId)
    .first<{ c: number }>();

  const staffPresentToday = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM staff_attendance
     WHERE complex_id = ? AND attendance_date = ? AND status = 'present'`,
  )
    .bind(auth.complexId, today)
    .first<{ c: number }>();

  const byCircle = await env.DB.prepare(
    `SELECT c.id, c.name_ar,
            (SELECT COUNT(DISTINCT h.student_id) FROM student_circle_history h
             WHERE h.circle_id = c.id AND h.to_at IS NULL AND h.frozen_at IS NULL) AS enrolled,
            (SELECT COUNT(DISTINCT tdm.student_id) FROM teacher_daily_marks tdm
             JOIN student_circle_history h ON h.student_id = tdm.student_id AND h.circle_id = c.id
               AND h.to_at IS NULL AND h.frozen_at IS NULL
             WHERE tdm.mark_date = ? AND tdm.attendance_auto = 1) AS present_today
     FROM circles c
     WHERE c.complex_id = ? AND c.is_active = 1
     ORDER BY c.name_ar`,
  )
    .bind(today, auth.complexId)
    .all<{
      id: number;
      name_ar: string;
      enrolled: number;
      present_today: number;
    }>();

  const autoTodayList = await env.DB.prepare(
    `SELECT s.full_name_ar, c.name_ar AS circle_name, tdm.logged_at
     FROM teacher_daily_marks tdm
     JOIN students s ON s.id = tdm.student_id
     LEFT JOIN student_circle_history h ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     LEFT JOIN circles c ON c.id = h.circle_id
     WHERE tdm.mark_date = ? AND tdm.attendance_auto = 1 AND s.complex_id = ?
     ORDER BY tdm.logged_at DESC LIMIT 30`,
  )
    .bind(today, auth.complexId)
    .all();

  const totalStudents = Number(activeStudents?.c ?? 0);
  const presentTodayCount = Number(presentToday?.c ?? 0);
  const rateToday =
    totalStudents > 0
      ? Math.round((presentTodayCount / totalStudents) * 1000) / 10
      : 0;

  return json({
    period,
    from_date: fromDate,
    today,
    kpis: {
      active_students: totalStudents,
      present_today: presentTodayCount,
      attendance_rate_today: rateToday,
      attendance_records_period: Number(presentPeriod?.c ?? 0),
      active_teachers: Number(teachers?.c ?? 0),
      active_supervisors: Number(supervisors?.c ?? 0),
      staff_present_today: Number(staffPresentToday?.c ?? 0),
    },
    by_circle: byCircle.results ?? [],
    auto_attendance_today: autoTodayList.results ?? [],
  });
}

export async function handleAdminYomHimmaSummary(
  _request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(_request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  const sessions = await env.DB.prepare(
    `SELECT id, name_ar, session_date, status
     FROM yom_himma_sessions WHERE complex_id = ?
     ORDER BY session_date DESC LIMIT 10`,
  )
    .bind(auth.complexId)
    .all<{ id: number; name_ar: string; session_date: string; status: string }>();

  const items = [];
  for (const s of sessions.results ?? []) {
    const stats = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN attendance = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(juz_done) AS juz_total,
              SUM(hizb_done) AS hizb_total
       FROM yom_himma_audit WHERE session_id = ?`,
    )
      .bind(s.id)
      .first<{
        total: number;
        present: number;
        juz_total: number;
        hizb_total: number;
      }>();
    items.push({
      session: s,
      stats: stats ?? { total: 0, present: 0, juz_total: 0, hizb_total: 0 },
    });
  }

  return json({ items });
}

export async function handleAdminStaffAttendanceList(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  const from = url.searchParams.get("from") ?? todayRiyadhIso();
  const to = url.searchParams.get("to") ?? from;

  const rows = await env.DB.prepare(
    `SELECT sa.id, sa.user_id, sa.attendance_date, sa.status, sa.notes,
            u.full_name_ar, u.role
     FROM staff_attendance sa
     JOIN users u ON u.id = sa.user_id
     WHERE sa.complex_id = ? AND sa.attendance_date >= ? AND sa.attendance_date <= ?
     ORDER BY sa.attendance_date DESC, u.full_name_ar`,
  )
    .bind(auth.complexId, from, to)
    .all();

  return json({ items: rows.results ?? [], from, to });
}

export async function handleAdminStaffAttendanceUpsert(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  let body: {
    user_id?: number;
    attendance_date?: string;
    status?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const userId = Number(body.user_id);
  if (!Number.isFinite(userId)) return json({ error: "user_id_required" }, 400);

  const date = body.attendance_date?.trim() || todayRiyadhIso();
  const status = body.status ?? "present";
  if (!["present", "absent", "late", "leave", "excused"].includes(status)) {
    return json({ error: "invalid_status" }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO staff_attendance (complex_id, user_id, attendance_date, status, notes, recorded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, attendance_date) DO UPDATE SET
       status = excluded.status,
       notes = excluded.notes,
       recorded_by_user_id = excluded.recorded_by_user_id,
       recorded_at = datetime('now')`,
  )
    .bind(auth.complexId, userId, date, status, body.notes?.trim() ?? null, auth.userId)
    .run();

  return json({ ok: true });
}

export async function handleAdminComplexSettingsGet(
  _request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(_request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  const row = await env.DB.prepare(
    `SELECT semester_weeks, school_days_json, graduates_count, huffadh_count
     FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(auth.complexId)
    .first<{
      semester_weeks: number;
      school_days_json: string;
      graduates_count: number;
      huffadh_count: number;
    }>();

  let schoolDays: number[] = [0, 1, 2, 3, 4];
  try {
    schoolDays = JSON.parse(row?.school_days_json ?? "[0,1,2,3,4]");
  } catch {
    /* default */
  }

  const hasSemesterCols = await tableHasColumn(env, "complex_settings", "semester_active");
  const semester = hasSemesterCols
    ? await fetchSemesterPeriod(env, auth!.complexId)
    : { active: false, start_date: null, end_date: null };

  return json({
    semester_weeks: row?.semester_weeks ?? 16,
    school_days: schoolDays,
    graduates_count: row?.graduates_count ?? 0,
    huffadh_count: row?.huffadh_count ?? 0,
    semester_active: semester.active,
    semester_start_date: semester.start_date,
    semester_end_date: semester.end_date,
  });
}

const SEMESTER_END_CONFIRM = "إنهاء الفصل";

export async function handleSemesterStart(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);
  if (!(await tableHasColumn(env, "complex_settings", "semester_active"))) {
    return json({ error: "migration_required", migration: "044_semester_period" }, 503);
  }

  const period = await fetchSemesterPeriod(env, auth.complexId);
  if (period.active) {
    return json({ error: "semester_already_active" }, 409);
  }

  const today = todayRiyadhIso();
  await env.DB.prepare(
    `UPDATE complex_settings
     SET semester_active = 1, semester_start_date = ?, semester_end_date = NULL, updated_at = datetime('now')
     WHERE complex_id = ?`,
  )
    .bind(today, auth.complexId)
    .run();

  return json({ ok: true, semester_start_date: today, semester_active: true });
}

export async function handleSemesterEnd(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);
  if (!(await tableHasColumn(env, "complex_settings", "semester_active"))) {
    return json({ error: "migration_required", migration: "044_semester_period" }, 503);
  }

  let body: { confirm_text?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (body.confirm_text?.trim() !== SEMESTER_END_CONFIRM) {
    return json(
      {
        error: "confirm_required",
        message: `اكتب «${SEMESTER_END_CONFIRM}» للتأكيد`,
      },
      400,
    );
  }

  const period = await fetchSemesterPeriod(env, auth.complexId);
  if (!period.active) {
    return json({ error: "no_active_semester" }, 409);
  }

  const startDate = period.start_date ?? todayRiyadhIso();
  const today = todayRiyadhIso();

  const snapshotId = await persistSemesterHistoricalSnapshot(
    env,
    auth.complexId,
    auth.userId,
    startDate,
    today,
  );

  await env.DB.prepare(
    `UPDATE complex_settings
     SET semester_active = 0, semester_end_date = ?, updated_at = datetime('now')
     WHERE complex_id = ?`,
  )
    .bind(today, auth.complexId)
    .run();

  return json({
    ok: true,
    semester_end_date: today,
    semester_active: false,
    snapshot_id: snapshotId,
  });
}

export async function handleAdminComplexSettingsPatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["super_admin"])) return json({ error: "forbidden" }, 403);

  let body: {
    semester_weeks?: number;
    school_days?: number[];
    graduates_count?: number;
    huffadh_count?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const cur = await env.DB.prepare(
    `SELECT semester_weeks, school_days_json, graduates_count, huffadh_count, display_mode, display_slides_json
     FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(auth.complexId)
    .first<{
      semester_weeks: number;
      school_days_json: string;
      graduates_count: number;
      huffadh_count: number;
      display_mode: string;
      display_slides_json: string | null;
    }>();

  const weeks = body.semester_weeks ?? cur?.semester_weeks ?? 16;
  const daysJson = body.school_days
    ? JSON.stringify(body.school_days)
    : cur?.school_days_json ?? "[0,1,2,3,4]";
  const graduates = body.graduates_count ?? cur?.graduates_count ?? 0;
  const huffadh = body.huffadh_count ?? cur?.huffadh_count ?? 0;

  await env.DB.prepare(
    `INSERT INTO complex_settings
     (complex_id, graduates_count, huffadh_count, display_slides_json, display_mode, semester_weeks, school_days_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(complex_id) DO UPDATE SET
       semester_weeks = excluded.semester_weeks,
       school_days_json = excluded.school_days_json,
       graduates_count = excluded.graduates_count,
       huffadh_count = excluded.huffadh_count,
       updated_at = datetime('now')`,
  )
    .bind(
      auth.complexId,
      graduates,
      huffadh,
      cur?.display_slides_json ?? "[]",
      cur?.display_mode ?? "carousel",
      weeks,
      daysJson,
    )
    .run();

  return json({ ok: true });
}
