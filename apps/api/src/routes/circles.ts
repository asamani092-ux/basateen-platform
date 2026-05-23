import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { computeCapacity } from "../lib/circle-capacity";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type CircleRow = {
  id: number;
  name_ar: string;
  capacity: number;
  default_capacity: number | null;
  track_id: number | null;
  track_name: string | null;
  stage_id: number | null;
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

  let sql = `
    SELECT c.id, c.name_ar, c.capacity,
           COALESCE(c.default_capacity, c.capacity, 20) AS default_capacity,
           c.track_id, t.name_ar AS track_name,
           COALESCE(c.stage_id, 2) AS stage_id,
           (SELECT COUNT(*) FROM student_circle_history h
            WHERE h.circle_id = c.id AND h.to_at IS NULL AND h.frozen_at IS NULL) AS student_count
    FROM circles c
    LEFT JOIN tracks t ON t.id = c.track_id
    WHERE c.complex_id = ? AND c.is_active = 1
  `;
  const binds: (string | number)[] = [auth.complexId];

  if (auth.role === "edu_supervisor") {
    sql += ` AND c.id IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  sql += ` ORDER BY t.name_ar, c.name_ar`;

  const result = await env.DB.prepare(sql).bind(...binds).all<CircleRow>();

  const items = (result.results ?? []).map((r) => {
    const cap = computeCapacity(
      r.default_capacity ?? r.capacity,
      r.student_count,
    );
    return {
      id: r.id,
      name_ar: r.name_ar,
      capacity: r.capacity,
      default_capacity: cap.default_capacity,
      track_id: r.track_id,
      track_name: r.track_name,
      stage_id: r.stage_id,
      student_count: cap.student_count,
      seats_remaining: cap.seats_remaining,
      near_capacity: cap.near_capacity,
      at_or_over_capacity: cap.at_or_over_capacity,
      alert_level: cap.alert_level,
    };
  });

  return json({ items });
}
