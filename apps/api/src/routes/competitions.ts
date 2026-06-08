import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import {
  loadUserScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
} from "../lib/dept-scope";
import { DEFAULT_COMPETITION } from "../lib/edu-settings-defaults";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function distributeDaily(
  totalJuz: number,
  dailyJuz: number,
  startDate: string,
  endDate: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (dailyJuz <= 0 || totalJuz <= 0) return out;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let remaining = totalJuz;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const chunk = Math.min(dailyJuz, remaining);
    out[key] = Math.round(chunk * 100) / 100;
    remaining -= chunk;
    if (remaining <= 0) break;
  }
  return out;
}

function defaultRules(): Record<string, unknown> {
  return {
    scoring: { ...DEFAULT_COMPETITION },
    plan_mode: "juz_distribution",
  };
}

async function competitionExists(
  env: Env,
  id: number,
  complexId: number,
): Promise<Record<string, unknown> | null> {
  return env.DB.prepare(`SELECT * FROM competitions WHERE id = ? AND complex_id = ?`)
    .bind(id, complexId)
    .first<Record<string, unknown>>();
}

async function syncTargets(
  env: Env,
  competitionId: number,
  scope: { student_ids?: number[]; circle_ids?: number[]; track_ids?: number[] },
): Promise<void> {
  await env.DB.prepare(`DELETE FROM competition_targets WHERE competition_id = ?`)
    .bind(competitionId)
    .run();
  for (const sid of scope.student_ids ?? []) {
    await env.DB.prepare(
      `INSERT INTO competition_targets (competition_id, target_type, student_id)
       VALUES (?, 'student', ?)`,
    )
      .bind(competitionId, sid)
      .run();
  }
  for (const cid of scope.circle_ids ?? []) {
    await env.DB.prepare(
      `INSERT INTO competition_targets (competition_id, target_type, circle_id)
       VALUES (?, 'circle', ?)`,
    )
      .bind(competitionId, cid)
      .run();
  }
  for (const tid of scope.track_ids ?? []) {
    await env.DB.prepare(
      `INSERT INTO competition_targets (competition_id, target_type, track_id)
       VALUES (?, 'track', ?)`,
    )
      .bind(competitionId, tid)
      .run();
  }
}

export async function handleEduCompetitionsRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  let path = url.pathname;
  if (path.startsWith("/api/competitions")) {
    path = path.replace("/api/competitions", "/api/edu-dept/competitions");
  }
  if (!path.startsWith("/api/edu-dept/competitions")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["edu_supervisor", "super_admin"])) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);
  const hasDescription = await tableHasColumn(env, "competitions", "description");
  const hasCompAttendance = await hasTable(env, "competition_attendance");

  if (request.method === "GET" && path === "/api/edu-dept/competitions") {
    const stageWhere = stageFilterWhere(scope, "c.stage_id");
    const descCol = hasDescription ? ", c.description" : "";
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name_ar${descCol}, c.start_date, c.end_date, c.status,
              c.live_log_token, c.tv_launch_key
       FROM competitions c
       WHERE c.complex_id = ? AND (${stageWhere} OR c.stage_id IS NULL)
       ORDER BY c.start_date DESC LIMIT 100`,
    )
      .bind(auth.complexId, ...stageFilterBinds(scope))
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (request.method === "POST" && path === "/api/edu-dept/competitions") {
    let body: {
      name_ar?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      rules?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!body.name_ar?.trim() || !body.start_date || !body.end_date) {
      return json({ error: "name_and_dates_required" }, 400);
    }

    const tvKey = randomKey();
    const rules = { ...defaultRules(), ...(body.rules ?? {}) };
    const ins = hasDescription
      ? await env.DB.prepare(
          `INSERT INTO competitions
           (complex_id, name_ar, description, start_date, end_date, status, telemetry_type,
            rules_json, scope_json, tv_launch_key, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, 'draft', 'intensive_routine', ?, '{}', ?, ?)`,
        )
          .bind(
            auth.complexId,
            body.name_ar.trim(),
            body.description?.trim() ?? "",
            body.start_date,
            body.end_date,
            JSON.stringify(rules),
            tvKey,
            auth.userId,
          )
          .run()
      : await env.DB.prepare(
          `INSERT INTO competitions
           (complex_id, name_ar, start_date, end_date, status, telemetry_type,
            rules_json, scope_json, tv_launch_key, created_by_user_id)
           VALUES (?, ?, ?, ?, 'draft', 'intensive_routine', ?, '{}', ?, ?)`,
        )
          .bind(
            auth.complexId,
            body.name_ar.trim(),
            body.start_date,
            body.end_date,
            JSON.stringify(rules),
            tvKey,
            auth.userId,
          )
          .run();

    return json({ ok: true, id: ins.meta.last_row_id as number, tv_launch_key: tvKey });
  }

  const detailMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)$/);
  if (detailMatch) {
    const id = Number(detailMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      const targets = await env.DB.prepare(
        `SELECT * FROM competition_targets WHERE competition_id = ?`,
      )
        .bind(id)
        .all();

      const plans = await env.DB.prepare(
        `SELECT p.*, s.full_name_ar FROM competition_student_plans p
         JOIN students s ON s.id = p.student_id
         WHERE p.competition_id = ?`,
      )
        .bind(id)
        .all();

      const logs = await env.DB.prepare(
        `SELECT l.student_id, l.mark_date AS log_date, l.notes AS metrics_json,
                'ledger' AS source, l.recorded_at, s.full_name_ar
         FROM quran_daily_ledger l
         JOIN students s ON s.id = l.student_id
         WHERE l.context_type = 'competition' AND l.context_id = ?
         ORDER BY l.mark_date DESC, l.recorded_at DESC`,
      )
        .bind(id)
        .all();

      return json({
        competition: {
          ...row,
          description: hasDescription ? row.description ?? "" : "",
          rules: JSON.parse(String(row.rules_json ?? "{}")),
          scope: JSON.parse(String(row.scope_json ?? "{}")),
        },
        targets: targets.results ?? [],
        plans: plans.results ?? [],
        logs: logs.results ?? [],
      });
    }

    if (request.method === "PATCH") {
      let body: {
        name_ar?: string;
        description?: string;
        start_date?: string;
        end_date?: string;
        status?: string;
        rules?: Record<string, unknown>;
        scope?: { student_ids?: number[]; circle_ids?: number[]; track_ids?: number[] };
        plans?: Array<{
          student_id: number;
          total_target_juz?: number;
          daily_volume_juz?: number;
        }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const currentRules = JSON.parse(String(row.rules_json ?? "{}"));
      const nextRules = body.rules ? { ...currentRules, ...body.rules } : currentRules;
      const startDate = body.start_date ?? String(row.start_date);
      const endDate = body.end_date ?? String(row.end_date);

      if (hasDescription) {
        await env.DB.prepare(
          `UPDATE competitions SET
             name_ar = COALESCE(?, name_ar),
             description = COALESCE(?, description),
             start_date = COALESCE(?, start_date),
             end_date = COALESCE(?, end_date),
             status = COALESCE(?, status),
             rules_json = ?,
             scope_json = COALESCE(?, scope_json),
             updated_at = datetime('now')
           WHERE id = ? AND complex_id = ?`,
        )
          .bind(
            body.name_ar?.trim() ?? null,
            body.description ?? null,
            body.start_date ?? null,
            body.end_date ?? null,
            body.status ?? null,
            JSON.stringify(nextRules),
            body.scope ? JSON.stringify(body.scope) : null,
            id,
            auth.complexId,
          )
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE competitions SET
             name_ar = COALESCE(?, name_ar),
             start_date = COALESCE(?, start_date),
             end_date = COALESCE(?, end_date),
             status = COALESCE(?, status),
             rules_json = ?,
             scope_json = COALESCE(?, scope_json),
             updated_at = datetime('now')
           WHERE id = ? AND complex_id = ?`,
        )
          .bind(
            body.name_ar?.trim() ?? null,
            body.start_date ?? null,
            body.end_date ?? null,
            body.status ?? null,
            JSON.stringify(nextRules),
            body.scope ? JSON.stringify(body.scope) : null,
            id,
            auth.complexId,
          )
          .run();
      }

      if (body.scope) {
        await syncTargets(env, id, body.scope);
      }

      if (body.plans?.length) {
        for (const p of body.plans) {
          if (!p.student_id) continue;
          const total = Number(p.total_target_juz ?? 0);
          const daily = Number(p.daily_volume_juz ?? 0);
          const distributed = distributeDaily(total, daily, startDate, endDate);
          await env.DB.prepare(
            `INSERT INTO competition_student_plans
             (competition_id, student_id, total_target_juz, daily_volume_juz, distributed_json)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(competition_id, student_id) DO UPDATE SET
               total_target_juz = excluded.total_target_juz,
               daily_volume_juz = excluded.daily_volume_juz,
               distributed_json = excluded.distributed_json`,
          )
            .bind(id, p.student_id, total, daily, JSON.stringify(distributed))
            .run();
        }
      }

      return json({ ok: true });
    }
  }

  const liveTokenMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/live-log-token$/,
  );
  if (request.method === "POST" && liveTokenMatch) {
    const id = Number(liveTokenMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);
    const token = randomKey();
    await env.DB.prepare(
      `UPDATE competitions SET live_log_token = ?, status = 'active', updated_at = datetime('now')
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(token, id, auth.complexId)
      .run();
    return json({ ok: true, live_log_token: token, path: `/live-log/${token}` });
  }

  const activateMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/activate$/,
  );
  if (request.method === "POST" && activateMatch) {
    const id = Number(activateMatch[1]);
    await env.DB.prepare(
      `UPDATE competitions SET status = 'active', updated_at = datetime('now')
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(id, auth.complexId)
      .run();
    return json({ ok: true });
  }

  const attendanceMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/attendance$/,
  );
  if (attendanceMatch && hasCompAttendance) {
    const id = Number(attendanceMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    if (request.method === "GET") {
      const date =
        url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
      const studentIds = await resolveCompetitionStudents(
        env,
        auth.complexId,
        id,
        scope,
      );
      if (!studentIds.length) {
        return json({ date, items: [], present_count: 0, total: 0 });
      }
      const placeholders = studentIds.map(() => "?").join(",");
      const students = await env.DB.prepare(
        `SELECT s.id AS student_id, s.full_name_ar
         FROM students s
         WHERE s.id IN (${placeholders})
         ORDER BY s.full_name_ar`,
      )
        .bind(...studentIds)
        .all<{ student_id: number; full_name_ar: string }>();

      const attRows = await env.DB.prepare(
        `SELECT student_id, present FROM competition_attendance
         WHERE competition_id = ? AND attendance_date = ?`,
      )
        .bind(id, date)
        .all<{ student_id: number; present: number }>();
      const attMap = new Map(
        (attRows.results ?? []).map((r) => [r.student_id, r.present === 1]),
      );

      const items = (students.results ?? []).map((s) => ({
        student_id: s.student_id,
        full_name_ar: s.full_name_ar,
        present: attMap.has(s.student_id) ? attMap.get(s.student_id)! : true,
      }));
      const presentCount = items.filter((i) => i.present).length;
      return json({
        date,
        items,
        present_count: presentCount,
        total: items.length,
      });
    }

    if (request.method === "POST") {
      let body: {
        date?: string;
        records?: Array<{ student_id: number; present: boolean }>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const date = body.date ?? new Date().toISOString().slice(0, 10);
      for (const rec of body.records ?? []) {
        await env.DB.prepare(
          `INSERT INTO competition_attendance
           (competition_id, student_id, attendance_date, present, recorded_by_user_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(competition_id, student_id, attendance_date) DO UPDATE SET
             present = excluded.present,
             recorded_by_user_id = excluded.recorded_by_user_id,
             recorded_at = datetime('now')`,
        )
          .bind(id, rec.student_id, date, rec.present ? 1 : 0, auth.userId)
          .run();
      }
      return json({ ok: true });
    }
  }

  const dashboardMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/dashboard$/,
  );
  if (request.method === "GET" && dashboardMatch) {
    const id = Number(dashboardMatch[1]);
    const row = await competitionExists(env, id, auth.complexId);
    if (!row) return json({ error: "not_found" }, 404);

    const dateFrom = url.searchParams.get("date_from") ?? String(row.start_date);
    const dateTo = url.searchParams.get("date_to") ?? String(row.end_date);

    const studentIds = await resolveCompetitionStudents(
      env,
      auth.complexId,
      id,
      scope,
    );
    const totalStudents = studentIds.length;

    let disciplinePct = 0;
    if (hasCompAttendance && totalStudents > 0) {
      const att = await env.DB.prepare(
        `SELECT COUNT(*) AS total_marks,
                SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) AS present_marks
         FROM competition_attendance
         WHERE competition_id = ? AND attendance_date BETWEEN ? AND ?`,
      )
        .bind(id, dateFrom, dateTo)
        .first<{ total_marks: number; present_marks: number }>();
      const totalMarks = Number(att?.total_marks ?? 0);
      const presentMarks = Number(att?.present_marks ?? 0);
      disciplinePct =
        totalMarks > 0 ? Math.round((presentMarks / totalMarks) * 100) : 0;
    }

    const plans = await env.DB.prepare(
      `SELECT student_id, total_target_juz, daily_volume_juz, distributed_json
       FROM competition_student_plans WHERE competition_id = ?`,
    )
      .bind(id)
      .all<{
        student_id: number;
        total_target_juz: number;
        daily_volume_juz: number;
        distributed_json: string;
      }>();

    const logs = await env.DB.prepare(
      `SELECT student_id, mark_date, notes
       FROM quran_daily_ledger
       WHERE context_type = 'competition' AND context_id = ?
         AND mark_date BETWEEN ? AND ?`,
    )
      .bind(id, dateFrom, dateTo)
      .all<{ student_id: number; mark_date: string; notes: string }>();

    let achievedSum = 0;
    const achievedByStudent = new Map<number, number>();
    for (const log of logs.results ?? []) {
      let metrics: Record<string, unknown> = {};
      try {
        metrics = JSON.parse(log.notes ?? "{}");
      } catch {
        metrics = {};
      }
      const juz =
        Number(metrics.juz_completed ?? 0) ||
        Number(metrics.hifz_pages ?? 0) / 20 ||
        0;
      achievedByStudent.set(
        log.student_id,
        (achievedByStudent.get(log.student_id) ?? 0) + juz,
      );
      achievedSum += juz;
    }

    let planTargetInRange = 0;
    for (const p of plans.results ?? []) {
      let dist: Record<string, number> = {};
      try {
        dist = JSON.parse(p.distributed_json ?? "{}");
      } catch {
        dist = {};
      }
      for (const [d, v] of Object.entries(dist)) {
        if (d >= dateFrom && d <= dateTo) planTargetInRange += Number(v);
      }
    }
    const achievementPct =
      planTargetInRange > 0
        ? Math.min(100, Math.round((achievedSum / planTargetInRange) * 100))
        : achievedSum > 0
          ? 100
          : 0;

    const leaders = [...achievedByStudent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([student_id, score]) => ({ student_id, score }));

    if (leaders.length) {
      const placeholders = leaders.map(() => "?").join(",");
      const names = await env.DB.prepare(
        `SELECT id, full_name_ar FROM students WHERE id IN (${placeholders})`,
      )
        .bind(...leaders.map((l) => l.student_id))
        .all<{ id: number; full_name_ar: string }>();
      const nameMap = new Map(
        (names.results ?? []).map((n) => [n.id, n.full_name_ar]),
      );
      for (const l of leaders) {
        (l as { full_name_ar?: string }).full_name_ar = nameMap.get(l.student_id);
      }
    }

    return json({
      date_from: dateFrom,
      date_to: dateTo,
      kpis: {
        discipline_pct: disciplinePct,
        achievement_pct: achievementPct,
        participants: totalStudents,
        target_juz: Math.round(planTargetInRange * 100) / 100,
        achieved_juz: Math.round(achievedSum * 100) / 100,
      },
      leaders,
    });
  }

  return json({ error: "Not Found", path }, 404);
}

export async function resolveCompetitionStudents(
  env: Env,
  complexId: number,
  competitionId: number,
  scope: Awaited<ReturnType<typeof loadUserScope>>,
): Promise<number[]> {
  const scopeWhere = studentsInScopeWhere(scope);
  const targets = await env.DB.prepare(
    `SELECT target_type, student_id, circle_id, track_id
     FROM competition_targets WHERE competition_id = ?`,
  )
    .bind(competitionId)
    .all<{
      target_type: string;
      student_id: number | null;
      circle_id: number | null;
      track_id: number | null;
    }>();

  const ids = new Set<number>();

  if (!targets.results?.length) {
    const all = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${scopeWhere}`,
    )
      .bind(...studentsInScopeBinds(complexId, scope))
      .all<{ id: number }>();
    for (const r of all.results ?? []) ids.add(r.id);
    return [...ids];
  }

  for (const t of targets.results ?? []) {
    if (t.target_type === "student" && t.student_id) {
      ids.add(t.student_id);
    } else if (t.target_type === "circle" && t.circle_id) {
      const rows = await env.DB.prepare(
        `SELECT DISTINCT s.id FROM students s
         JOIN student_circle_history h ON h.student_id = s.id
         WHERE h.circle_id = ? AND h.to_at IS NULL AND h.frozen_at IS NULL
           AND ${scopeWhere}`,
      )
        .bind(t.circle_id, ...studentsInScopeBinds(complexId, scope))
        .all<{ id: number }>();
      for (const r of rows.results ?? []) ids.add(r.id);
    } else if (t.target_type === "track" && t.track_id) {
      const rows = await env.DB.prepare(
        `SELECT DISTINCT s.id FROM students s
         JOIN student_circle_history h ON h.student_id = s.id
         WHERE h.track_id = ? AND h.to_at IS NULL AND h.frozen_at IS NULL
           AND ${scopeWhere}`,
      )
        .bind(t.track_id, ...studentsInScopeBinds(complexId, scope))
        .all<{ id: number }>();
      for (const r of rows.results ?? []) ids.add(r.id);
    }
  }

  return [...ids];
}
