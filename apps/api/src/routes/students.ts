import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { error, json } from "../utils/response";

export async function handleStudents(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (pathname !== "/api/students" || request.method !== "GET") {
    return error("Not Found", 404);
  }

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return error("غير مصرح", 401);

  if (
    !requireRoles(auth, [
      "general_manager",
      "supervisor",
      "teacher",
    ])
  ) {
    return error("صلاحية غير كافية", 403);
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const complexId = auth.complexId;

  let query = `
    SELECT s.id, s.full_name_ar, s.national_id, s.is_active,
           c.name_ar AS circle_name, t.name_ar AS track_name
    FROM students s
    LEFT JOIN circles c ON c.id = s.current_circle_id
    LEFT JOIN tracks t ON t.id = s.current_track_id
    WHERE s.complex_id = ? AND s.is_active = 1
  `;
  const binds: (string | number)[] = [complexId];

  if (q) {
    query += ` AND (s.full_name_ar LIKE ? OR s.national_id LIKE ?)`;
    const like = `%${q}%`;
    binds.push(like, like);
  }

  if (auth.role === "teacher") {
    query += ` AND s.current_circle_id IN (
      SELECT circle_id FROM teacher_assignments WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  if (auth.role === "supervisor") {
    query += ` AND s.current_circle_id IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  query += ` ORDER BY s.full_name_ar LIMIT 100`;

  const stmt = env.DB.prepare(query);
  const { results } = await stmt.bind(...binds).all();

  return json({ students: results ?? [] });
}
