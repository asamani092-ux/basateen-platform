import type { Env } from "../types";
import { hasTable, tableHasColumn } from "../lib/db-schema";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handlePublicLiveDisplayRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/public/live-display")) return null;

  const complexId = 1;
  const date = todayIso();

  if (request.method === "GET" && path === "/api/public/live-display/metrics") {
    let presentToday = 0;
    let absentToday = 0;
    let totalFaces = 0;
    let activePledges = 0;
    const topStudents: Array<{ full_name_ar: string; metric: number; label: string }> = [];

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
          `SELECT COALESCE(SUM(face_count), 0) AS total FROM edu_daily_recitation`,
        ).first<{ total: number }>();
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

    if (await hasTable(env, "edu_daily_recitation") && await hasTable(env, "students")) {
      const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
      if (hasFace) {
        const leaders = await env.DB.prepare(
          `SELECT s.full_name_ar, COALESCE(SUM(dr.face_count), 0) AS faces
           FROM edu_daily_recitation dr
           JOIN students s ON s.id = dr.student_id
           WHERE dr.recitation_date >= date('now', '-30 days')
           GROUP BY s.id
           HAVING faces > 0
           ORDER BY faces DESC
           LIMIT 5`,
        ).all<{ full_name_ar: string; faces: number }>();
        for (const r of leaders.results ?? []) {
          topStudents.push({
            full_name_ar: r.full_name_ar,
            metric: Number(r.faces),
            label: "وجه مقروء",
          });
        }
      }
    }

    return json({
      complex_name: "مجمع حلقات البساتين",
      date,
      updated_at: new Date().toISOString(),
      metrics: {
        attendance_present_today: presentToday,
        attendance_absent_today: absentToday,
        faces_cumulative: totalFaces,
        active_pledges: activePledges,
      },
      top_students: topStudents,
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

  return json({ error: "not_found" }, 404);
}
