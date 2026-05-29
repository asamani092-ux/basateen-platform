import type { Env } from "../types";
import { hasTable } from "../lib/db-schema";
import {
  isSharedTokenUsable,
  loadSharedToken,
  parseMagicContext,
  touchSharedTokenUse,
} from "../lib/magic-link";
import {
  upsertStudentAttendance,
  type AttendanceStatus,
} from "../lib/student-attendance-db";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseStatus(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? "").trim();
  if (s === "present" || s === "absent" || s === "excused") return s;
  return null;
}

async function resolveAttendanceToken(env: Env, token: string) {
  if (!(await hasTable(env, "shared_access_tokens"))) {
    return { error: json({ error: "migration_required" }, 503) as Response };
  }

  const row = await loadSharedToken(env, token);
  if (!row) return { error: json({ error: "invalid_token" }, 404) as Response };
  if (!isSharedTokenUsable(row)) {
    return { error: json({ error: "link_inactive" }, 403) as Response };
  }
  if (row.feature_name !== "student_attendance") {
    return { error: json({ error: "unsupported_feature" }, 400) as Response };
  }

  const ctx = parseMagicContext(row.context_data);
  const circleId = Number(ctx.circle_id);
  if (!Number.isFinite(circleId)) {
    return { error: json({ error: "invalid_link_context" }, 500) as Response };
  }

  const attendanceDate = ctx.attendance_date?.trim() || todayIso();

  const circle = await env.DB.prepare(
    `SELECT id, name_ar, stage, complex_id FROM circles
     WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(circleId, row.complex_id)
    .first<{ id: number; name_ar: string; stage: string; complex_id: number }>();

  if (!circle) return { error: json({ error: "circle_not_found" }, 404) as Response };

  return { row, circle, attendanceDate, circleId };
}

export async function handlePublicLinksRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/public\/attendance\/([^/]+)$/);
  if (!match) return null;

  const token = decodeURIComponent(match[1]);

  if (request.method === "GET") {
    const resolved = await resolveAttendanceToken(env, token);
    if ("error" in resolved && resolved.error) return resolved.error;
    const { row, circle, attendanceDate, circleId } = resolved;

    const students = await env.DB.prepare(
      `SELECT s.id AS student_id, s.full_name_ar,
              COALESCE(sa.status, 'present') AS status,
              sa.recorded_at
       FROM students s
       LEFT JOIN student_attendance sa
         ON sa.student_id = s.id AND sa.attendance_date = ?
       WHERE s.complex_id = ? AND s.is_active = 1 AND s.current_circle_id = ?
       ORDER BY s.full_name_ar`,
    )
      .bind(attendanceDate, row.complex_id, circleId)
      .all();

    await touchSharedTokenUse(env, row.id);

    return json({
      token,
      feature_name: row.feature_name,
      attendance_date: attendanceDate,
      circle,
      items: students.results ?? [],
      default_status: "present",
      read_only: row.is_active !== 1,
    });
  }

  if (request.method === "POST") {
    const resolved = await resolveAttendanceToken(env, token);
    if ("error" in resolved && resolved.error) return resolved.error;
    const { row, circle, attendanceDate, circleId } = resolved;

    let body: {
      records?: Array<{ student_id?: number; status?: string; notes?: string }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const records = body.records ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "records_required" }, 400);
    }

    let saved = 0;
    for (const rec of records) {
      const studentId = Number(rec.student_id);
      const status = parseStatus(rec.status);
      if (!Number.isFinite(studentId) || !status) continue;

      const allowed = await env.DB.prepare(
        `SELECT id FROM students
         WHERE id = ? AND complex_id = ? AND is_active = 1 AND current_circle_id = ?`,
      )
        .bind(studentId, row.complex_id, circleId)
        .first();

      if (!allowed) continue;

      if (status === "present") {
        await env.DB.prepare(
          `DELETE FROM student_attendance WHERE student_id = ? AND attendance_date = ?`,
        )
          .bind(studentId, attendanceDate)
          .run();
        saved++;
        continue;
      }

      await upsertStudentAttendance(env, {
        complexId: row.complex_id,
        studentId,
        attendanceDate,
        status,
        source: "magic_link",
        circleId,
        sharedTokenId: row.id,
        recordedByUserId: null,
        notes: rec.notes?.trim() ?? null,
      });
      saved++;
    }

    await touchSharedTokenUse(env, row.id);

    return json({
      ok: true,
      saved,
      attendance_date: attendanceDate,
      circle_id: circle.id,
      circle_name: circle.name_ar,
    });
  }

  return json({ error: "method_not_allowed" }, 405);
}
