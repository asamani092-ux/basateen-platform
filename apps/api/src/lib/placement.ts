import type { Env } from "../types";
import { syncStudentPlacementColumns } from "./admin-dept-schema";
import { tableHasColumn } from "./db-schema";

/** O(n) statements — تجميد السجل المفتوح وإضافة حلقة جديدة (يتكيف مع مخطط flat/legacy) */
export async function assignStudentCircle(
  env: Env,
  studentId: number,
  circleId: number,
  trackId: number | null,
  note: string | null,
): Promise<void> {
  const hasNewCircle = await tableHasColumn(
    env,
    "student_circle_history",
    "new_circle_id",
  );
  if (hasNewCircle) {
    await env.DB.prepare(
      `INSERT INTO student_circle_history
        (student_id, new_circle_id, new_track_id, reason, moved_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
      .bind(studentId, circleId, trackId, note)
      .run();
    await syncStudentPlacementColumns(env, studentId, circleId, trackId);
    return;
  }

  const hasLegacyCircle = await tableHasColumn(
    env,
    "student_circle_history",
    "circle_id",
  );
  if (!hasLegacyCircle) return;

  const current = await env.DB.prepare(
    `SELECT id, circle_id, track_id FROM student_circle_history
     WHERE student_id = ? AND to_at IS NULL AND frozen_at IS NULL
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(studentId)
    .first<{ id: number; circle_id: number; track_id: number | null }>();

  const statements = [];

  if (current) {
    const sameCircle = current.circle_id === circleId;
    const sameTrack = (current.track_id ?? null) === (trackId ?? null);
    if (sameCircle && sameTrack) return;

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
    ).bind(studentId, circleId, trackId, note),
  );

  await env.DB.batch(statements);
  await syncStudentPlacementColumns(env, studentId, circleId, trackId);
}
