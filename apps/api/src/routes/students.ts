import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { createStudentWithPlacement } from "../lib/students-admin";
import { studentCreateBodySchema } from "../../../../packages/types/students-schema";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type StudentListRow = {
  id: number;
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  guardian_phone: string | null;
  health_notes: string | null;
  circle_name: string | null;
  track_name: string | null;
  account_status: string | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function studentColumn(env: Env, column: string, fallback = "NULL"): Promise<string> {
  return (await tableHasColumn(env, "students", column))
    ? `s.${column}`
    : `${fallback} AS ${column}`;
}

export async function handleStudentsList(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (!requireRoles(auth, [...ADMIN_DATA_ROLES, "teacher", "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "students"))) {
      return json({ error: "migration_required", table: "students" }, 503);
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const admissionStatus = url.searchParams.get("admission_status")?.trim();
    const defaultLimit = auth.role === "super_admin" ? 500 : 100;
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? defaultLimit),
      500,
    );
    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const hasAdmissionStatus = await tableHasColumn(env, "students", "admission_status");
    const hasSupervisorScopes = await hasTable(env, "supervisor_scopes");
    const hasTeacherAssignments = await hasTable(env, "teacher_assignments");
    const placement = await buildStudentPlacementSql(env);
    const { historyJoin, circleJoin, trackJoin, circleRef, historyCircleRef } =
      placement;
    const isActiveExpr = (await tableHasColumn(env, "students", "is_active"))
      ? "COALESCE(s.is_active, 1) = 1"
      : "1=1";

    let sql = `
    SELECT
      s.id,
      s.full_name_ar,
      ${await studentColumn(env, "national_id")},
      ${await studentColumn(env, "nationality")},
      ${await studentColumn(env, "phone")},
      ${await studentColumn(env, "school_name")},
      ${await studentColumn(env, "school_grade")},
      ${await studentColumn(env, "memorization_amount")},
      ${await studentColumn(env, "guardian_phone")},
      ${await studentColumn(env, "health_notes")},
      ${await studentColumn(env, "stage_id")},
      ${await studentColumn(env, "admission_status", "'active'")},
      ${await studentColumn(env, "age")},
      ${await studentColumn(env, "account_status", "'active'")},
      c.name_ar AS circle_name,
      t.name_ar AS track_name
    FROM students s
    ${historyJoin}
    ${circleJoin}
    ${trackJoin}
    WHERE s.complex_id = ? AND ${isActiveExpr}
  `;

    const binds: (string | number)[] = [auth.complexId];

    if (
      (auth.role === "teacher" || auth.role === "track_supervisor") &&
      hasTeacherAssignments
    ) {
      sql += ` AND ${circleRef} IN (
      SELECT circle_id FROM teacher_assignments WHERE user_id = ?
    )`;
      binds.push(auth.userId);
    }

    if (auth.role === "edu_supervisor") {
      if (admissionStatus === "pending_placement" && hasAdmissionStatus) {
        const scopeRow = await env.DB.prepare(
          `SELECT supervisor_scope FROM users WHERE id = ?`,
        )
          .bind(auth.userId)
          .first<{ supervisor_scope: string | null }>();
        const scope = (scopeRow?.supervisor_scope ?? "global").trim();
        sql += ` AND s.admission_status = 'pending_placement'`;
        if (scope !== "global" && scope.length > 0) {
          const ids = scope.split(",").map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= 4);
          if (ids.length > 0) {
            sql += ` AND s.stage_id IN (${ids.map(() => "?").join(",")})`;
            binds.push(...ids);
          }
        }
      } else if (hasSupervisorScopes) {
        const scopeRow = await env.DB.prepare(
          `SELECT supervisor_scope FROM users WHERE id = ?`,
        )
          .bind(auth.userId)
          .first<{ supervisor_scope: string | null }>();
        const scope = (scopeRow?.supervisor_scope ?? "global").trim();
        if (scope !== "global") {
          const scopeParts: string[] = [];
          if (hasCurrentCircle) {
            scopeParts.push(
              `s.current_circle_id IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ?)`,
            );
          }
          if (historyCircleRef) {
            scopeParts.push(
              `${historyCircleRef} IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ?)`,
            );
          }
          if (scopeParts.length > 0) {
            sql += ` AND (${scopeParts.join(" OR ")})`;
            binds.push(...scopeParts.map(() => auth.userId));
          }
        }
      }
    }

    if (
      admissionStatus &&
      hasAdmissionStatus &&
      !(auth.role === "edu_supervisor" && admissionStatus === "pending_placement")
    ) {
      sql += ` AND s.admission_status = ?`;
      binds.push(admissionStatus);
    }

    if (q.length > 0) {
      sql += ` AND s.full_name_ar LIKE ?`;
      binds.push(`%${q}%`);
    }

    sql += ` ORDER BY s.full_name_ar LIMIT ?`;
    binds.push(limit);

    const stmt = env.DB.prepare(sql);
    const result = await stmt.bind(...binds).all<StudentListRow>();

    return json({
      items: result.results ?? [],
      count: result.results?.length ?? 0,
      q: q || null,
    });
  } catch (err) {
    console.error("students_list_failed", err);
    return json({
      items: [],
      count: 0,
      q: null,
      error: "students_list_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleStudentCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "students"))) {
      return json({ error: "migration_required", table: "students" }, 503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const parsed = studentCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("student_create_validation", parsed.error.flatten());
      return json(
        { error: "validation_failed", details: parsed.error.flatten() },
        400,
      );
    }

    const data = parsed.data;

    try {
      const created = await createStudentWithPlacement(
        env,
        auth.complexId,
        {
          full_name_ar: data.full_name_ar,
          national_id: data.national_id,
          nationality: data.nationality,
          phone: data.phone,
          guardian_phone: data.guardian_phone,
          school_name: data.school_name,
          school_grade: data.school_grade,
          health_notes: data.health_notes,
          memorization_amount: data.memorization_amount,
          guardian_national_id: data.guardian_national_id,
          circle_id: data.circle_id,
          track_id: data.track_id,
        },
        auth,
      );
      return json({ ok: true, id: created.id }, 201);
    } catch (e: unknown) {
      console.error("student_create_inner", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "placement_required") {
        return json({ error: "placement_required" }, 400);
      }
      if (msg === "national_id_exists") {
        return json({ error: "national_id_exists" }, 409);
      }
      if (msg === "circle_not_found" || msg === "track_not_found") {
        return json({ error: msg }, 404);
      }
      if (msg === "forbidden_circle") {
        return json({ error: "forbidden" }, 403);
      }
      throw e;
    }
  } catch (err) {
    console.error("student_create_failed", err);
    return json(
      {
        error: "student_create_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}
