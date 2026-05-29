import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { computeCapacity } from "../lib/circle-capacity";
import {
  circleCapacityExpr,
  circleStageIdExpr,
  circleStudentCountSubquery,
  circleTrackSelectSql,
} from "../lib/admin-gm-schema";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type CircleRow = {
  id: number;
  name_ar: string;
  capacity: number;
  default_capacity: number;
  stage_id: number;
  stage: string | null;
  track_id: number | null;
  track_name: string | null;
  student_count: number;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleCirclesList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  try {
    const stageExpr = await circleStageIdExpr(env);
    const capacityExpr = await circleCapacityExpr(env);
    const track = await circleTrackSelectSql(env);
    const studentCount = await circleStudentCountSubquery(env);
    const hasStageText = await tableHasColumn(env, "circles", "stage");
    const hasIsActive = await tableHasColumn(env, "circles", "is_active");
    const hasCapacityCol = await tableHasColumn(env, "circles", "capacity");

    const capacitySelect = hasCapacityCol
      ? `COALESCE(c.capacity, ${capacityExpr})`
      : capacityExpr;

    let sql = `
      SELECT c.id, c.name_ar,
             ${capacitySelect} AS capacity,
             ${capacityExpr} AS default_capacity,
             ${stageExpr} AS stage_id,
             ${hasStageText ? "c.stage" : "NULL"} AS stage,
             ${track.trackIdCol}, ${track.trackNameCol},
             ${studentCount} AS student_count
      FROM circles c
      ${track.joinSql}
      WHERE c.complex_id = ?`;

    const binds: (string | number)[] = [auth.complexId];

    if (hasIsActive) {
      sql += ` AND COALESCE(c.is_active, 1) = 1`;
    }

    if (
      auth.role === "edu_supervisor" &&
      (await hasTable(env, "supervisor_scopes"))
    ) {
      sql += ` AND c.id IN (
        SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
      )`;
      binds.push(auth.userId);
    }

    sql += ` ORDER BY stage_id, c.name_ar`;

    const result = await env.DB.prepare(sql).bind(...binds).all<CircleRow>();

    const items = (result.results ?? []).map((r) => {
      const cap = computeCapacity(r.default_capacity ?? r.capacity, r.student_count);
      return {
        id: r.id,
        name_ar: r.name_ar,
        capacity: r.capacity,
        default_capacity: cap.default_capacity,
        track_id: r.track_id,
        track_name: r.track_name,
        stage_id: r.stage_id,
        stage: r.stage,
        student_count: cap.student_count,
        seats_remaining: cap.seats_remaining,
        near_capacity: cap.near_capacity,
        at_or_over_capacity: cap.at_or_over_capacity,
        alert_level: cap.alert_level,
      };
    });

    return json({ items });
  } catch (error: unknown) {
    console.error("[circles] list:", error);
    return json(
      {
        error: "circles_list_error",
        message:
          error instanceof Error ? error.message : "Failed to load circles",
      },
      500,
    );
  }
}
