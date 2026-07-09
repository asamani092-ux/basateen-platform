import type { Env } from "../types";
import { addDaysIso, todayRiyadhIso } from "../lib/today-riyadh-iso";
import {
  buildSemesterCalendar,
  estimatePlan,
  type PlanInputs,
} from "../lib/plan-estimator";
import { teacherCanAccessStudent } from "../lib/dept-scope";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
import { buildTeacherCircleAccessSql } from "../lib/teacher-circle";
import { resolveTrackSupervisorTrackIds } from "../lib/student-placement";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { tableHasColumn } from "../lib/db-schema";

const PLAN_ROLES = ["teacher", "track_supervisor"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** O(1) — أيام متبقية حتى ends_at (تقويم الرياض). */
export function daysRemainingRiyadh(
  endsAt: string | null | undefined,
  today = todayRiyadhIso(),
): number | null {
  if (!endsAt?.trim()) return null;
  const end = endsAt.trim().slice(0, 10);
  const [ey, em, ed] = end.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if (![ey, em, ed, ty, tm, td].every(Number.isFinite)) return null;
  const endMs = Date.UTC(ey, em - 1, ed);
  const todayMs = Date.UTC(ty, tm - 1, td);
  return Math.round((endMs - todayMs) / 86_400_000);
}

function withPlanMeta<T extends Record<string, unknown>>(
  row: T,
  today = todayRiyadhIso(),
): T & { days_remaining: number | null; is_expired: boolean } {
  const endsAt = row.ends_at != null ? String(row.ends_at) : null;
  const days = daysRemainingRiyadh(endsAt, today);
  return {
    ...row,
    days_remaining: days,
    is_expired: days != null ? days < 0 : false,
  };
}

async function loadCalendar(env: Env, complexId: number) {
  const row = await env.DB.prepare(
    `SELECT semester_weeks, school_days_json FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(complexId)
    .first<{ semester_weeks: number; school_days_json: string }>();
  return buildSemesterCalendar(
    row?.semester_weeks ?? 16,
    row?.school_days_json ?? "[0,1,2,3,4]",
  );
}

async function buildPlansListScope(
  env: Env,
  auth: { userId: number; role: string; complexId: number },
): Promise<{ sql: string; binds: number[] } | null> {
  const placement = await buildStudentPlacementSql(env);

  if (auth.role === "track_supervisor") {
    const trackIds = await resolveTrackSupervisorTrackIds(
      env,
      auth.userId,
      auth.complexId,
    );
    if (!trackIds.length) return null;
    const ph = trackIds.map(() => "?").join(",");
    return {
      sql: `${placement.trackRef} IN (${ph})`,
      binds: trackIds,
    };
  }

  const teacherScope = await buildTeacherCircleAccessSql(env, placement.circleRef);
  const scopeBindCount = (teacherScope.match(/\?/g) ?? []).length;
  return {
    sql: teacherScope,
    binds: Array.from({ length: scopeBindCount }, () => auth.userId),
  };
}

export async function handleTeacherRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/teacher/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...PLAN_ROLES])) {
    return json({ error: "forbidden" }, 403);
  }

  if (path === "/api/teacher/calendar" && request.method === "GET") {
    const calendar = await loadCalendar(env, auth.complexId);
    return json(calendar);
  }

  if (path === "/api/teacher/plans" && request.method === "GET") {
    const placement = await buildStudentPlacementSql(env);
    const scope = await buildPlansListScope(env, auth);
    if (!scope) return json({ items: [] });

    const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
    const today = todayRiyadhIso();
    const rows = await env.DB.prepare(
      `SELECT
         p.id,
         p.student_id,
         s.full_name_ar,
         p.plan_kind,
         p.daily_hifz_pages,
         p.daily_muraja_pages,
         p.daily_rabt_faces,
         p.repeat_target,
         p.starts_at,
         p.ends_at,
         ${hasDuration ? "p.duration_weeks," : "NULL AS duration_weeks,"}
         p.updated_at,
         c.name_ar AS circle_name
       FROM student_semester_plans p
       JOIN students s ON s.id = p.student_id
       ${placement.historyJoin}
       ${placement.circleJoin}
       WHERE COALESCE(CAST(p.is_active AS INTEGER), 1) = 1
         AND s.complex_id = ?
         AND ${scope.sql}
       ORDER BY s.full_name_ar, p.id`,
    )
      .bind(auth.complexId, ...scope.binds)
      .all<Record<string, unknown>>();

    const items = (rows.results ?? []).map((r) => withPlanMeta(r, today));
    return json({ items });
  }

  if (path === "/api/teacher/plans/estimate" && request.method === "POST") {
    let body: PlanInputs;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const calendar = await loadCalendar(env, auth.complexId);
    return json({ estimate: estimatePlan(calendar, body), calendar });
  }

  const planByIdMatch = path.match(/^\/api\/teacher\/plans\/by-id\/(\d+)$/);
  if (planByIdMatch) {
    const planId = Number(planByIdMatch[1]);
    if (!Number.isFinite(planId)) return json({ error: "invalid_id" }, 400);

    const existing = await env.DB.prepare(
      `SELECT * FROM student_semester_plans WHERE id = ?`,
    )
      .bind(planId)
      .first<Record<string, unknown>>();
    if (!existing) return json({ error: "not_found" }, 404);

    const studentId = Number(existing.student_id);
    if (
      !(await teacherCanAccessStudent(env, auth.userId, studentId, {
        complexId: auth.complexId,
      }))
    ) {
      return json({ error: "forbidden_student" }, 403);
    }

    if (request.method === "PATCH") {
      let body: {
        plan_kind?: string;
        daily_hifz_pages?: number;
        daily_muraja_pages?: number;
        daily_rabt_faces?: number;
        repeat_target?: number;
        duration_weeks?: number;
        wizard_json?: Record<string, unknown>;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const kind = body.plan_kind ?? String(existing.plan_kind ?? "combined");
      if (!["hifz_new", "muraja", "tilawa", "combined"].includes(kind)) {
        return json({ error: "invalid_plan_kind" }, 400);
      }

      const inputs: PlanInputs = {
        daily_hifz_pages:
          body.daily_hifz_pages !== undefined
            ? Number(body.daily_hifz_pages) || 0
            : Number(existing.daily_hifz_pages) || 0,
        daily_muraja_pages:
          body.daily_muraja_pages !== undefined
            ? Number(body.daily_muraja_pages) || 0
            : Number(existing.daily_muraja_pages) || 0,
        daily_rabt_faces:
          body.daily_rabt_faces !== undefined
            ? Number(body.daily_rabt_faces) || 0
            : Number(existing.daily_rabt_faces) || 0,
        repeat_target: Math.max(
          1,
          body.repeat_target !== undefined
            ? Number(body.repeat_target) || 1
            : Number(existing.repeat_target) || 1,
        ),
      };

      const calendar = await loadCalendar(env, auth.complexId);
      const estimate = estimatePlan(calendar, inputs);
      const startsAt = String(existing.starts_at ?? todayRiyadhIso()).slice(0, 10);

      let durationWeeks =
        body.duration_weeks !== undefined
          ? Math.max(1, Math.floor(Number(body.duration_weeks) || 0))
          : Number(existing.duration_weeks) || 0;
      if (!Number.isFinite(durationWeeks) || durationWeeks < 1) {
        const prevEnds = existing.ends_at ? String(existing.ends_at).slice(0, 10) : null;
        if (prevEnds) {
          const rem = daysRemainingRiyadh(prevEnds, startsAt);
          durationWeeks = rem != null && rem > 0 ? Math.max(1, Math.ceil(rem / 7)) : 1;
        } else {
          durationWeeks = 1;
        }
      }
      const endsAt = addDaysIso(startsAt, durationWeeks * 7);
      const wizardJson = JSON.stringify({
        ...(typeof existing.wizard_json === "string"
          ? (() => {
              try {
                return JSON.parse(existing.wizard_json as string);
              } catch {
                return {};
              }
            })()
          : {}),
        ...(body.wizard_json ?? {}),
        estimate,
        duration_weeks: durationWeeks,
      });

      const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
      if (hasDuration) {
        await env.DB.prepare(
          `UPDATE student_semester_plans SET
             plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
             daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
             duration_weeks = ?, wizard_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(
            kind,
            inputs.daily_hifz_pages,
            inputs.daily_muraja_pages,
            inputs.daily_rabt_faces,
            inputs.repeat_target,
            endsAt,
            durationWeeks,
            wizardJson,
            planId,
          )
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE student_semester_plans SET
             plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
             daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
             wizard_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
          .bind(
            kind,
            inputs.daily_hifz_pages,
            inputs.daily_muraja_pages,
            inputs.daily_rabt_faces,
            inputs.repeat_target,
            endsAt,
            wizardJson,
            planId,
          )
          .run();
      }

      return json({
        ok: true,
        id: planId,
        estimate,
        starts_at: startsAt,
        ends_at: endsAt,
        duration_weeks: durationWeeks,
        days_remaining: daysRemainingRiyadh(endsAt),
      });
    }

    if (request.method === "DELETE") {
      await env.DB.prepare(
        `UPDATE student_semester_plans SET is_active = 0, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(planId)
        .run();
      return json({ ok: true, id: planId });
    }

    return json({ error: "method_not_allowed" }, 405);
  }

  const planMatch = path.match(/^\/api\/teacher\/plans\/(\d+)$/);
  if (planMatch) {
    const studentId = Number(planMatch[1]);
    if (!Number.isFinite(studentId)) return json({ error: "invalid_id" }, 400);

    if (
      !(await teacherCanAccessStudent(env, auth.userId, studentId, {
        complexId: auth.complexId,
      }))
    ) {
      return json({ error: "forbidden_student" }, 403);
    }

    if (request.method === "GET") {
      const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
      const today = todayRiyadhIso();
      const planRows = await env.DB.prepare(
        `SELECT * FROM student_semester_plans
         WHERE student_id = ? AND COALESCE(CAST(is_active AS INTEGER), 1) = 1
         ORDER BY id DESC`,
      )
        .bind(studentId)
        .all<Record<string, unknown>>();

      const plans = (planRows.results ?? []).map((p) => withPlanMeta(p, today));
      const calendar = await loadCalendar(env, auth.complexId);
      const primary = plans[0] ?? null;
      let estimate = null;
      if (primary) {
        estimate = estimatePlan(calendar, {
          daily_hifz_pages: Number(primary.daily_hifz_pages),
          daily_muraja_pages: Number(primary.daily_muraja_pages),
          daily_rabt_faces: Number(primary.daily_rabt_faces),
          repeat_target: Number(primary.repeat_target),
        });
      }

      return json({
        plan: primary,
        plans,
        calendar,
        estimate,
        has_duration_weeks: hasDuration,
      });
    }

    if (request.method === "PUT") {
      let body: {
        plan_kind?: string;
        daily_hifz_pages?: number;
        daily_muraja_pages?: number;
        daily_rabt_faces?: number;
        repeat_target?: number;
        duration_weeks?: number;
        starts_at?: string;
        ends_at?: string | null;
        wizard_json?: Record<string, unknown>;
        plan_id?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const kind = body.plan_kind ?? "combined";
      if (!["hifz_new", "muraja", "tilawa", "combined"].includes(kind)) {
        return json({ error: "invalid_plan_kind" }, 400);
      }

      const inputs: PlanInputs = {
        daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
        daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
        daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
        repeat_target: Math.max(1, Number(body.repeat_target) || 1),
      };

      const calendar = await loadCalendar(env, auth.complexId);
      const estimate = estimatePlan(calendar, inputs);
      const rawWeeks = Number(body.duration_weeks);
      if (!Number.isFinite(rawWeeks) || rawWeeks < 1) {
        return json({ error: "duration_weeks_required" }, 400);
      }
      const durationWeeks = Math.max(1, Math.floor(rawWeeks));

      const editId = body.plan_id != null ? Number(body.plan_id) : NaN;
      const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");

      if (Number.isFinite(editId) && editId > 0) {
        const owned = await env.DB.prepare(
          `SELECT id, starts_at FROM student_semester_plans
           WHERE id = ? AND student_id = ? AND COALESCE(CAST(is_active AS INTEGER), 1) = 1`,
        )
          .bind(editId, studentId)
          .first<{ id: number; starts_at: string | null }>();
        if (!owned) return json({ error: "not_found" }, 404);

        const startsAt = String(owned.starts_at ?? todayRiyadhIso()).slice(0, 10);
        const endsAt = addDaysIso(startsAt, durationWeeks * 7);
        const wizardJson = JSON.stringify({
          ...(body.wizard_json ?? {}),
          estimate,
          duration_weeks: durationWeeks,
        });

        if (hasDuration) {
          await env.DB.prepare(
            `UPDATE student_semester_plans SET
               plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
               daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
               duration_weeks = ?, wizard_json = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(
              kind,
              inputs.daily_hifz_pages,
              inputs.daily_muraja_pages,
              inputs.daily_rabt_faces,
              inputs.repeat_target,
              endsAt,
              durationWeeks,
              wizardJson,
              editId,
            )
            .run();
        } else {
          await env.DB.prepare(
            `UPDATE student_semester_plans SET
               plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
               daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
               wizard_json = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(
              kind,
              inputs.daily_hifz_pages,
              inputs.daily_muraja_pages,
              inputs.daily_rabt_faces,
              inputs.repeat_target,
              endsAt,
              wizardJson,
              editId,
            )
            .run();
        }

        return json({
          ok: true,
          id: editId,
          estimate,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_weeks: durationWeeks,
          days_remaining: daysRemainingRiyadh(endsAt),
        });
      }

      const startsAt = todayRiyadhIso();
      const endsAt = addDaysIso(startsAt, durationWeeks * 7);
      const wizardJson = JSON.stringify({
        ...(body.wizard_json ?? {}),
        estimate,
        duration_weeks: durationWeeks,
      });

      const ins = hasDuration
        ? await env.DB.prepare(
            `INSERT INTO student_semester_plans
             (complex_id, student_id, plan_kind, daily_hifz_pages, daily_muraja_pages,
              daily_rabt_faces, repeat_target, starts_at, ends_at, duration_weeks,
              wizard_json, created_by_user_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          )
            .bind(
              auth.complexId,
              studentId,
              kind,
              inputs.daily_hifz_pages,
              inputs.daily_muraja_pages,
              inputs.daily_rabt_faces,
              inputs.repeat_target,
              startsAt,
              endsAt,
              durationWeeks,
              wizardJson,
              auth.userId,
            )
            .run()
        : await env.DB.prepare(
            `INSERT INTO student_semester_plans
             (complex_id, student_id, plan_kind, daily_hifz_pages, daily_muraja_pages,
              daily_rabt_faces, repeat_target, starts_at, ends_at,
              wizard_json, created_by_user_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          )
            .bind(
              auth.complexId,
              studentId,
              kind,
              inputs.daily_hifz_pages,
              inputs.daily_muraja_pages,
              inputs.daily_rabt_faces,
              inputs.repeat_target,
              startsAt,
              endsAt,
              wizardJson,
              auth.userId,
            )
            .run();

      return json({
        ok: true,
        id: ins.meta.last_row_id,
        estimate,
        starts_at: startsAt,
        ends_at: endsAt,
        duration_weeks: durationWeeks,
        days_remaining: daysRemainingRiyadh(endsAt),
      });
    }
  }

  return null;
}
