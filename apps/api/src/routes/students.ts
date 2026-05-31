import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { activePlacementSql, hasTable, tableHasColumn } from "../lib/db-schema";
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
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const hasHistory = await hasTable(env, "student_circle_history");
    const hasCircles = await hasTable(env, "circles");
    const hasTracks = await hasTable(env, "tracks");
    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
    const hasAdmissionStatus = await tableHasColumn(env, "students", "admission_status");
    const hasSupervisorScopes = await hasTable(env, "supervisor_scopes");
    const hasTeacherAssignments = await hasTable(env, "teacher_assignments");
    const activePlacement = hasHistory ? await activePlacementSql(env, "h") : "1=0";
    const isActiveExpr = (await tableHasColumn(env, "students", "is_active"))
      ? "COALESCE(s.is_active, 1) = 1"
      : "1=1";
    const historyJoin = hasHistory
      ? `LEFT JOIN student_circle_history h
           ON h.student_id = s.id AND ${activePlacement}`
      : "";
    const circleJoin =
      hasCircles && hasHistory
        ? `LEFT JOIN circles c ON c.id = h.circle_id`
        : hasCircles && hasCurrentCircle
          ? `LEFT JOIN circles c ON c.id = s.current_circle_id`
          : `LEFT JOIN (SELECT NULL AS id, NULL AS name_ar, NULL AS track_id) c ON 1 = 0`;
    const trackJoin =
      hasTracks && hasHistory
        ? `LEFT JOIN tracks t ON t.id = h.track_id`
        : hasTracks && hasCurrentTrack
          ? `LEFT JOIN tracks t ON t.id = s.current_track_id`
          : `LEFT JOIN (SELECT NULL AS id, NULL AS name_ar) t ON 1 = 0`;
    const circleRef = hasHistory ? "h.circle_id" : hasCurrentCircle ? "s.current_circle_id" : "NULL";

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
      } else if (hasHistory && hasSupervisorScopes) {
        sql += ` AND (
          h.circle_id IN (SELECT circle_id FROM supervisor_scopes WHERE user_id = ?)
          OR (${
            hasAdmissionStatus ? "s.admission_status = 'pending_placement' AND" : ""
          } s.stage_id IN (
            SELECT DISTINCT c.stage_id FROM supervisor_scopes ss
            JOIN circles c ON c.id = ss.circle_id WHERE ss.user_id = ?
          ))
        )`;
        binds.push(auth.userId, auth.userId);
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
