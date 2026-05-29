import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import { assignStudentCircle } from "./placement";
import { syncStudentPlacementColumns } from "./admin-dept-schema";

/** نقل تراكمي: تحديث current_* + سجل في student_circle_history (transaction) */
export async function transferStudentCircle(
  env: Env,
  opts: {
    studentId: number;
    newCircleId: number;
    newTrackId: number | null;
    movedByUserId: number;
    reason: string | null;
  },
): Promise<void> {
  const { studentId, newCircleId, newTrackId, movedByUserId, reason } = opts;
  const hasFlat = await tableHasColumn(
    env,
    "student_circle_history",
    "new_circle_id",
  );

  if (hasFlat) {
    const current = await env.DB.prepare(
      `SELECT current_circle_id, current_track_id FROM students WHERE id = ?`,
    )
      .bind(studentId)
      .first<{
        current_circle_id: number | null;
        current_track_id: number | null;
      }>();

    const circle = await env.DB.prepare(
      `SELECT track_id FROM circles WHERE id = ?`,
    )
      .bind(newCircleId)
      .first<{ track_id: number | null }>();

    const trackId =
      newTrackId ?? circle?.track_id ?? current?.current_track_id ?? null;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO student_circle_history
          (student_id, old_circle_id, new_circle_id, old_track_id, new_track_id, moved_by_user_id, reason, moved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        studentId,
        current?.current_circle_id ?? null,
        newCircleId,
        current?.current_track_id ?? null,
        trackId,
        movedByUserId,
        reason,
      ),
      env.DB.prepare(
        `UPDATE students SET current_circle_id = ?, current_track_id = ? WHERE id = ?`,
      ).bind(newCircleId, trackId, studentId),
    ]);
    return;
  }

  await assignStudentCircle(env, studentId, newCircleId, newTrackId, reason);
  await syncStudentPlacementColumns(env, studentId, newCircleId, newTrackId);
}
