import type { Env } from "../types";
import {
  authUnauthorizedResponse,
  getAuth,
  requireAuth,
  requireRoles,
} from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { randomMagicToken } from "../lib/magic-link";

const EDU_SUPERVISOR_ROLES = ["edu_supervisor", "super_admin"] as const;
const EXCLUDED_STAGE_TALQEEN = 1;
const ALLOWED_STAGES = [2, 3, 4];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function migrationRequired(): Response {
  return json({ error: "migration_required", migration: "028_quranic_day_refactor" }, 503);
}

export type DeductionRules = {
  mistake_penalty: number;
  alert_penalty: number;
  lahn_penalty: number;
};

export function parseDeductionRules(raw: string | null | undefined): DeductionRules {
  try {
    const o = JSON.parse(raw ?? "{}") as Record<string, number>;
    return {
      mistake_penalty: Number(o.mistake_penalty ?? 1),
      alert_penalty: Number(o.alert_penalty ?? 0.5),
      lahn_penalty: Number(o.lahn_penalty ?? 0.5),
    };
  } catch {
    return { mistake_penalty: 1, alert_penalty: 0.5, lahn_penalty: 0.5 };
  }
}

export function stringifyDeductionRules(rules: Partial<DeductionRules>): string {
  return JSON.stringify({
    mistake_penalty: Number(rules.mistake_penalty ?? 1),
    alert_penalty: Number(rules.alert_penalty ?? 0.5),
    lahn_penalty: Number(rules.lahn_penalty ?? 0.5),
  });
}

export function parseTargetHizbs(raw: string | null | undefined): number[] {
  try {
    const arr = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 60)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function hizbsFromRange(from: number, to: number): number[] {
  const a = Math.max(1, Math.min(from, to));
  const b = Math.min(60, Math.max(from, to));
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

async function loadDayByToken(env: Env, token: string) {
  const hasFail = await tableHasColumn(env, "quranic_days", "fail_threshold");
  const hasTime = await tableHasColumn(env, "quranic_days", "hizb_time_limit");
  if (!hasFail || !hasTime) return { error: migrationRequired() as Response };

  const day = await env.DB.prepare(
    `SELECT id, complex_id, name_ar, event_date, deduction_rules, is_active,
            fail_threshold, hizb_time_limit
     FROM quranic_days WHERE magic_token = ? LIMIT 1`,
  )
    .bind(token)
    .first<{
      id: number;
      complex_id: number;
      name_ar: string;
      event_date: string;
      deduction_rules: string;
      is_active: number;
      fail_threshold: number;
      hizb_time_limit: number;
    }>();

  if (!day) return { error: json({ error: "invalid_token" }, 404) };
  if (day.is_active !== 1) return { error: json({ error: "link_inactive" }, 403) };
  return { day };
}

function dayPayload(day: {
  id: number;
  name_ar: string;
  event_date: string;
  deduction_rules: string;
  fail_threshold: number;
  hizb_time_limit: number;
}) {
  return {
    id: day.id,
    name_ar: day.name_ar,
    event_date: day.event_date,
    deduction_rules: parseDeductionRules(day.deduction_rules),
    fail_threshold: day.fail_threshold,
    hizb_time_limit: day.hizb_time_limit,
  };
}

async function assertDayInComplex(
  env: Env,
  dayId: number,
  complexId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM quranic_days WHERE id = ? AND complex_id = ?`,
  )
    .bind(dayId, complexId)
    .first();
  return Boolean(row);
}

async function completedHizbsForStudent(
  env: Env,
  dayId: number,
  studentId: number,
): Promise<number[]> {
  if (!(await hasTable(env, "quranic_day_records"))) return [];
  const rows = await env.DB.prepare(
    `SELECT hizb_number FROM quranic_day_records
     WHERE quranic_day_id = ? AND student_id = ?
     ORDER BY hizb_number`,
  )
    .bind(dayId, studentId)
    .all<{ hizb_number: number }>();
  return (rows.results ?? []).map((r) => r.hizb_number);
}

async function studentSessionSummary(
  env: Env,
  dayId: number,
  studentId: number,
  failThreshold: number,
) {
  const agg = await env.DB.prepare(
    `SELECT COUNT(*) AS hizbs_read,
            COALESCE(SUM(mistakes), 0) AS total_mistakes,
            COALESCE(SUM(alerts), 0) AS total_alerts,
            COALESCE(SUM(lahn_count), 0) AS total_lahn,
            COALESCE(MAX(mistakes), 0) AS max_mistakes
     FROM quranic_day_records
     WHERE quranic_day_id = ? AND student_id = ?`,
  )
    .bind(dayId, studentId)
    .first<{
      hizbs_read: number;
      total_mistakes: number;
      total_alerts: number;
      total_lahn: number;
      max_mistakes: number;
    }>();

  const hizbsRead = Number(agg?.hizbs_read ?? 0);
  const maxMistakes = Number(agg?.max_mistakes ?? 0);
  const failed = hizbsRead > 0 && maxMistakes >= failThreshold;

  return {
    hizbs_read: hizbsRead,
    total_mistakes: Number(agg?.total_mistakes ?? 0),
    total_alerts: Number(agg?.total_alerts ?? 0),
    total_lahn: Number(agg?.total_lahn ?? 0),
    status: failed ? ("failed" as const) : hizbsRead > 0 ? ("passed" as const) : ("none" as const),
  };
}

/** Public reciter API — no auth */
export async function handlePublicQuranicDayRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  if (!(await hasTable(env, "quranic_days"))) return null;

  const tokenMatch = url.pathname.match(/^\/api\/public\/quranic-day\/([^/]+)$/);
  if (tokenMatch && request.method === "GET") {
    const token = decodeURIComponent(tokenMatch[1]);
    const loaded = await loadDayByToken(env, token);
    if ("error" in loaded && loaded.error) return loaded.error;
    return json({ token, day: dayPayload(loaded.day!) });
  }

  const searchMatch = url.pathname.match(
    /^\/api\/public\/quranic-day\/([^/]+)\/students\/search$/,
  );
  if (searchMatch && request.method === "GET") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const token = decodeURIComponent(searchMatch[1]);
    const loaded = await loadDayByToken(env, token);
    if ("error" in loaded && loaded.error) return loaded.error;
    const day = loaded.day!;

    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) return json({ items: [] });

    const rows = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar, qds.target_hizbs
       FROM quranic_day_students qds
       INNER JOIN students s ON s.id = qds.student_id
       WHERE qds.quranic_day_id = ? AND s.is_active = 1 AND s.full_name_ar LIKE ?
       ORDER BY s.full_name_ar
       LIMIT 15`,
    )
      .bind(day.id, `%${q}%`)
      .all<{ student_id: number; full_name_ar: string; target_hizbs: string }>();

    const items = (rows.results ?? []).map((r) => ({
      student_id: r.student_id,
      full_name_ar: r.full_name_ar,
      target_hizbs: parseTargetHizbs(r.target_hizbs),
    }));
    return json({ items });
  }

  const summaryMatch = url.pathname.match(
    /^\/api\/public\/quranic-day\/([^/]+)\/students\/(\d+)\/summary$/,
  );
  if (summaryMatch && request.method === "GET") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const token = decodeURIComponent(summaryMatch[1]);
    const studentId = Number(summaryMatch[2]);
    const loaded = await loadDayByToken(env, token);
    if ("error" in loaded && loaded.error) return loaded.error;
    const day = loaded.day!;

    const row = await env.DB.prepare(
      `SELECT s.full_name_ar FROM quranic_day_students qds
       INNER JOIN students s ON s.id = qds.student_id
       WHERE qds.quranic_day_id = ? AND qds.student_id = ?`,
    )
      .bind(day.id, studentId)
      .first<{ full_name_ar: string }>();
    if (!row) return json({ error: "student_not_enrolled" }, 404);

    const summary = await studentSessionSummary(
      env,
      day.id,
      studentId,
      day.fail_threshold,
    );
    return json({
      student_name: row.full_name_ar,
      fail_threshold: day.fail_threshold,
      ...summary,
    });
  }

  const studentMatch = url.pathname.match(
    /^\/api\/public\/quranic-day\/([^/]+)\/students\/(\d+)$/,
  );
  if (studentMatch && request.method === "GET") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const token = decodeURIComponent(studentMatch[1]);
    const studentId = Number(studentMatch[2]);
    const loaded = await loadDayByToken(env, token);
    if ("error" in loaded && loaded.error) return loaded.error;
    const day = loaded.day!;

    const row = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar, qds.target_hizbs
       FROM quranic_day_students qds
       INNER JOIN students s ON s.id = qds.student_id
       WHERE qds.quranic_day_id = ? AND qds.student_id = ? AND s.is_active = 1`,
    )
      .bind(day.id, studentId)
      .first<{ student_id: number; full_name_ar: string; target_hizbs: string }>();

    if (!row) return json({ error: "student_not_enrolled" }, 404);

    const completed = await completedHizbsForStudent(env, day.id, studentId);

    return json({
      student: {
        student_id: row.student_id,
        full_name_ar: row.full_name_ar,
        target_hizbs: parseTargetHizbs(row.target_hizbs),
        completed_hizbs: completed,
      },
      day: dayPayload(day),
    });
  }

  const recordMatch = url.pathname.match(/^\/api\/public\/quranic-day\/([^/]+)\/records$/);
  if (recordMatch && request.method === "POST") {
    if (!(await hasTable(env, "quranic_day_records"))) return migrationRequired();
    const token = decodeURIComponent(recordMatch[1]);
    const loaded = await loadDayByToken(env, token);
    if ("error" in loaded && loaded.error) return loaded.error;
    const day = loaded.day!;

    let body: {
      student_id?: number;
      hizb_number?: number;
      mistakes?: number;
      alerts?: number;
      lahn_count?: number;
      time_taken_seconds?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    const hizb = Number(body.hizb_number);
    const mistakes = Math.max(0, Math.floor(Number(body.mistakes ?? 0)));
    const alerts = Math.max(0, Math.floor(Number(body.alerts ?? 0)));
    const lahn = Math.max(0, Math.floor(Number(body.lahn_count ?? 0)));
    const timeSec = Math.max(0, Math.floor(Number(body.time_taken_seconds ?? 0)));

    if (!Number.isFinite(studentId) || studentId <= 0) {
      return json({ error: "student_id_required" }, 400);
    }
    if (!Number.isFinite(hizb) || hizb <= 0) {
      return json({ error: "hizb_number_required" }, 400);
    }

    const enrolled = await env.DB.prepare(
      `SELECT target_hizbs FROM quranic_day_students
       WHERE quranic_day_id = ? AND student_id = ?`,
    )
      .bind(day.id, studentId)
      .first<{ target_hizbs: string }>();

    if (!enrolled) return json({ error: "student_not_enrolled" }, 404);

    const allowed = parseTargetHizbs(enrolled.target_hizbs);
    if (!allowed.includes(hizb)) {
      return json({ error: "hizb_not_in_scope" }, 400);
    }

    const hasLahn = await tableHasColumn(env, "quranic_day_records", "lahn_count");
    if (hasLahn) {
      await env.DB.prepare(
        `INSERT INTO quranic_day_records
          (quranic_day_id, student_id, hizb_number, mistakes, alerts, lahn_count, time_taken_seconds, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(quranic_day_id, student_id, hizb_number) DO UPDATE SET
           mistakes = excluded.mistakes,
           alerts = excluded.alerts,
           lahn_count = excluded.lahn_count,
           time_taken_seconds = excluded.time_taken_seconds,
           recorded_at = datetime('now')`,
      )
        .bind(day.id, studentId, hizb, mistakes, alerts, lahn, timeSec)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO quranic_day_records (quranic_day_id, student_id, hizb_number, mistakes, alerts, recorded_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(quranic_day_id, student_id, hizb_number) DO UPDATE SET
           mistakes = excluded.mistakes,
           alerts = excluded.alerts,
           recorded_at = datetime('now')`,
      )
        .bind(day.id, studentId, hizb, mistakes, alerts)
        .run();
    }

    const completed = await completedHizbsForStudent(env, day.id, studentId);

    return json({
      ok: true,
      fail_threshold_exceeded: mistakes >= day.fail_threshold,
      completed_hizbs: completed,
    });
  }

  return null;
}

/** Supervisor + legacy single-path POST on token root — removed from GET students list */
export async function handleEduQuranicDaysRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-dept/quranic-days")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return authUnauthorizedResponse(request);
  if (!requireRoles(auth, [...EDU_SUPERVISOR_ROLES])) {
    return json({ error: "forbidden" }, 403);
  }
  if (!(await hasTable(env, "quranic_days"))) return migrationRequired();

  const hasMega = await tableHasColumn(env, "quranic_days", "fail_threshold");

  if (path === "/api/edu-dept/quranic-days" && request.method === "GET") {
    const selectCols = hasMega
      ? `id, name_ar, event_date, deduction_rules, magic_token, is_active, created_at,
         fail_threshold, hizb_time_limit`
      : `id, name_ar, event_date, deduction_rules, magic_token, is_active, created_at`;
    const rows = await env.DB.prepare(
      `SELECT ${selectCols} FROM quranic_days WHERE complex_id = ? ORDER BY event_date DESC, id DESC`,
    )
      .bind(auth.complexId)
      .all();

    const items = (rows.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name_ar: r.name_ar,
      event_date: r.event_date,
      deduction_rules: parseDeductionRules(r.deduction_rules as string),
      fail_threshold: hasMega ? Number(r.fail_threshold ?? 3) : 3,
      hizb_time_limit: hasMega ? Number(r.hizb_time_limit ?? 10) : 10,
      has_magic_link: Boolean(r.magic_token),
      is_active: r.is_active,
      created_at: r.created_at,
    }));
    return json({ items });
  }

  if (path === "/api/edu-dept/quranic-days" && request.method === "POST") {
    let body: {
      name_ar?: string;
      event_date?: string;
      mistake_penalty?: number;
      alert_penalty?: number;
      lahn_penalty?: number;
      fail_threshold?: number;
      hizb_time_limit?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const name = String(body.name_ar ?? "").trim();
    const eventDate = String(body.event_date ?? todayIso()).slice(0, 10);
    if (!name) return json({ error: "name_required" }, 400);

    const rules = stringifyDeductionRules({
      mistake_penalty: body.mistake_penalty,
      alert_penalty: body.alert_penalty,
      lahn_penalty: body.lahn_penalty,
    });
    const failTh = Math.max(1, Math.floor(Number(body.fail_threshold ?? 3)));
    const timeLim = Math.max(1, Math.floor(Number(body.hizb_time_limit ?? 10)));

    if (hasMega) {
      const ins = await env.DB.prepare(
        `INSERT INTO quranic_days
          (complex_id, name_ar, event_date, deduction_rules, fail_threshold, hizb_time_limit, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(auth.complexId, name, eventDate, rules, failTh, timeLim, auth.userId)
        .run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }

    const ins = await env.DB.prepare(
      `INSERT INTO quranic_days (complex_id, name_ar, event_date, deduction_rules, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(auth.complexId, name, eventDate, rules, auth.userId)
      .run();
    return json({ ok: true, id: ins.meta.last_row_id });
  }

  const magicMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)\/magic-link$/);
  if (magicMatch && request.method === "POST") {
    const dayId = Number(magicMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    const row = await env.DB.prepare(
      `SELECT id, magic_token FROM quranic_days WHERE id = ?`,
    )
      .bind(dayId)
      .first<{ id: number; magic_token: string | null }>();

    let token = row?.magic_token;
    if (!token) {
      token = randomMagicToken();
      await env.DB.prepare(`UPDATE quranic_days SET magic_token = ? WHERE id = ?`)
        .bind(token, dayId)
        .run();
    }
    const publicPath = `/public/quranic-day/${token}`;
    return json({
      ok: true,
      token,
      public_path: publicPath,
      api_get: `/api/public/quranic-day/${token}`,
    });
  }

  const deleteMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const dayId = Number(deleteMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    await env.DB.prepare(`DELETE FROM quranic_days WHERE id = ?`).bind(dayId).run();
    return json({ ok: true });
  }

  const patchMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)$/);
  if (patchMatch && request.method === "PATCH") {
    const dayId = Number(patchMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    let body: {
      name_ar?: string;
      event_date?: string;
      is_active?: number;
      mistake_penalty?: number;
      alert_penalty?: number;
      lahn_penalty?: number;
      fail_threshold?: number;
      hizb_time_limit?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const existing = await env.DB.prepare(
      `SELECT name_ar, event_date, deduction_rules, is_active, fail_threshold, hizb_time_limit
       FROM quranic_days WHERE id = ?`,
    )
      .bind(dayId)
      .first<{
        name_ar: string;
        event_date: string;
        deduction_rules: string;
        is_active: number;
        fail_threshold: number;
        hizb_time_limit: number;
      }>();
    if (!existing) return json({ error: "not_found" }, 404);

    const rules = parseDeductionRules(existing.deduction_rules);
    if (body.mistake_penalty != null) rules.mistake_penalty = Number(body.mistake_penalty);
    if (body.alert_penalty != null) rules.alert_penalty = Number(body.alert_penalty);
    if (body.lahn_penalty != null) rules.lahn_penalty = Number(body.lahn_penalty);

    const name = body.name_ar?.trim() || existing.name_ar;
    const eventDate = body.event_date?.slice(0, 10) || existing.event_date;
    const isActive =
      body.is_active != null ? (body.is_active ? 1 : 0) : existing.is_active;
    const failTh =
      body.fail_threshold != null
        ? Math.max(1, Math.floor(Number(body.fail_threshold)))
        : existing.fail_threshold;
    const timeLim =
      body.hizb_time_limit != null
        ? Math.max(1, Math.floor(Number(body.hizb_time_limit)))
        : existing.hizb_time_limit;

    if (hasMega) {
      await env.DB.prepare(
        `UPDATE quranic_days SET
           name_ar = ?, event_date = ?, deduction_rules = ?,
           is_active = ?, fail_threshold = ?, hizb_time_limit = ?
         WHERE id = ?`,
      )
        .bind(
          name,
          eventDate,
          stringifyDeductionRules(rules),
          isActive,
          failTh,
          timeLim,
          dayId,
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE quranic_days SET name_ar = ?, event_date = ?, deduction_rules = ?, is_active = ?
         WHERE id = ?`,
      )
        .bind(name, eventDate, stringifyDeductionRules(rules), isActive, dayId)
        .run();
    }
    return json({ ok: true });
  }

  const studentsListMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)\/students$/);
  if (studentsListMatch && request.method === "GET") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const dayId = Number(studentsListMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    const rows = await env.DB.prepare(
      `SELECT qds.id, qds.student_id, s.full_name_ar, qds.target_hizbs, s.stage_id
       FROM quranic_day_students qds
       INNER JOIN students s ON s.id = qds.student_id
       WHERE qds.quranic_day_id = ?
       ORDER BY s.full_name_ar`,
    )
      .bind(dayId)
      .all();

    const items = (rows.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      student_id: r.student_id,
      full_name_ar: r.full_name_ar,
      stage_id: r.stage_id,
      target_hizbs: parseTargetHizbs(r.target_hizbs as string),
    }));
    return json({ items });
  }

  const studentsPostMatch = path.match(/^\/api\/edu-dept\/quranic-days\/(\d+)\/students$/);
  if (studentsPostMatch && request.method === "POST") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const dayId = Number(studentsPostMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }

    let body: {
      student_id?: number;
      hizb_from?: number;
      hizb_to?: number;
      target_hizbs?: number[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const studentId = Number(body.student_id);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return json({ error: "student_id_required" }, 400);
    }

    let hizbs: number[] = [];
    if (Array.isArray(body.target_hizbs) && body.target_hizbs.length > 0) {
      hizbs = body.target_hizbs
        .map((n) => Number(n))
        .filter((n) => n >= 1 && n <= 60);
    } else if (body.hizb_from != null && body.hizb_to != null) {
      hizbs = hizbsFromRange(Number(body.hizb_from), Number(body.hizb_to));
    }
    if (hizbs.length === 0) return json({ error: "target_hizbs_required" }, 400);

    const st = await env.DB.prepare(
      `SELECT id, stage_id FROM students WHERE id = ? AND complex_id = ? AND is_active = 1`,
    )
      .bind(studentId, auth.complexId)
      .first<{ id: number; stage_id: number | null }>();
    if (!st) return json({ error: "student_not_found" }, 404);
    if (st.stage_id === EXCLUDED_STAGE_TALQEEN) {
      return json({ error: "stage_talqeen_excluded" }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO quranic_day_students (quranic_day_id, student_id, target_hizbs)
       VALUES (?, ?, ?)
       ON CONFLICT(quranic_day_id, student_id) DO UPDATE SET target_hizbs = excluded.target_hizbs`,
    )
      .bind(dayId, studentId, JSON.stringify(hizbs))
      .run();

    return json({ ok: true, target_hizbs: hizbs });
  }

  const studentDelMatch = path.match(
    /^\/api\/edu-dept\/quranic-days\/(\d+)\/students\/(\d+)$/,
  );
  if (studentDelMatch && request.method === "DELETE") {
    if (!(await hasTable(env, "quranic_day_students"))) return migrationRequired();
    const dayId = Number(studentDelMatch[1]);
    const studentId = Number(studentDelMatch[2]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    await env.DB.prepare(
      `DELETE FROM quranic_day_students WHERE quranic_day_id = ? AND student_id = ?`,
    )
      .bind(dayId, studentId)
      .run();
    return json({ ok: true });
  }

  const studentSearchMatch = path.match(
    /^\/api\/edu-dept\/quranic-days\/(\d+)\/students\/search$/,
  );
  if (studentSearchMatch && request.method === "GET") {
    const dayId = Number(studentSearchMatch[1]);
    if (!(await assertDayInComplex(env, dayId, auth.complexId))) {
      return json({ error: "not_found" }, 404);
    }
    const q = url.searchParams.get("q")?.trim() ?? "";
    const stageParam = url.searchParams.get("stage_ids")?.trim();
    let stageIds = ALLOWED_STAGES;
    if (stageParam) {
      stageIds = stageParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => ALLOWED_STAGES.includes(n));
      if (stageIds.length === 0) stageIds = ALLOWED_STAGES;
    }
    if (q.length < 1) return json({ items: [] });

    const hasStage = await tableHasColumn(env, "students", "stage_id");
    const ph = stageIds.map(() => "?").join(",");
    let sql = `
      SELECT s.id, s.full_name_ar, s.stage_id
      FROM students s
      WHERE s.complex_id = ? AND s.is_active = 1 AND s.full_name_ar LIKE ?`;
    const binds: (string | number)[] = [auth.complexId, `%${q}%`];
    if (hasStage) {
      sql += ` AND s.stage_id IN (${ph})`;
      binds.push(...stageIds);
    }
    sql += ` ORDER BY s.full_name_ar LIMIT 20`;
    const rows = await env.DB.prepare(sql)
      .bind(...binds)
      .all();
    return json({ items: rows.results ?? [] });
  }

  return json({ error: "not_found" }, 404);
}
