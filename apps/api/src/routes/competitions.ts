import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import {
  loadUserScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
} from "../lib/dept-scope";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

export async function handleEduCompetitionsRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/edu-dept/competitions")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["edu_supervisor"])) {
    return json({ error: "forbidden" }, 403);
  }

  const scope = await loadUserScope(env, auth.userId);

  if (request.method === "GET" && path === "/api/edu-dept/competitions") {
    const stageWhere = stageFilterWhere(scope, "c.stage_id");
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name_ar, c.start_date, c.end_date, c.status,
              c.telemetry_type, c.live_log_token, c.tv_launch_key
       FROM competitions c
       WHERE c.complex_id = ? AND (${stageWhere} OR c.stage_id IS NULL)
       ORDER BY c.start_date DESC LIMIT 50`,
    )
      .bind(auth.complexId, ...stageFilterBinds(scope))
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (request.method === "POST" && path === "/api/edu-dept/competitions") {
    let body: {
      name_ar?: string;
      start_date?: string;
      end_date?: string;
      telemetry_type?: string;
      stage_id?: number | null;
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

    if (!body.name_ar?.trim() || !body.start_date || !body.end_date) {
      return json({ error: "name_and_dates_required" }, 400);
    }
    const telemetry = body.telemetry_type ?? "intensive_routine";
    if (!["extended_recitation", "intensive_routine"].includes(telemetry)) {
      return json({ error: "invalid_telemetry_type" }, 400);
    }

    const tvKey = randomKey();
    const ins = await env.DB.prepare(
      `INSERT INTO competitions
       (complex_id, name_ar, start_date, end_date, status, telemetry_type,
        rules_json, scope_json, stage_id, tv_launch_key, created_by_user_id)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        auth.complexId,
        body.name_ar.trim(),
        body.start_date,
        body.end_date,
        telemetry,
        JSON.stringify(body.rules ?? {}),
        JSON.stringify(body.scope ?? {}),
        body.stage_id ?? null,
        tvKey,
        auth.userId,
      )
      .run();

    const competitionId = ins.meta.last_row_id as number;

    for (const sid of body.scope?.student_ids ?? []) {
      await env.DB.prepare(
        `INSERT INTO competition_targets (competition_id, target_type, student_id)
         VALUES (?, 'student', ?)`,
      )
        .bind(competitionId, sid)
        .run();
    }
    for (const cid of body.scope?.circle_ids ?? []) {
      await env.DB.prepare(
        `INSERT INTO competition_targets (competition_id, target_type, circle_id)
         VALUES (?, 'circle', ?)`,
      )
        .bind(competitionId, cid)
        .run();
    }
    for (const tid of body.scope?.track_ids ?? []) {
      await env.DB.prepare(
        `INSERT INTO competition_targets (competition_id, target_type, track_id)
         VALUES (?, 'track', ?)`,
      )
        .bind(competitionId, tid)
        .run();
    }

    if (telemetry === "extended_recitation") {
      for (const p of body.plans ?? []) {
        if (!p.student_id) continue;
        const total = Number(p.total_target_juz ?? 0);
        const daily = Number(p.daily_volume_juz ?? 0);
        const distributed = distributeDaily(
          total,
          daily,
          body.start_date,
          body.end_date,
        );
        await env.DB.prepare(
          `INSERT INTO competition_student_plans
           (competition_id, student_id, total_target_juz, daily_volume_juz, distributed_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
          .bind(competitionId, p.student_id, total, daily, JSON.stringify(distributed))
          .run();
      }
    }

    return json({ ok: true, id: competitionId, tv_launch_key: tvKey });
  }

  const detailMatch = path.match(/^\/api\/edu-dept\/competitions\/(\d+)$/);
  if (request.method === "GET" && detailMatch) {
    const id = Number(detailMatch[1]);
    const row = await env.DB.prepare(
      `SELECT * FROM competitions WHERE id = ? AND complex_id = ?`,
    )
      .bind(id, auth.complexId)
      .first<Record<string, unknown>>();
    if (!row) return json({ error: "not_found" }, 404);

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
        rules: JSON.parse(String(row.rules_json ?? "{}")),
        scope: JSON.parse(String(row.scope_json ?? "{}")),
      },
      targets: targets.results ?? [],
      plans: plans.results ?? [],
      logs: logs.results ?? [],
    });
  }

  const liveTokenMatch = path.match(
    /^\/api\/edu-dept\/competitions\/(\d+)\/live-log-token$/,
  );
  if (request.method === "POST" && liveTokenMatch) {
    const id = Number(liveTokenMatch[1]);
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
