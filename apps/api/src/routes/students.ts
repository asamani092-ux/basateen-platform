import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { createStudentWithPlacement } from "../lib/students-admin";
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

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const full_name_ar =
      typeof body.full_name_ar === "string" ? body.full_name_ar.trim() : "";
    const national_id =
      typeof body.national_id === "string" ? body.national_id.trim() : "";
    const nationality =
      typeof body.nationality === "string" ? body.nationality.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const guardian_phone =
      typeof body.guardian_phone === "string" ? body.guardian_phone.trim() : "";

    if (!full_name_ar) return json({ error: "full_name_required" }, 400);
    if (!national_id) return json({ error: "national_id_required" }, 400);
    if (!nationality) return json({ error: "nationality_required" }, 400);
    if (!phone) return json({ error: "phone_required" }, 400);
    if (!guardian_phone) return json({ error: "guardian_phone_required" }, 400);

    const circle_id =
      body.circle_id != null ? Number(body.circle_id) : null;
    const track_id = body.track_id != null ? Number(body.track_id) : null;
    if (
      (!circle_id || !Number.isFinite(circle_id)) &&
      (!track_id || !Number.isFinite(track_id))
    ) {
      return json({ error: "placement_required", message: "اختر حلقة أو مساراً" }, 400);
    }

    try {
      const created = await createStudentWithPlacement(
        env,
        auth.complexId,
        {
          full_name_ar,
          national_id,
          nationality,
          phone,
          guardian_phone,
          school_name:
            typeof body.school_name === "string" ? body.school_name : null,
          school_grade:
            typeof body.school_grade === "string" ? body.school_grade : null,
          health_notes:
            typeof body.health_notes === "string" ? body.health_notes : null,
          memorization_amount:
            typeof body.memorization_amount === "string"
              ? body.memorization_amount
              : null,
          guardian_national_id:
            typeof body.guardian_national_id === "string"
              ? body.guardian_national_id
              : null,
          circle_id: Number.isFinite(circle_id) ? circle_id : null,
          track_id: Number.isFinite(track_id) ? track_id : null,
        },
        auth,
      );
      return json({ ok: true, id: created.id }, 201);
    } catch (e: unknown) {
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
