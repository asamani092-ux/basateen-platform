import type { Env } from "../types";
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

export async function handleStudentsList(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!requireRoles(auth, ["general_manager", "supervisor", "teacher"])) {
    return json({ error: "forbidden" }, 403);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  let sql = `
    SELECT
      s.id,
      s.full_name_ar,
      s.national_id,
      s.nationality,
      s.phone,
      s.school_name,
      s.school_grade,
      s.memorization_amount,
      s.guardian_phone,
      s.health_notes,
      c.name_ar AS circle_name,
      t.name_ar AS track_name
    FROM students s
    LEFT JOIN student_circle_history h
      ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
    LEFT JOIN circles c ON c.id = h.circle_id
    LEFT JOIN tracks t ON t.id = h.track_id
    WHERE s.complex_id = ? AND s.is_active = 1
  `;

  const binds: (string | number)[] = [auth.complexId];

  if (auth.role === "teacher") {
    sql += ` AND h.circle_id IN (
      SELECT circle_id FROM teacher_assignments WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  if (auth.role === "supervisor") {
    sql += ` AND h.circle_id IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
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
}
