import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type CircleRow = {
  id: number;
  name_ar: string;
  capacity: number;
  track_id: number | null;
  track_name: string | null;
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
  if (!requireRoles(auth, ["general_manager", "supervisor"])) {
    return json({ error: "forbidden" }, 403);
  }

  let sql = `
    SELECT c.id, c.name_ar, c.capacity, c.track_id, t.name_ar AS track_name
    FROM circles c
    LEFT JOIN tracks t ON t.id = c.track_id
    WHERE c.complex_id = ? AND c.is_active = 1
  `;
  const binds: (string | number)[] = [auth.complexId];

  if (auth.role === "supervisor") {
    sql += ` AND c.id IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  sql += ` ORDER BY t.name_ar, c.name_ar`;

  const result = await env.DB.prepare(sql).bind(...binds).all<CircleRow>();

  return json({ items: result.results ?? [] });
}
