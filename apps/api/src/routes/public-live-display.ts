import type { Env } from "../types";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { todayRiyadhIso } from "../lib/today-riyadh-iso";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}


async function loadSlideSeconds(env: Env, complexId: number): Promise<number> {
  if (!(await hasTable(env, "complex_settings"))) return 12;
  if (await tableHasColumn(env, "complex_settings", "display_slide_seconds")) {
    const row = await env.DB.prepare(
      `SELECT display_slide_seconds FROM complex_settings WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first<{ display_slide_seconds: number }>();
    const n = Number(row?.display_slide_seconds ?? 12);
    return n >= 3 && n <= 120 ? n : 12;
  }
  return 12;
}

async function loadMetrics(env: Env, complexId: number, date: string) {
  let presentToday = 0;
  let absentToday = 0;
  let totalFaces = 0;
  let activePledges = 0;
  let totalCircles = 0;
  let totalTracks = 0;
  let totalStudents = 0;
  const studentsByStage: Array<{ stage_id: number; label: string; count: number }> = [];

  if (await hasTable(env, "daily_attendance_snapshot")) {
    const snap = await env.DB.prepare(
      `SELECT present_count, absent_count FROM daily_attendance_snapshot
       WHERE complex_id = ? ORDER BY id DESC LIMIT 1`,
    )
      .bind(complexId)
      .first<{ present_count: number; absent_count: number }>();
    presentToday = Number(snap?.present_count ?? 0);
    absentToday = Number(snap?.absent_count ?? 0);
  } else if (await hasTable(env, "student_attendance")) {
    const rows = await env.DB.prepare(
      `SELECT status, COUNT(*) AS c FROM student_attendance
       WHERE complex_id = ? AND attendance_date = ?
       GROUP BY status`,
    )
      .bind(complexId, date)
      .all<{ status: string; c: number }>();
    for (const r of rows.results ?? []) {
      if (r.status === "present") presentToday += Number(r.c);
      if (r.status === "absent") absentToday += Number(r.c);
    }
  }

  if (await hasTable(env, "edu_daily_recitation")) {
    const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
    if (hasFace) {
      const faceRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(dr.face_count), 0) AS total
         FROM edu_daily_recitation dr
         JOIN students s ON s.id = dr.student_id
         WHERE s.complex_id = ?`,
      )
        .bind(complexId)
        .first<{ total: number }>();
      totalFaces = Number(faceRow?.total ?? 0);
    }
  }

  if (await hasTable(env, "student_pledges")) {
    const pledgeRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM student_pledges WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    activePledges = Number(pledgeRow?.c ?? 0);
  }

  if (await hasTable(env, "circles")) {
    const cRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM circles WHERE complex_id = ? AND is_active = 1`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    totalCircles = Number(cRow?.c ?? 0);
  }

  if (await hasTable(env, "tracks")) {
    const hasActive = await tableHasColumn(env, "tracks", "is_active");
    const tRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM tracks WHERE complex_id = ?${hasActive ? " AND is_active = 1" : ""}`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    totalTracks = Number(tRow?.c ?? 0);
  }

  if (await hasTable(env, "students")) {
    const sRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students WHERE complex_id = ? AND is_active = 1`,
    )
      .bind(complexId)
      .first<{ c: number }>();
    totalStudents = Number(sRow?.c ?? 0);

    if (await tableHasColumn(env, "students", "stage_id")) {
      const stageRows = await env.DB.prepare(
        `SELECT stage_id, COUNT(*) AS c FROM students
         WHERE complex_id = ? AND is_active = 1
         GROUP BY stage_id ORDER BY stage_id`,
      )
        .bind(complexId)
        .all<{ stage_id: number; c: number }>();
      const labels: Record<number, string> = {
        1: "تمهيدي",
        2: "ابتدائي",
        3: "متوسط",
        4: "ثانوي",
      };
      for (const r of stageRows.results ?? []) {
        studentsByStage.push({
          stage_id: Number(r.stage_id),
          label: labels[Number(r.stage_id)] ?? `مرحلة ${r.stage_id}`,
          count: Number(r.c),
        });
      }
    }
  }

  return {
    attendance_present_today: presentToday,
    attendance_absent_today: absentToday,
    faces_cumulative: totalFaces,
    active_pledges: activePledges,
    total_circles: totalCircles,
    total_tracks: totalTracks,
    total_students: totalStudents,
    students_by_stage: studentsByStage,
  };
}

export async function handlePublicLiveDisplayRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/public/live-display")) return null;

  const complexId = 1;
  const date = todayRiyadhIso();
  const slideSeconds = await loadSlideSeconds(env, complexId);
  const metrics = await loadMetrics(env, complexId, date);

  if (request.method === "GET" && path === "/api/public/live-display/metrics") {
    return json({
      complex_name: "مجمع حلقات بساتين",
      date,
      updated_at: new Date().toISOString(),
      slide_seconds: slideSeconds,
      metrics,
      top_students: [],
    });
  }

  if (request.method === "GET" && path === "/api/public/live-display/media") {
    if (!(await hasTable(env, "display_media"))) {
      return json({ items: [] });
    }
    const rows = await env.DB.prepare(
      `SELECT id, media_type, media_url, display_order
       FROM display_media
       WHERE complex_id = ? AND is_active = 1
       ORDER BY display_order ASC, id ASC`,
    )
      .bind(complexId)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (request.method === "GET" && path === "/api/public/live-display/carousel") {
    const slides: Array<Record<string, unknown>> = [
      { kind: "metrics", id: "metrics-main", metrics },
    ];

    if (await hasTable(env, "display_media")) {
      const rows = await env.DB.prepare(
        `SELECT id, media_type, media_url, display_order
         FROM display_media
         WHERE complex_id = ? AND is_active = 1
         ORDER BY display_order ASC, id ASC`,
      )
        .bind(complexId)
        .all<{ id: number; media_type: string; media_url: string; display_order: number }>();
      for (const row of rows.results ?? []) {
        slides.push({
          kind: row.media_type,
          id: row.id,
          media_url: row.media_url,
          display_order: row.display_order,
        });
      }
    }

    return json({
      complex_name: "مجمع حلقات بساتين",
      slide_seconds: slideSeconds,
      slides,
    });
  }

  return json({ error: "not_found" }, 404);
}
