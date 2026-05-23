import type { Env } from "../types";

/** تحديث لقطة حضور اليوم من الرصد التلقائي */
export async function refreshDailyAttendanceSnapshot(
  env: Env,
  complexId: number,
  date: string,
): Promise<void> {
  const enrolled = await env.DB.prepare(
    `SELECT COUNT(DISTINCT student_id) AS c
     FROM student_circle_history
     WHERE to_at IS NULL AND frozen_at IS NULL`,
  ).first<{ c: number }>();

  const present = await env.DB.prepare(
    `SELECT COUNT(DISTINCT tdm.student_id) AS c
     FROM teacher_daily_marks tdm
     JOIN students s ON s.id = tdm.student_id
     WHERE tdm.mark_date = ? AND tdm.attendance_auto = 1 AND s.complex_id = ?`,
  )
    .bind(date, complexId)
    .first<{ c: number }>();

  const activeCircles = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM circles WHERE complex_id = ? AND is_active = 1`,
  )
    .bind(complexId)
    .first<{ c: number }>();

  const total = Number(enrolled?.c ?? 0);
  const presentCount = Number(present?.c ?? 0);
  const absentCount = Math.max(0, total - presentCount);

  const existing = await env.DB.prepare(
    `SELECT id FROM daily_attendance_snapshot
     WHERE complex_id = ? AND snapshot_date = ? LIMIT 1`,
  )
    .bind(complexId, date)
    .first<{ id: number }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE daily_attendance_snapshot
       SET present_count = ?, absent_count = ?, active_circles = ?
       WHERE id = ?`,
    )
      .bind(presentCount, absentCount, Number(activeCircles?.c ?? 0), existing.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO daily_attendance_snapshot
       (complex_id, snapshot_date, present_count, absent_count, active_circles)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        complexId,
        date,
        presentCount,
        absentCount,
        Number(activeCircles?.c ?? 0),
      )
      .run();
  }
}
