import type { Env } from "../types";
import { hasTable, tableHasColumn, historyCircleColumn, activePlacementSql } from "../lib/db-schema";
import { resolveMemorizationFields } from "../lib/quran-memorization";
import {
  buildStudentsInScopeWhere,
  loadUserScope,
  parseStageScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  STAGE_LABELS,
} from "../lib/dept-scope";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function assertStudentInScope(
  env: Env,
  complexId: number,
  scope: ScopeMode,
  studentId: number,
): Promise<boolean> {
  const scopeWhere = studentsInScopeWhere(scope);
  const row = await env.DB.prepare(
    `SELECT s.id FROM students s WHERE ${scopeWhere} AND s.id = ?`,
  )
    .bind(...studentsInScopeBinds(complexId, scope), studentId)
    .first();
  return Boolean(row);
}

export async function handleEduDeptExtendedRoutes(
  request: Request,
  env: Env,
  url: URL,
  auth: { userId: number; complexId: number },
  scope: ScopeMode,
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/api/edu-dept/dashboard") {
    const today = todayIso();
    const stageWhere = stageFilterWhere(scope, "s.stage_id");
    const binds = [auth.complexId, ...stageFilterBinds(scope)];

    const pending = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students s
       WHERE s.complex_id = ? AND s.admission_status = 'pending_placement'
         AND (${stageWhere} OR s.stage_id IS NULL)`,
    )
      .bind(...binds)
      .first<{ c: number }>();

    const activeStudents = await env.DB.prepare(
      `SELECT COUNT(DISTINCT s.id) AS c FROM students s
       WHERE ${studentsInScopeWhere(scope)}`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope))
      .first<{ c: number }>();

    const hasCompStageId = await tableHasColumn(env, "competitions", "stage_id");
    const compStageWhere = hasCompStageId
      ? scope.type === "global"
        ? "1=1"
        : `(${stageFilterWhere(scope, "c.stage_id")} OR c.stage_id IS NULL)`
      : "1=1";
    const compStageBinds = hasCompStageId && scope.type !== "global" ? stageFilterBinds(scope) : [];
    const competitions = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM competitions c
       WHERE c.complex_id = ? AND c.status = 'active'
         AND ${compStageWhere}`,
    )
      .bind(auth.complexId, ...compStageBinds)
      .first<{ c: number }>();

    const himma = await env.DB.prepare(
      `SELECT id, name_ar FROM yom_himma_sessions
       WHERE complex_id = ? AND status IN ('live', 'draft')
       ORDER BY session_date DESC LIMIT 1`,
    )
      .bind(auth.complexId)
      .first<{ id: number; name_ar: string }>();

    const marksToday = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM teacher_daily_marks tdm
       JOIN students s ON s.id = tdm.student_id
       WHERE tdm.mark_date = ? AND ${studentsInScopeWhere(scope)}`,
    )
      .bind(today, ...studentsInScopeBinds(auth.complexId, scope))
      .first<{ c: number }>();

    return json({
      today,
      scope,
      scope_label:
        scope.type === "global"
          ? "كل المجمع"
          : scope.stageIds.map((id) => STAGE_LABELS[id]).join("، "),
      kpis: {
        pending_placement: Number(pending?.c ?? 0),
        active_students: Number(activeStudents?.c ?? 0),
        active_competitions: Number(competitions?.c ?? 0),
        teacher_marks_today: Number(marksToday?.c ?? 0),
      },
      active_himma: himma ?? null,
    });
  }

  const profileMatch = path.match(/^\/api\/edu-dept\/students\/(\d+)$/);
  if (method === "GET" && profileMatch) {
    const studentId = Number(profileMatch[1]);
    if (!(await assertStudentInScope(env, auth.complexId, scope, studentId))) {
      return json({ error: "student_out_of_scope" }, 403);
    }

    const hasMemFaces = await tableHasColumn(env, "students", "memorization_faces");
    const memFacesCol = hasMemFaces ? "s.memorization_faces" : "NULL AS memorization_faces";
    const memAmountCol = (await tableHasColumn(env, "students", "memorization_amount"))
      ? "s.memorization_amount"
      : "NULL AS memorization_amount";

    const student = await env.DB.prepare(
      `SELECT s.id, s.full_name_ar, s.phone, s.stage_id, s.school_grade,
              s.admission_status, s.guardian_phone,
              ${memAmountCol}, ${memFacesCol}
       FROM students s WHERE s.id = ? AND s.complex_id = ?`,
    )
      .bind(studentId, auth.complexId)
      .first<Record<string, unknown>>();

    if (!student) return json({ error: "not_found" }, 404);

    const memorization = resolveMemorizationFields({
      memorization_faces: student.memorization_faces,
      memorization_amount: student.memorization_amount,
    });

    const current = await env.DB.prepare(
      `SELECT h.circle_id, c.name_ar AS circle_name, t.name_ar AS track_name
       FROM student_circle_history h
       JOIN circles c ON c.id = h.circle_id
       LEFT JOIN tracks t ON t.id = h.track_id
       WHERE h.student_id = ? AND h.to_at IS NULL AND h.frozen_at IS NULL
       LIMIT 1`,
    )
      .bind(studentId)
      .first();

    const eduPlan = await env.DB.prepare(
      `SELECT targets_json, notes, updated_at FROM student_edu_plans WHERE student_id = ?`,
    )
      .bind(studentId)
      .first<{ targets_json: string; notes: string | null; updated_at: string }>();

    const marks = await env.DB.prepare(
      `SELECT mark_date, score, notes, attendance_auto, logged_at
       FROM teacher_daily_marks WHERE student_id = ?
       ORDER BY mark_date DESC LIMIT 21`,
    )
      .bind(studentId)
      .all();

    const compLogs = await env.DB.prepare(
      `SELECT cl.competition_id, c.name_ar, cl.log_date, cl.metrics_json
       FROM competition_logs cl
       JOIN competitions c ON c.id = cl.competition_id
       WHERE cl.student_id = ?
       ORDER BY cl.recorded_at DESC LIMIT 30`,
    )
      .bind(studentId)
      .all();

    const hasTelemetry = await tableHasColumn(env, "competitions", "telemetry_type");
    const telemetryCol = hasTelemetry
      ? "c.telemetry_type"
      : "'intensive_routine' AS telemetry_type";
    const compSummary = await env.DB.prepare(
      `SELECT c.id, c.name_ar, ${telemetryCol}, c.start_date, c.end_date
       FROM competition_logs cl
       JOIN competitions c ON c.id = cl.competition_id
       WHERE cl.student_id = ?
       GROUP BY c.id
       ORDER BY c.end_date DESC`,
    )
      .bind(studentId)
      .all();

    return json({
      student: {
        ...student,
        memorization_faces: memorization.faces,
        memorization_amount: memorization.text,
        memorization_display: memorization.text,
      },
      current: current ?? null,
      edu_plan: eduPlan
        ? {
            targets: JSON.parse(eduPlan.targets_json || "{}"),
            notes: eduPlan.notes,
            updated_at: eduPlan.updated_at,
          }
        : { targets: {}, notes: null, updated_at: null },
      teacher_marks: marks.results ?? [],
      competition_logs: compLogs.results ?? [],
      competitions_summary: compSummary.results ?? [],
    });
  }

  const planMatch = path.match(/^\/api\/edu-dept\/students\/(\d+)\/plan$/);
  if (method === "PATCH" && planMatch) {
    const studentId = Number(planMatch[1]);
    if (!(await assertStudentInScope(env, auth.complexId, scope, studentId))) {
      return json({ error: "student_out_of_scope" }, 403);
    }

    let body: { targets?: Record<string, unknown>; notes?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const targetsJson = JSON.stringify(body.targets ?? {});

    await env.DB.prepare(
      `INSERT INTO student_edu_plans (student_id, targets_json, notes, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET
         targets_json = excluded.targets_json,
         notes = excluded.notes,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = datetime('now')`,
    )
      .bind(studentId, targetsJson, body.notes?.trim() ?? null, auth.userId)
      .run();

    return json({ ok: true });
  }

  const himmaPlanMatch = path.match(
    /^\/api\/edu-dept\/students\/(\d+)\/apply-himma-plan$/,
  );
  if (method === "POST" && himmaPlanMatch) {
    const studentId = Number(himmaPlanMatch[1]);
    let body: { session_id?: number; bonus_hizb?: number };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const sessionRow = await env.DB.prepare(
      `SELECT session_date FROM yom_himma_sessions WHERE id = ?`,
    )
      .bind(body.session_id)
      .first<{ session_date: string }>();

    const ledgerRow = sessionRow
      ? await env.DB.prepare(
          `SELECT notes FROM quran_daily_ledger
           WHERE context_type = 'yom_himma' AND context_id = ? AND student_id = ?
             AND mark_date = ?`,
        )
          .bind(body.session_id, studentId, sessionRow.session_date)
          .first<{ notes: string | null }>()
      : null;

    let audit: { hizb_done: number; juz_done: number } | null = null;
    if (ledgerRow?.notes) {
      try {
        const meta = JSON.parse(ledgerRow.notes) as {
          hizb_done?: number;
          juz_done?: number;
        };
        audit = {
          hizb_done: Number(meta.hizb_done ?? 0),
          juz_done: Number(meta.juz_done ?? 0),
        };
      } catch {
        audit = null;
      }
    }

    const existing = await env.DB.prepare(
      `SELECT targets_json FROM student_edu_plans WHERE student_id = ?`,
    )
      .bind(studentId)
      .first<{ targets_json: string }>();

    const targets = existing
      ? (JSON.parse(existing.targets_json) as Record<string, unknown>)
      : {};
    targets.himma_hizb_done = audit?.hizb_done ?? 0;
    targets.himma_juz_done = audit?.juz_done ?? 0;
    targets.last_himma_session_id = body.session_id;

    await env.DB.prepare(
      `INSERT INTO student_edu_plans (student_id, targets_json, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET
         targets_json = excluded.targets_json,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = datetime('now')`,
    )
      .bind(studentId, JSON.stringify(targets), auth.userId)
      .run();

    return json({ ok: true, targets });
  }

  if (method === "GET" && path === "/api/edu-dept/target-options") {
    let circles: Array<Record<string, unknown>> = [];
    let tracks: Array<Record<string, unknown>> = [];
    let students: Array<Record<string, unknown>> = [];

    if (await hasTable(env, "circles")) {
      const hasActive = await tableHasColumn(env, "circles", "is_active");
      const activeClause = hasActive
        ? " AND COALESCE(CAST(c.is_active AS INTEGER), 1) = 1"
        : "";
      try {
        const circleRes = await env.DB.prepare(
          `SELECT c.id, c.name_ar, c.stage_id FROM circles c
           WHERE c.complex_id = ?${activeClause}
           ORDER BY c.name_ar`,
        )
          .bind(auth.complexId)
          .all();
        circles = circleRes.results ?? [];
      } catch (err) {
        console.error("target-options circles failed:", err);
      }
    }

    if (await hasTable(env, "tracks")) {
      try {
        const trackRes = await env.DB.prepare(
          `SELECT t.id, t.name_ar FROM tracks t WHERE t.complex_id = ? ORDER BY t.name_ar`,
        )
          .bind(auth.complexId)
          .all();
        tracks = trackRes.results ?? [];
      } catch (err) {
        console.error("target-options tracks failed:", err);
      }
    }

    try {
      const scopeWhere = await buildStudentsInScopeWhere(env, scope);
      const hasCurrentCircle = await tableHasColumn(env, "students", "current_circle_id");
      let circleJoin = "LEFT JOIN circles c ON c.id = s.current_circle_id";
      if (!hasCurrentCircle) {
        const histCol = await historyCircleColumn(env, "h");
        if (histCol) {
          const active = await activePlacementSql(env, "h");
          circleJoin = `LEFT JOIN student_circle_history h ON h.student_id = s.id AND ${active}
                          LEFT JOIN circles c ON c.id = ${histCol}`;
        } else {
          circleJoin = "LEFT JOIN circles c ON 1=0";
        }
      }
      const studentRes = await env.DB.prepare(
        `SELECT s.id, s.full_name_ar, s.stage_id, c.name_ar AS circle_name
         FROM students s
         ${circleJoin}
         WHERE ${scopeWhere}
         ORDER BY s.full_name_ar LIMIT 200`,
      )
        .bind(...studentsInScopeBinds(auth.complexId, scope))
        .all();
      students = studentRes.results ?? [];
    } catch (err) {
      console.error("target-options students failed:", err);
    }

    return json({
      students,
      circles,
      tracks,
      scope,
    });
  }

  return null;
}

export function scopeLabelFromRow(supervisor_scope: string | null): string {
  const scope = parseStageScope(supervisor_scope);
  if (scope.type === "global") return "كل المجمع";
  return scope.stageIds.map((id) => STAGE_LABELS[id]).join("، ");
}
