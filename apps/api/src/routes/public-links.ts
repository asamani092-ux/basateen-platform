import type { Env } from "../types";
import { hasTable, studentIsActiveSql } from "../lib/db-schema";
import {
  isSharedTokenUsable,
  loadSharedToken,
  parseMagicContext,
  resolveMagicGroupId,
  touchSharedTokenUse,
} from "../lib/magic-link";
import { batchSaveStudentAttendance } from "../lib/attendance-batch";
import type { AttendanceStatus } from "../lib/student-attendance-db";

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

type ResolvedAttendanceLink = {
  row: Awaited<ReturnType<typeof loadSharedToken>> & object;
  attendanceDate: string;
  groupType: "circle" | "track";
  groupId: number;
  circle: { id: number; name_ar: string; stage?: string } | null;
  track: { id: number; name_ar: string } | null;
};

async function resolveAttendanceToken(
  env: Env,
  token: string,
): Promise<{ data: ResolvedAttendanceLink } | { error: Response }> {
  if (!(await hasTable(env, "shared_access_tokens"))) {
    return { error: json({ error: "migration_required" }, 503) };
  }

  const row = await loadSharedToken(env, token);
  if (!row) return { error: json({ error: "invalid_token" }, 404) };
  if (!isSharedTokenUsable(row)) {
    return { error: json({ error: "link_inactive" }, 403) };
  }
  if (row.feature_name !== "student_attendance") {
    return { error: json({ error: "unsupported_feature" }, 400) };
  }

  const ctx = parseMagicContext(row.context_data);
  const { groupType, groupId } = resolveMagicGroupId(ctx);
  if (groupId == null) {
    return { error: json({ error: "invalid_link_context" }, 500) };
  }

  const attendanceDate = todayIso();

  if (groupType === "track") {
    const track = await env.DB.prepare(
      `SELECT id, name_ar, complex_id FROM tracks
       WHERE id = ? AND complex_id = ?`,
    )
      .bind(groupId, row.complex_id)
      .first<{ id: number; name_ar: string; complex_id: number }>();
    if (!track) return { error: json({ error: "track_not_found" }, 404) };
    return {
      data: {
        row,
        attendanceDate,
        groupType: "track",
        groupId,
        circle: null,
        track: { id: track.id, name_ar: track.name_ar },
      },
    };
  }

  const circle = await env.DB.prepare(
    `SELECT id, name_ar, stage, complex_id FROM circles
     WHERE id = ? AND complex_id = ? AND is_active = 1`,
  )
    .bind(groupId, row.complex_id)
    .first<{ id: number; name_ar: string; stage: string; complex_id: number }>();
  if (!circle) return { error: json({ error: "circle_not_found" }, 404) };

  return {
    data: {
      row,
      attendanceDate,
      groupType: "circle",
      groupId,
      circle: { id: circle.id, name_ar: circle.name_ar, stage: circle.stage },
      track: null,
    },
  };
}

async function loadStudentsForMagicLink(
  env: Env,
  resolved: ResolvedAttendanceLink,
): Promise<unknown[]> {
  const isActiveExpr = await studentIsActiveSql(env, "s");
  const placementCol =
    resolved.groupType === "track" ? "current_track_id" : "current_circle_id";

  const students = await env.DB.prepare(
    `SELECT s.id AS student_id, s.full_name_ar,
            COALESCE(sa.status, 'present') AS status,
            sa.recorded_at
     FROM students s
     LEFT JOIN student_attendance sa
       ON sa.student_id = s.id AND sa.attendance_date = ?
     WHERE s.complex_id = ? AND ${isActiveExpr} AND s.${placementCol} = ?
     ORDER BY s.full_name_ar`,
  )
    .bind(resolved.attendanceDate, resolved.row.complex_id, resolved.groupId)
    .all();

  return students.results ?? [];
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
    if ("error" in resolved) return resolved.error;
    const { data } = resolved;

    const items = await loadStudentsForMagicLink(env, data);
    await touchSharedTokenUse(env, data.row.id);

    return json({
      token,
      feature_name: data.row.feature_name,
      entity_type: data.groupType,
      attendance_date: data.attendanceDate,
      circle: data.circle,
      track: data.track,
      items,
      default_status: "present",
      read_only: data.row.is_active !== 1,
    });
  }

  if (request.method === "POST") {
    const resolved = await resolveAttendanceToken(env, token);
    if ("error" in resolved) return resolved.error;
    const { data } = resolved;

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

    const isActiveExpr = await studentIsActiveSql(env, "");
    const placementCol =
      data.groupType === "track" ? "current_track_id" : "current_circle_id";
    const allowedRows = await env.DB.prepare(
      `SELECT id FROM students
       WHERE complex_id = ? AND ${isActiveExpr} AND ${placementCol} = ?`,
    )
      .bind(data.row.complex_id, data.groupId)
      .all<{ id: number }>();
    const allowedIds = new Set((allowedRows.results ?? []).map((r) => r.id));

    const batchRecords = records
      .map((rec) => {
        const studentId = Number(rec.student_id);
        const status = parseStatus(rec.status);
        if (!Number.isFinite(studentId) || !status || !allowedIds.has(studentId)) {
          return null;
        }
        return {
          student_id: studentId,
          status,
          notes: rec.notes?.trim() ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const saved = await batchSaveStudentAttendance(env, {
      complexId: data.row.complex_id,
      attendanceDate: data.attendanceDate,
      circleId: data.groupType === "circle" ? data.groupId : null,
      trackId: data.groupType === "track" ? data.groupId : null,
      source: "magic_link",
      recordedByUserId: null,
      sharedTokenId: data.row.id,
      records: batchRecords,
    });

    await touchSharedTokenUse(env, data.row.id);

    return json({
      ok: true,
      saved,
      attendance_date: data.attendanceDate,
      entity_type: data.groupType,
      circle_id: data.circle?.id ?? null,
      circle_name: data.circle?.name_ar ?? null,
      track_id: data.track?.id ?? null,
      track_name: data.track?.name_ar ?? null,
    });
  }

  return json({ error: "method_not_allowed" }, 405);
}
