import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";
import { resolveCircleTrackId } from "./circle-track";
import { assignStudentCircle } from "./placement";
import { syncStudentPlacementColumns } from "./admin-dept-schema";

type TransferOpts = {
  studentId: number;
  newCircleId: number;
  newTrackId: number | null;
  movedByUserId: number;
  reason: string | null;
  complexId?: number;
};

/** نقل مسار خفيف — تحديث current_track_id فقط (متكرر وسريع) */
export async function transferStudentTrack(
  env: Env,
  opts: {
    studentId: number;
    newTrackId: number | null;
    movedByUserId: number;
    reason?: string | null;
  },
): Promise<void> {
  const { studentId, newTrackId, movedByUserId, reason } = opts;
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

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO student_circle_history
          (student_id, old_circle_id, new_circle_id, old_track_id, new_track_id, moved_by_user_id, reason, moved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        studentId,
        current?.current_circle_id ?? null,
        current?.current_circle_id ?? null,
        current?.current_track_id ?? null,
        newTrackId,
        movedByUserId,
        reason ?? "تحديث مسار",
      ),
      env.DB.prepare(
        `UPDATE students SET current_track_id = ? WHERE id = ?`,
      ).bind(newTrackId, studentId),
    ]);
    return;
  }

  await env.DB.prepare(`UPDATE students SET current_track_id = ? WHERE id = ?`)
    .bind(newTrackId, studentId)
    .run();
}

/** نقل تراكمي: تحديث current_* + سجل في student_circle_history — لا يمس سجلات التحضير/التقييم السابقة */
export async function transferStudentCircle(
  env: Env,
  opts: TransferOpts,
): Promise<void> {
  const { studentId, newCircleId, newTrackId, movedByUserId, reason, complexId } =
    opts;
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

    const resolvedTrack = await resolveCircleTrackId(
      env,
      newCircleId,
      complexId,
      newTrackId,
    );
    const trackId = resolvedTrack ?? newTrackId ?? current?.current_track_id ?? null;

    if (
      current?.current_circle_id === newCircleId &&
      trackId !== current?.current_track_id
    ) {
      await transferStudentTrack(env, {
        studentId,
        newTrackId: trackId,
        movedByUserId,
        reason: reason ?? "تحديث مسار داخل نفس الحلقة",
      });
      return;
    }

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

  const resolvedTrack = await resolveCircleTrackId(
    env,
    newCircleId,
    complexId,
    newTrackId,
  );
  await assignStudentCircle(env, studentId, newCircleId, resolvedTrack, reason);
  await syncStudentPlacementColumns(
    env,
    studentId,
    newCircleId,
    resolvedTrack,
  );
}

/** نقل مسار فقط عند بقاء الحلقة — واجهة يدوية خفيفة */
export async function transferStudentPlacement(
  env: Env,
  opts: TransferOpts & { trackOnly?: boolean },
): Promise<void> {
  if (opts.trackOnly) {
    await transferStudentTrack(env, {
      studentId: opts.studentId,
      newTrackId: opts.newTrackId,
      movedByUserId: opts.movedByUserId,
      reason: opts.reason,
    });
    return;
  }
  await transferStudentCircle(env, opts);
}
