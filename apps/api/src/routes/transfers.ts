import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import {
  getCircleCapacity,
  capacityWarningMessage,
} from "../lib/circle-capacity";
import { canManageCircle } from "../lib/dept-scope";
import { activePlacementSql, hasTable, tableHasColumn } from "../lib/db-schema";
import { transferStudentCircle } from "../lib/edu-transfer";
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
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
      return json({ error: "forbidden" }, 403);
    }

  const studentId = parseStudentId(url);
  if (!studentId) return json({ error: "invalid_student_id" }, 400);

  const isActiveExpr = (await tableHasColumn(env, "students", "is_active"))
    ? "COALESCE(is_active, 1) = 1"
    : "1=1";
  const phoneSelect = (await tableHasColumn(env, "students", "phone"))
    ? "phone"
    : "NULL AS phone";
  const student = await env.DB.prepare(
    `SELECT id, full_name_ar, ${phoneSelect} FROM students
     WHERE id = ? AND complex_id = ? AND ${isActiveExpr}`,
  )
    .bind(studentId, auth.complexId)
    .first<{ id: number; full_name_ar: string; phone: string | null }>();

  if (!student) return json({ error: "student_not_found" }, 404);

    const hasHistory = await hasTable(env, "student_circle_history");
    const hasLegacyHistory = hasHistory && (await tableHasColumn(env, "student_circle_history", "circle_id"));
    const activePlacement = hasLegacyHistory ? await activePlacementSql(env, "h") : "1=0";
    const current = hasLegacyHistory
      ? await env.DB.prepare(
        `SELECT h.id AS history_id, h.circle_id, c.name_ar AS circle_name,
            h.track_id, t.name_ar AS track_name, h.from_at, h.to_at
     FROM student_circle_history h
     JOIN circles c ON c.id = h.circle_id
     LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.student_id = ? AND ${activePlacement}
     ORDER BY h.id DESC LIMIT 1`,
      )
        .bind(studentId)
        .first<PlacementRow>()
      : null;

  if (current && auth.role === "edu_supervisor") {
    const ok = await canManageCircle(env, auth, current.circle_id);
    if (!ok) return json({ error: "forbidden" }, 403);
  }

    const history = hasLegacyHistory
      ? await env.DB.prepare(
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
        .all<HistoryRow>()
      : { results: [] as HistoryRow[] };

    return json({
      student,
      current: current ?? null,
      history: history.results ?? [],
    });
  } catch (err) {
    console.error("student_detail_failed", err);
    return json(
      {
        error: "student_detail_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}

export async function handleStudentTransfer(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (
      !requireRoles(auth, [
        ...ADMIN_DATA_ROLES,
        "track_supervisor",
        "teacher",
      ])
    ) {
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

    const hasHistory = await hasTable(env, "student_circle_history");
    const hasLegacyHistory = hasHistory && (await tableHasColumn(env, "student_circle_history", "circle_id"));
    const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
    const activePlacement = hasLegacyHistory ? await activePlacementSql(env, "h") : "1=0";
    const current = hasLegacyHistory
      ? await env.DB.prepare(
        `SELECT h.id, h.circle_id, h.track_id FROM student_circle_history h
     WHERE h.student_id = ? AND ${activePlacement}
     ORDER BY id DESC LIMIT 1`,
      )
        .bind(studentId)
        .first<{ id: number; circle_id: number; track_id: number | null }>()
      : hasCurrentCircle
        ? await env.DB.prepare(
          `SELECT current_circle_id AS circle_id, current_track_id AS track_id
           FROM students WHERE id = ?`,
        )
          .bind(studentId)
          .first<{ circle_id: number | null; track_id: number | null }>()
        : null;

  if (current?.circle_id) {
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
    await transferStudentCircle(env, {
      studentId,
      newCircleId: targetCircleId,
      newTrackId: trackId,
      movedByUserId: auth.userId,
      reason: note,
    });

    const hasAdmission = await tableHasColumn(env, "students", "admission_status");
    if (hasAdmission) {
      await env.DB.prepare(
        `UPDATE students SET admission_status = NULL WHERE id = ? AND admission_status = 'pending_placement'`,
      )
        .bind(studentId)
        .run();
    }

    const placement = hasLegacyHistory
      ? await env.DB.prepare(
        `SELECT h.id AS history_id, c.name_ar AS circle_name, t.name_ar AS track_name,
            h.from_at, h.circle_id, h.track_id
     FROM student_circle_history h
     JOIN circles c ON c.id = h.circle_id
     LEFT JOIN tracks t ON t.id = h.track_id
     WHERE h.student_id = ? AND ${activePlacement}
     ORDER BY h.id DESC LIMIT 1`,
      )
        .bind(studentId)
        .first()
      : await env.DB.prepare(
        `SELECT s.current_circle_id AS circle_id, s.current_track_id AS track_id,
                c.name_ar AS circle_name, t.name_ar AS track_name
         FROM students s
         LEFT JOIN circles c ON c.id = s.current_circle_id
         LEFT JOIN tracks t ON t.id = s.current_track_id
         WHERE s.id = ?`,
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
  } catch (err) {
    console.error("student_transfer_failed", err);
    return json(
      {
        error: "student_transfer_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}

export async function handleStudentPatch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
      return json({ error: "forbidden" }, 403);
    }

    const studentId = parseStudentId(url);
    if (!studentId) return json({ error: "invalid_student_id" }, 400);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const isActiveExpr = (await tableHasColumn(env, "students", "is_active"))
      ? "COALESCE(is_active, 1) = 1"
      : "1=1";
    const exists = await env.DB.prepare(
      `SELECT id FROM students WHERE id = ? AND complex_id = ? AND ${isActiveExpr}`,
    )
      .bind(studentId, auth.complexId)
      .first();
    if (!exists) return json({ error: "student_not_found" }, 404);

    const allowed = [
      "full_name_ar",
      "national_id",
      "phone",
      "guardian_phone",
      "guardian_national_id",
      "school_name",
      "school_grade",
      "nationality",
      "health_notes",
      "memorization_amount",
    ] as const;
    const sets: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const col of allowed) {
      if (body[col] === undefined) continue;
      if (!(await tableHasColumn(env, "students", col))) continue;
      sets.push(`${col} = ?`);
      binds.push(
        typeof body[col] === "string" ? body[col].trim().slice(0, 500) : null,
      );
    }
    if (sets.length === 0) return json({ error: "no_fields" }, 400);
    binds.push(studentId);
    await env.DB.prepare(
      `UPDATE students SET ${sets.join(", ")} WHERE id = ?`,
    )
      .bind(...binds)
      .run();

    return json({ ok: true });
  } catch (err) {
    console.error("student_patch_failed", err);
    return json(
      {
        error: "student_patch_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}

export async function handleStudentDelete(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
      return json({ error: "forbidden" }, 403);
    }

    const studentId = parseStudentId(url);
    if (!studentId) return json({ error: "invalid_student_id" }, 400);

    const hasIsActive = await tableHasColumn(env, "students", "is_active");
    if (!hasIsActive) {
      return json({ error: "migration_required", column: "is_active" }, 503);
    }

    const row = await env.DB.prepare(
      `SELECT id FROM students WHERE id = ? AND complex_id = ?`,
    )
      .bind(studentId, auth.complexId)
      .first();
    if (!row) return json({ error: "student_not_found" }, 404);

    await env.DB.prepare(`UPDATE students SET is_active = 0 WHERE id = ?`)
      .bind(studentId)
      .run();

    return json({ ok: true });
  } catch (err) {
    console.error("student_delete_failed", err);
    return json(
      {
        error: "student_delete_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}
