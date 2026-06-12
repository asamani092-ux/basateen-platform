import type { Env } from "../types";
import {
  buildSemesterCalendar,
  estimatePlan,
  type PlanInputs,
} from "../lib/plan-estimator";
import { teacherCanAccessStudent } from "../lib/dept-scope";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

const TEACHER_ROLES = ["teacher"] as const;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
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

export async function handleTeacherRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/teacher/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...TEACHER_ROLES])) {
    return json({ error: "forbidden" }, 403);
  }

  if (path === "/api/teacher/calendar" && request.method === "GET") {
    const calendar = await loadCalendar(env, auth.complexId);
    return json(calendar);
  }

  if (path === "/api/teacher/plans" && request.method === "GET") {
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
         p.updated_at,
         c.name_ar AS circle_name
       FROM student_semester_plans p
       JOIN students s ON s.id = p.student_id
       JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       LEFT JOIN circles c ON c.id = h.circle_id
       JOIN teacher_assignments ta ON ta.circle_id = h.circle_id AND ta.user_id = ?
       WHERE p.is_active = 1 AND s.complex_id = ?
       ORDER BY s.full_name_ar`,
    )
      .bind(auth.userId, auth.complexId)
      .all();

    return json({ items: rows.results ?? [] });
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
      const plan = await env.DB.prepare(
        `SELECT * FROM student_semester_plans
         WHERE student_id = ? AND is_active = 1
         ORDER BY id DESC LIMIT 1`,
      )
        .bind(studentId)
        .first<Record<string, unknown>>();

      const calendar = await loadCalendar(env, auth.complexId);
      let estimate = null;
      if (plan) {
        estimate = estimatePlan(calendar, {
          daily_hifz_pages: Number(plan.daily_hifz_pages),
          daily_muraja_pages: Number(plan.daily_muraja_pages),
          daily_rabt_faces: Number(plan.daily_rabt_faces),
          repeat_target: Number(plan.repeat_target),
        });
      }

      return json({ plan: plan ?? null, calendar, estimate });
    }

    if (request.method === "PUT") {
      let body: {
        plan_kind?: string;
        daily_hifz_pages?: number;
        daily_muraja_pages?: number;
        daily_rabt_faces?: number;
        repeat_target?: number;
        starts_at?: string;
        ends_at?: string | null;
        wizard_json?: Record<string, unknown>;
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
      const startsAt =
        body.starts_at?.trim() || new Date().toISOString().slice(0, 10);
      const wizardJson = JSON.stringify({
        ...(body.wizard_json ?? {}),
        estimate,
      });

      await env.DB.prepare(
        `UPDATE student_semester_plans SET is_active = 0, updated_at = datetime('now')
         WHERE student_id = ? AND is_active = 1`,
      )
        .bind(studentId)
        .run();

      const ins = await env.DB.prepare(
        `INSERT INTO student_semester_plans
         (complex_id, student_id, plan_kind, daily_hifz_pages, daily_muraja_pages,
          daily_rabt_faces, repeat_target, starts_at, ends_at, wizard_json, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          body.ends_at?.trim() ?? null,
          wizardJson,
          auth.userId,
        )
        .run();

      return json({
        ok: true,
        id: ins.meta.last_row_id,
        estimate,
      });
    }
  }

  return null;
}
