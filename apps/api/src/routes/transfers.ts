import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import {
  getCircleCapacity,
  capacityWarningMessage,
} from "../lib/circle-capacity";
import { canManageCircle } from "../lib/scope";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

type PlacementRow = {
  history_id: number;
  circle_id: number;
  circle_name: string;
  track_id: number | null;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
};

type HistoryRow = {
  id: number;
  circle_name: string;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
  frozen_at: string | null;
  note: string | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseStudentId(url: URL): number | null {
  const m = url.pathname.match(/^\/api\/students\/(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function handleStudentDetail(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const studentId = parseStudentId(url);
  if (!studentId) return json({ error: "invalid_student_id" }, 400);

  const student = await env.DB.prepare(
    `SELECT id, full_name_ar, phone FROM students
     WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(studentId, auth.complexId)
    .first<{ id: number; full_name_ar: string; phone: string | null }>();

  if (!student) return json({ error: "student_not_found" }, 404);

  const current = await env.DB.prepare(
    `SELECT h.id AS history_id, h.circle_id, c.name_ar AS circle_name,
            h.track_id, t.name_ar AS track_name, h.from_at, h.to_at
     FROM student_circle_history h
     JOIN circles c ON c.id = h.circle_id
     LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.student_id = ? AND h.to_at IS NULL AND h.frozen_at IS NULL
     ORDER BY h.id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first<PlacementRow>();

  if (current && auth.role === "edu_supervisor") {
    const ok = await canManageCircle(env, auth, current.circle_id);
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const history = await env.DB.prepare(
    `SELECT h.id, c.name_ar AS circle_name, t.name_ar AS track_name,
            h.from_at, h.to_at, h.frozen_at, h.note
     FROM student_circle_history h
     JOIN circles c ON c.id = h.circle_id
     LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.student_id = ?
     ORDER BY h.id DESC
     LIMIT 20`,
  )
    .bind(studentId)
    .all<HistoryRow>();

  return json({
    student,
    current: current ?? null,
    history: history.results ?? [],
  });
}

export async function handleStudentTransfer(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const studentId = parseStudentId(url);
  if (!studentId) return json({ error: "invalid_student_id" }, 400);

  let body: { circle_id?: number; track_id?: number | null; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const targetCircleId = Number(body.circle_id);
  if (!Number.isFinite(targetCircleId) || targetCircleId <= 0) {
    return json({ error: "circle_id_required" }, 400);
  }

  const student = await env.DB.prepare(
    `SELECT id FROM students WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(studentId, auth.complexId)
    .first<{ id: number }>();

  if (!student) return json({ error: "student_not_found" }, 404);

  const targetCircle = await env.DB.prepare(
    `SELECT id, track_id, name_ar FROM circles
     WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(targetCircleId, auth.complexId)
    .first<{ id: number; track_id: number | null; name_ar: string }>();

  if (!targetCircle) return json({ error: "circle_not_found" }, 404);

  if (!(await canManageCircle(env, auth, targetCircleId))) {
    return json({ error: "forbidden_target_circle" }, 403);
  }

  const targetCapacity = await getCircleCapacity(env, targetCircleId);
  const capacity_warning = targetCapacity
    ? capacityWarningMessage(targetCapacity)
    : null;

  const trackId =
    body.track_id != null && body.track_id !== undefined
      ? Number(body.track_id)
      : targetCircle.track_id;

  const current = await env.DB.prepare(
    `SELECT id, circle_id, track_id FROM student_circle_history
     WHERE student_id = ? AND to_at IS NULL AND frozen_at IS NULL
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first<{ id: number; circle_id: number; track_id: number | null }>();

  if (current) {
    if (!(await canManageCircle(env, auth, current.circle_id))) {
      return json({ error: "forbidden_current_circle" }, 403);
    }
    const sameCircle = current.circle_id === targetCircleId;
    const sameTrack =
      (current.track_id ?? null) === (trackId ?? null);
    if (sameCircle && sameTrack) {
      return json({ error: "already_in_circle" }, 409);
    }
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const statements = [];

  if (current) {
    statements.push(
      env.DB.prepare(
        `UPDATE student_circle_history
         SET to_at = datetime('now'), frozen_at = datetime('now')
         WHERE id = ?`,
      ).bind(current.id),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO student_circle_history
        (student_id, circle_id, track_id, from_at, note)
       VALUES (?, ?, ?, datetime('now'), ?)`,
    ).bind(studentId, targetCircleId, trackId, note),
  );

  await env.DB.batch(statements);

  await env.DB.prepare(
    `UPDATE students SET admission_status = NULL WHERE id = ? AND admission_status = 'pending_placement'`,
  )
    .bind(studentId)
    .run();

  const placement = await env.DB.prepare(
    `SELECT h.id AS history_id, c.name_ar AS circle_name, t.name_ar AS track_name,
            h.from_at, h.circle_id, h.track_id
     FROM student_circle_history h
     JOIN circles c ON c.id = h.circle_id
     LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.student_id = ? AND h.to_at IS NULL AND h.frozen_at IS NULL
     ORDER BY h.id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first();

  const afterCapacity = await getCircleCapacity(env, targetCircleId);

  return json({
    ok: true,
    message: "تم النقل التراكمي — السجل السابق مُجمّد",
    placement,
    capacity: afterCapacity,
    capacity_warning: afterCapacity
      ? capacityWarningMessage(afterCapacity)
      : capacity_warning,
  });
}
