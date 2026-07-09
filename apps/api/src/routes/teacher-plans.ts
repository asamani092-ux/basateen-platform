import type { Env } from "../types";
import { todayRiyadhIso } from "../lib/today-riyadh-iso";
import {
  buildSemesterCalendar,
  estimatePlan,
  type PlanInputs,
} from "../lib/plan-estimator";
import {
  buildPlanEstimateCalendar,
  computeEndsAtFromWorkingDays,
  countWorkingDaysInRange,
  countWorkingDaysRemaining,
  parseRestDays,
  planDailyAmount,
  REST_DAYS_DEFAULT,
  workingDaysPerWeek,
  type RestDaysSetting,
} from "../lib/plan-working-days";
import { teacherCanAccessStudent } from "../lib/dept-scope";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
import { buildTeacherCircleAccessSql, buildTrackSupervisorStudentScopeSql } from "../lib/teacher-circle";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { tableHasColumn } from "../lib/db-schema";

const PLAN_ROLES = ["teacher", "track_supervisor"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** O(D) — أيام عمل متبقية حتى ends_at (تقويم الرياض + rest_days). */
export function daysRemainingRiyadh(
  endsAt: string | null | undefined,
  today = todayRiyadhIso(),
  restDays: RestDaysSetting = REST_DAYS_DEFAULT,
): number | null {
  if (!endsAt?.trim()) return null;
  return countWorkingDaysRemaining(endsAt, today, restDays);
}

type PlanStatusKey = "active" | "expired_pending_close" | "closed";

const PLAN_STATUS_AR: Record<PlanStatusKey, string> = {
  active: "نشطة",
  expired_pending_close: "منتهية بانتظار الإغلاق",
  closed: "مغلقة",
};

function resolvePlanStatus(
  row: Record<string, unknown>,
  today = todayRiyadhIso(),
): PlanStatusKey {
  const active = Number(row.is_active ?? 1) !== 0;
  if (!active) return "closed";
  const endsAt = row.ends_at != null ? String(row.ends_at).slice(0, 10) : null;
  if (endsAt && endsAt < today) return "expired_pending_close";
  return "active";
}

function withPlanMeta<T extends Record<string, unknown>>(
  row: T,
  today = todayRiyadhIso(),
): T & {
  days_remaining: number | null;
  is_expired: boolean;
  plan_status: PlanStatusKey;
  plan_status_ar: string;
} {
  const endsAt = row.ends_at != null ? String(row.ends_at) : null;
  const restDays = parseRestDays(row.rest_days);
  const days = daysRemainingRiyadh(endsAt, today, restDays);
  const status = resolvePlanStatus(row, today);
  return {
    ...row,
    days_remaining: days,
    is_expired: days != null ? days < 0 : false,
    plan_status: status,
    plan_status_ar: PLAN_STATUS_AR[status],
  };
}

/** O(1) — تقويم تقدير الخطة (لا يستخدم أيام الفصل كاملة) */
function estimateForPlan(
  calendar: ReturnType<typeof buildSemesterCalendar>,
  inputs: PlanInputs,
  durationWeeks: number,
  restDays: RestDaysSetting,
) {
  const planCal = buildPlanEstimateCalendar(calendar, durationWeeks, restDays);
  return estimatePlan(planCal, inputs);
}

function resolvePlanEndsAt(
  startsAt: string,
  durationWeeks: number,
  restDays: RestDaysSetting,
): string {
  return computeEndsAtFromWorkingDays(startsAt, durationWeeks, restDays);
}

function withPlanProgress<T extends Record<string, unknown>>(
  row: T,
  completedDays: number,
): T & {
  total_working_days: number;
  completed_days: number;
  progress_pct: number;
} {
  const startsAt = String(row.starts_at ?? "").slice(0, 10);
  const endsAt = String(row.ends_at ?? "").slice(0, 10);
  const restDays = parseRestDays(row.rest_days);
  const total =
    startsAt && endsAt
      ? countWorkingDaysInRange(startsAt, endsAt, restDays)
      : 0;
  const completed = Math.max(0, Math.min(total, completedDays));
  const progress_pct =
    total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
  return {
    ...row,
    total_working_days: total,
    completed_days: completed,
    progress_pct,
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
): Promise<{ sql: string; binds: number[] } | { unassigned: true }> {
  const placement = await buildStudentPlacementSql(env);

  if (auth.role === "track_supervisor") {
    const scope = await buildTrackSupervisorStudentScopeSql(env, auth, placement);
    if (!scope.assigned) return { unassigned: true };
    return { sql: scope.sql, binds: scope.binds };
  }

  const teacherScope = await buildTeacherCircleAccessSql(env, placement.circleRef);
  const scopeBindCount = (teacherScope.match(/\?/g) ?? []).length;
  return {
    sql: teacherScope,
    binds: Array.from({ length: scopeBindCount }, () => auth.userId),
  };
}

async function loadPlanById(env: Env, planId: number) {
  return env.DB.prepare(`SELECT * FROM student_semester_plans WHERE id = ?`)
    .bind(planId)
    .first<Record<string, unknown>>();
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

  const hasRestDays = await tableHasColumn(env, "student_semester_plans", "rest_days");
  const hasPlanDaysTable = await tableHasColumn(env, "student_plan_days", "plan_id");

  if (path === "/api/teacher/calendar" && request.method === "GET") {
    const calendar = await loadCalendar(env, auth.complexId);
    return json(calendar);
  }

  if (path === "/api/teacher/plans/report" && request.method === "GET") {
    const placement = await buildStudentPlacementSql(env);
    const scope = await buildPlansListScope(env, auth);
    if ("unassigned" in scope) {
      return json({ items: [], scope_unassigned: true });
    }

    const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
    const today = todayRiyadhIso();

    // O(P) استعلام واحد — P=عدد الخطط؛ تجميع أيام الإنجاز دون استعلام لكل خطة
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
         ${hasRestDays ? "COALESCE(p.rest_days, 'friday_saturday') AS rest_days," : "'friday_saturday' AS rest_days,"}
         COALESCE(CAST(p.is_active AS INTEGER), 1) AS is_active,
         c.name_ar AS circle_name,
         COALESCE(SUM(CASE WHEN d.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_days_raw
       FROM student_semester_plans p
       JOIN students s ON s.id = p.student_id
       ${placement.historyJoin}
       ${placement.circleJoin}
       LEFT JOIN student_plan_days d ON d.plan_id = p.id
       WHERE s.complex_id = ?
         AND ${scope.sql}
       GROUP BY p.id
       ORDER BY s.full_name_ar, p.id`,
    )
      .bind(auth.complexId, ...scope.binds)
      .all<Record<string, unknown>>();

    const items = (rows.results ?? []).map((r) => {
      const completed = Number(r.completed_days_raw) || 0;
      const meta = withPlanMeta(r, today);
      const progress = withPlanProgress(meta, completed);
      const daily = planDailyAmount({
        plan_kind: String(r.plan_kind ?? "combined"),
        daily_hifz_pages: r.daily_hifz_pages,
        daily_muraja_pages: r.daily_muraja_pages,
        daily_rabt_faces: r.daily_rabt_faces,
      });
      const achieved = progress.completed_days * daily;
      const target = progress.total_working_days * daily;
      return {
        ...progress,
        daily_amount: daily,
        achieved,
        target,
        completion_pct: progress.progress_pct,
      };
    });

    return json({ items });
  }

  if (path === "/api/teacher/plans" && request.method === "GET") {
    const placement = await buildStudentPlacementSql(env);
    const scope = await buildPlansListScope(env, auth);
    if ("unassigned" in scope) {
      return json({ items: [], scope_unassigned: true });
    }

    const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
    const today = todayRiyadhIso();
    const completedExpr = hasPlanDaysTable
      ? "COALESCE(SUM(CASE WHEN spd.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_days_raw"
      : "0 AS completed_days_raw";
    const daysJoin = hasPlanDaysTable
      ? "LEFT JOIN student_plan_days spd ON spd.plan_id = p.id"
      : "";

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
         ${hasRestDays ? "COALESCE(p.rest_days, 'friday_saturday') AS rest_days," : "'friday_saturday' AS rest_days,"}
         COALESCE(CAST(p.is_active AS INTEGER), 1) AS is_active,
         p.updated_at,
         c.name_ar AS circle_name,
         ${completedExpr}
       FROM student_semester_plans p
       JOIN students s ON s.id = p.student_id
       ${placement.historyJoin}
       ${placement.circleJoin}
       ${daysJoin}
       WHERE COALESCE(CAST(p.is_active AS INTEGER), 1) = 1
         AND s.complex_id = ?
         AND ${scope.sql}
       GROUP BY p.id
       ORDER BY s.full_name_ar, p.id`,
    )
      .bind(auth.complexId, ...scope.binds)
      .all<Record<string, unknown>>();

    const items = (rows.results ?? []).map((r) => {
      const completed = Number(r.completed_days_raw) || 0;
      return withPlanProgress(withPlanMeta(r, today), completed);
    });
    return json({ items });
  }

  if (path === "/api/teacher/plans/estimate" && request.method === "POST") {
    let body: PlanInputs & { duration_weeks?: number; rest_days?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const rawWeeks = Number(body.duration_weeks);
    if (!Number.isFinite(rawWeeks) || rawWeeks < 1) {
      return json({ error: "duration_weeks_required" }, 400);
    }
    const durationWeeks = Math.max(1, Math.floor(rawWeeks));
    const restDays = parseRestDays(body.rest_days);
    const calendar = await loadCalendar(env, auth.complexId);
    const inputs: PlanInputs = {
      daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
      daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
      daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
      repeat_target: Math.max(1, Number(body.repeat_target) || 1),
    };
    const planCal = buildPlanEstimateCalendar(calendar, durationWeeks, restDays);
    return json({
      estimate: estimatePlan(planCal, inputs),
      calendar: planCal,
    });
  }

  const planByIdDaysMatch = path.match(/^\/api\/teacher\/plans\/by-id\/(\d+)\/days$/);
  if (planByIdDaysMatch) {
    const planId = Number(planByIdDaysMatch[1]);
    if (!Number.isFinite(planId)) return json({ error: "invalid_id" }, 400);

    const existing = await loadPlanById(env, planId);
    if (!existing) return json({ error: "not_found" }, 404);

    const studentId = Number(existing.student_id);
    if (
      !(await teacherCanAccessStudent(env, auth.userId, studentId, {
        complexId: auth.complexId,
      }))
    ) {
      return json({ error: "forbidden_student" }, 403);
    }

    if (!hasPlanDaysTable) {
      return json({ error: "plan_days_unavailable" }, 503);
    }

    const startsAt = String(existing.starts_at ?? "").slice(0, 10);
    const endsAt = String(existing.ends_at ?? "").slice(0, 10);

    if (request.method === "GET") {
      const dayRows = await env.DB.prepare(
        `SELECT day_date, completed, updated_at
         FROM student_plan_days WHERE plan_id = ?
         ORDER BY day_date`,
      )
        .bind(planId)
        .all<{ day_date: string; completed: number; updated_at: string }>();

      const restDays = parseRestDays(existing.rest_days);
      const completed =
        dayRows.results?.filter((d) => Number(d.completed) === 1).length ?? 0;
      const total =
        startsAt && endsAt
          ? countWorkingDaysInRange(startsAt, endsAt, restDays)
          : 0;

      return json({
        plan_id: planId,
        starts_at: startsAt,
        ends_at: endsAt,
        rest_days: restDays,
        total_working_days: total,
        completed_days: completed,
        days: dayRows.results ?? [],
      });
    }

    if (request.method === "PUT") {
      let body: { days?: Array<{ day_date?: string; completed?: boolean | number }> };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const entries = Array.isArray(body.days) ? body.days : [];
      if (!entries.length) return json({ error: "days_required" }, 400);

      const stmts = [];
      for (const entry of entries) {
        const dayDate = String(entry.day_date ?? "").slice(0, 10);
        if (!dayDate || dayDate < startsAt || dayDate > endsAt) {
          return json({ error: "day_out_of_range", day_date: dayDate }, 400);
        }
        const completed = entry.completed ? 1 : 0;
        stmts.push(
          env.DB.prepare(
            `INSERT INTO student_plan_days (plan_id, day_date, completed, recorded_by_user_id, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(plan_id, day_date) DO UPDATE SET
               completed = excluded.completed,
               recorded_by_user_id = excluded.recorded_by_user_id,
               updated_at = datetime('now')`,
          ).bind(planId, dayDate, completed, auth.userId),
        );
      }

      await env.DB.batch(stmts);

      const dayRows = await env.DB.prepare(
        `SELECT day_date, completed FROM student_plan_days WHERE plan_id = ?`,
      )
        .bind(planId)
        .all<{ day_date: string; completed: number }>();
      const restDays = parseRestDays(existing.rest_days);
      const completedCount =
        dayRows.results?.filter((d) => Number(d.completed) === 1).length ?? 0;
      const total =
        startsAt && endsAt
          ? countWorkingDaysInRange(startsAt, endsAt, restDays)
          : 0;

      return json({
        ok: true,
        plan_id: planId,
        total_working_days: total,
        completed_days: completedCount,
      });
    }

    return json({ error: "method_not_allowed" }, 405);
  }

  const planPermanentMatch = path.match(
    /^\/api\/teacher\/plans\/by-id\/(\d+)\/permanent$/,
  );
  if (planPermanentMatch) {
    const planId = Number(planPermanentMatch[1]);
    if (!Number.isFinite(planId)) return json({ error: "invalid_id" }, 400);

    const existing = await loadPlanById(env, planId);
    if (!existing) return json({ error: "not_found" }, 404);

    const studentId = Number(existing.student_id);
    if (
      !(await teacherCanAccessStudent(env, auth.userId, studentId, {
        complexId: auth.complexId,
      }))
    ) {
      return json({ error: "forbidden_student" }, 403);
    }

    if (request.method === "DELETE") {
      // O(1) — حذف دفعي: سجلات المتابعة ثم الخطة (بدون round-trip لكل يوم)
      const stmts = [];
      if (hasPlanDaysTable) {
        stmts.push(
          env.DB.prepare(`DELETE FROM student_plan_days WHERE plan_id = ?`).bind(planId),
        );
      }
      stmts.push(
        env.DB.prepare(`DELETE FROM student_semester_plans WHERE id = ?`).bind(planId),
      );
      await env.DB.batch(stmts);
      return json({ ok: true, id: planId, deleted: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  }

  const planByIdMatch = path.match(/^\/api\/teacher\/plans\/by-id\/(\d+)$/);
  if (planByIdMatch) {
    const planId = Number(planByIdMatch[1]);
    if (!Number.isFinite(planId)) return json({ error: "invalid_id" }, 400);

    const existing = await loadPlanById(env, planId);
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
        rest_days?: string;
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

      const restDays =
        body.rest_days !== undefined
          ? parseRestDays(body.rest_days)
          : parseRestDays(existing.rest_days);
      const startsAt = String(existing.starts_at ?? todayRiyadhIso()).slice(0, 10);

      let durationWeeks =
        body.duration_weeks !== undefined
          ? Math.max(1, Math.floor(Number(body.duration_weeks) || 0))
          : Number(existing.duration_weeks) || 0;
      if (!Number.isFinite(durationWeeks) || durationWeeks < 1) {
        const prevEnds = existing.ends_at ? String(existing.ends_at).slice(0, 10) : null;
        if (prevEnds) {
          const rem = countWorkingDaysInRange(startsAt, prevEnds, restDays);
          const perWeek = workingDaysPerWeek(restDays);
          durationWeeks =
            rem > 0 && perWeek > 0 ? Math.max(1, Math.ceil(rem / perWeek)) : 1;
        } else {
          durationWeeks = 1;
        }
      }

      const calendar = await loadCalendar(env, auth.complexId);
      const estimate = estimateForPlan(calendar, inputs, durationWeeks, restDays);
      const endsAt = resolvePlanEndsAt(startsAt, durationWeeks, restDays);
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
        rest_days: restDays,
      });

      const hasDuration = await tableHasColumn(env, "student_semester_plans", "duration_weeks");
      if (hasDuration && hasRestDays) {
        await env.DB.prepare(
          `UPDATE student_semester_plans SET
             plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
             daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
             duration_weeks = ?, rest_days = ?, wizard_json = ?, updated_at = datetime('now')
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
            restDays,
            wizardJson,
            planId,
          )
          .run();
      } else if (hasDuration) {
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
        rest_days: restDays,
        days_remaining: daysRemainingRiyadh(endsAt, todayRiyadhIso(), restDays),
      });
    }

    if (request.method === "DELETE") {
      await env.DB.prepare(
        `UPDATE student_semester_plans SET is_active = 0, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(planId)
        .run();
      return json({ ok: true, id: planId, closed: true });
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
        const durationWeeks = Math.max(1, Number(primary.duration_weeks) || 1);
        const restDays = parseRestDays(primary.rest_days);
        estimate = estimateForPlan(
          calendar,
          {
            daily_hifz_pages: Number(primary.daily_hifz_pages),
            daily_muraja_pages: Number(primary.daily_muraja_pages),
            daily_rabt_faces: Number(primary.daily_rabt_faces),
            repeat_target: Number(primary.repeat_target),
          },
          durationWeeks,
          restDays,
        );
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
        rest_days?: string;
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

      const restDays = parseRestDays(body.rest_days);
      const calendar = await loadCalendar(env, auth.complexId);
      const rawWeeks = Number(body.duration_weeks);
      if (!Number.isFinite(rawWeeks) || rawWeeks < 1) {
        return json({ error: "duration_weeks_required" }, 400);
      }
      const durationWeeks = Math.max(1, Math.floor(rawWeeks));
      const estimate = estimateForPlan(calendar, inputs, durationWeeks, restDays);

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
        const endsAt = resolvePlanEndsAt(startsAt, durationWeeks, restDays);
        const wizardJson = JSON.stringify({
          ...(body.wizard_json ?? {}),
          estimate,
          duration_weeks: durationWeeks,
          rest_days: restDays,
        });

        if (hasDuration && hasRestDays) {
          await env.DB.prepare(
            `UPDATE student_semester_plans SET
               plan_kind = ?, daily_hifz_pages = ?, daily_muraja_pages = ?,
               daily_rabt_faces = ?, repeat_target = ?, ends_at = ?,
               duration_weeks = ?, rest_days = ?, wizard_json = ?, updated_at = datetime('now')
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
              restDays,
              wizardJson,
              editId,
            )
            .run();
        } else if (hasDuration) {
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
          rest_days: restDays,
          days_remaining: daysRemainingRiyadh(endsAt, todayRiyadhIso(), restDays),
        });
      }

      const startsAt = todayRiyadhIso();
      const endsAt = resolvePlanEndsAt(startsAt, durationWeeks, restDays);
      const wizardJson = JSON.stringify({
        ...(body.wizard_json ?? {}),
        estimate,
        duration_weeks: durationWeeks,
        rest_days: restDays,
      });

      const ins = hasDuration && hasRestDays
        ? await env.DB.prepare(
            `INSERT INTO student_semester_plans
             (complex_id, student_id, plan_kind, daily_hifz_pages, daily_muraja_pages,
              daily_rabt_faces, repeat_target, starts_at, ends_at, duration_weeks, rest_days,
              wizard_json, created_by_user_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
              restDays,
              wizardJson,
              auth.userId,
            )
            .run()
        : hasDuration
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
        rest_days: restDays,
        days_remaining: daysRemainingRiyadh(endsAt, todayRiyadhIso(), restDays),
      });
    }
  }

  return null;
}
