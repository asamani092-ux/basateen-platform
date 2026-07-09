import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { createStudentWithPlacement } from "../lib/students-admin";
import { studentCreateBodySchema } from "../lib/students-schema";
import {
  hasTable,
  studentIsActiveSql,
  studentIsArchivedSql,
  tableHasColumn,
} from "../lib/db-schema";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
import { buildTeacherCircleAccessSql } from "../lib/teacher-circle";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { PAGE_SIZE_MAX, pageMeta, parsePageParams } from "../lib/pagination";

type StudentListRow = {
  id: number;
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  memorization_faces?: number | null;
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

/** Unified display name — full_name_ar with legacy `name` fallback. */
async function studentNameSelect(env: Env): Promise<string> {
  const hasFull = await tableHasColumn(env, "students", "full_name_ar");
  const hasName = await tableHasColumn(env, "students", "name");
  if (hasFull && hasName) {
    return "COALESCE(NULLIF(TRIM(s.full_name_ar), ''), s.name) AS full_name_ar";
  }
  if (hasFull) return "s.full_name_ar";
  if (hasName) return "s.name AS full_name_ar";
  return "'' AS full_name_ar";
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
    const stageFilter = url.searchParams.get("stage_id")?.trim();
    const circleFilter = url.searchParams.get("circle_id")?.trim();
    const trackFilter = url.searchParams.get("track_id")?.trim();
    const statusFilter = url.searchParams.get("status_filter")?.trim();
    const archivedOnly =
      url.searchParams.get("archived")?.trim() === "1" ||
      url.searchParams.get("active")?.trim() === "0";
    const pageParams = parsePageParams(url);
    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const hasAdmissionStatus = await tableHasColumn(env, "students", "admission_status");
    const hasSupervisorScopes = await hasTable(env, "supervisor_scopes");
    const placement = await buildStudentPlacementSql(env);
    const { historyJoin, circleJoin, trackJoin, circleRef, trackRef, historyCircleRef } =
      placement;
    const rosterExpr = archivedOnly
      ? await studentIsArchivedSql(env, "s")
      : await studentIsActiveSql(env, "s");

    const nameSelect = await studentNameSelect(env);

    let sql = `
    SELECT
      s.id,
      ${nameSelect},
      ${await studentColumn(env, "national_id")},
      ${await studentColumn(env, "nationality")},
      ${await studentColumn(env, "phone")},
      ${await studentColumn(env, "school_name")},
      ${await studentColumn(env, "school_grade")},
      ${await studentColumn(env, "memorization_amount")},
      ${await studentColumn(env, "memorization_faces")},
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
    WHERE s.complex_id = ? AND ${rosterExpr}
  `;

    const binds: (string | number)[] = [auth.complexId];

    if (auth.role === "teacher" || auth.role === "track_supervisor") {
      const teacherScope = await buildTeacherCircleAccessSql(env, circleRef);
      const scopeParts = teacherScope.split("?").length - 1;
      sql += ` AND ${teacherScope}`;
      for (let i = 0; i < scopeParts; i += 1) {
        binds.push(auth.userId);
      }
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

    if (stageFilter) {
      const stageId = Number(stageFilter);
      if (
        Number.isFinite(stageId) &&
        stageId >= 1 &&
        stageId <= 4 &&
        (await tableHasColumn(env, "students", "stage_id"))
      ) {
        sql += ` AND s.stage_id = ?`;
        binds.push(stageId);
      }
    }

    if (circleFilter) {
      const circleId = Number(circleFilter);
      if (Number.isFinite(circleId) && circleId > 0) {
        if (hasCurrentCircle) {
          sql += ` AND s.current_circle_id = ?`;
          binds.push(circleId);
        } else if (placement.historyCircleRef) {
          sql += ` AND ${placement.historyCircleRef} = ?`;
          binds.push(circleId);
        }
      }
    }

    if (trackFilter) {
      const trackId = Number(trackFilter);
      if (Number.isFinite(trackId) && trackId > 0) {
        const hasCurrentTrack = await tableHasColumn(env, "students", "current_track_id");
        if (hasCurrentTrack) {
          sql += ` AND s.current_track_id = ?`;
          binds.push(trackId);
        } else if (placement.trackRef && placement.trackRef !== "NULL") {
          sql += ` AND ${placement.trackRef} = ?`;
          binds.push(trackId);
        }
      }
    }

    if (statusFilter) {
      const hasAccountStatus = await tableHasColumn(env, "students", "account_status");
      if (statusFilter === "active" && hasAccountStatus) {
        sql += ` AND COALESCE(s.account_status, 'active') = 'active'`;
      } else if (statusFilter === "suspended" && hasAccountStatus) {
        sql += ` AND s.account_status = 'suspended'`;
      } else if (statusFilter === "no_circle") {
        if (circleRef !== "NULL") {
          sql += ` AND ${circleRef} IS NULL`;
        } else {
          sql += ` AND c.id IS NULL`;
        }
      } else if (statusFilter === "no_track") {
        if (trackRef !== "NULL") {
          sql += ` AND ${trackRef} IS NULL`;
        } else {
          sql += ` AND t.id IS NULL`;
        }
      }
    }

    if (q.length > 0) {
      if (await tableHasColumn(env, "students", "full_name_ar")) {
        sql += ` AND s.full_name_ar LIKE ?`;
      } else if (await tableHasColumn(env, "students", "name")) {
        sql += ` AND s.name LIKE ?`;
      }
      binds.push(`%${q}%`);
    }

    const orderName =
      (await tableHasColumn(env, "students", "full_name_ar"))
        ? "s.full_name_ar"
        : (await tableHasColumn(env, "students", "name"))
          ? "s.name"
          : "s.id";
    const countSql = `SELECT COUNT(*) AS c FROM (${sql})`;
    const countRow = await env.DB.prepare(countSql)
      .bind(...binds)
      .first<{ c: number }>();
    const total = Number(countRow?.c ?? 0);

    sql += ` ORDER BY ${orderName} LIMIT ? OFFSET ?`;
    binds.push(pageParams.pageSize, pageParams.offset);

    const stmt = env.DB.prepare(sql);
    const result = await stmt.bind(...binds).all<StudentListRow>();

    return json({
      items: result.results ?? [],
      count: result.results?.length ?? 0,
      q: q || null,
      page: pageMeta(total, pageParams),
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
          memorization_faces: data.memorization_faces,
          guardian_national_id: data.guardian_national_id,
          guardian_work: data.guardian_work,
          stage_id: data.stage_id,
          age: data.age,
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
