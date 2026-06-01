import type { Env } from "../types";
import { syncStudentPlacementColumns } from "./admin-dept-schema";
import { hasTable, tableHasColumn } from "./db-schema";

/** O(n) statements — تجميد السجل المفتوح وإضافة حلقة جديدة (يتكيف مع مخطط flat/legacy/v25) */
export async function assignStudentCircle(
  env: Env,
  studentId: number,
  circleId: number,
  trackId: number | null,
  note: string | null,
): Promise<void> {
  const hasHistory = await hasTable(env, "student_circle_history");
  if (!hasHistory) {
    await syncStudentPlacementColumns(env, studentId, circleId, trackId);
    return;
  }

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
  if (!hasLegacyCircle) {
    await syncStudentPlacementColumns(env, studentId, circleId, trackId);
    return;
  }

  const hasHistoryTrack = await tableHasColumn(
    env,
    "student_circle_history",
    "track_id",
  );
  const hasToAt = await tableHasColumn(env, "student_circle_history", "to_at");
  const hasFrozen = await tableHasColumn(
    env,
    "student_circle_history",
    "frozen_at",
  );

  let current: { id: number; circle_id: number; track_id: number | null } | null =
    null;

  if (hasToAt) {
    const activeParts = [`student_id = ?`, `to_at IS NULL`];
    const binds: (number | string)[] = [studentId];
    if (hasFrozen) {
      activeParts.push(`frozen_at IS NULL`);
    }
    const selectCols = hasHistoryTrack
      ? "id, circle_id, track_id"
      : "id, circle_id";
    const row = await env.DB.prepare(
      `SELECT ${selectCols} FROM student_circle_history
       WHERE ${activeParts.join(" AND ")}
       ORDER BY id DESC LIMIT 1`,
    )
      .bind(...binds)
      .first<{ id: number; circle_id: number; track_id?: number | null }>();
    if (row) {
      current = {
        id: row.id,
        circle_id: row.circle_id,
        track_id: hasHistoryTrack ? (row.track_id ?? null) : null,
      };
    }
  }

  const statements: D1PreparedStatement[] = [];

  if (current) {
    const sameCircle = current.circle_id === circleId;
    const sameTrack = (current.track_id ?? null) === (trackId ?? null);
    if (sameCircle && sameTrack) {
      await syncStudentPlacementColumns(env, studentId, circleId, trackId);
      return;
    }

    if (hasToAt) {
      const freezeSets = hasFrozen
        ? `to_at = datetime('now'), frozen_at = datetime('now')`
        : `to_at = datetime('now')`;
      statements.push(
        env.DB.prepare(
          `UPDATE student_circle_history SET ${freezeSets} WHERE id = ?`,
        ).bind(current.id),
      );
    }
  }

  if (hasHistoryTrack) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO student_circle_history
          (student_id, circle_id, track_id, from_at, note)
         VALUES (?, ?, ?, datetime('now'), ?)`,
      ).bind(studentId, circleId, trackId, note),
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO student_circle_history
          (student_id, circle_id, from_at, note)
         VALUES (?, ?, datetime('now'), ?)`,
      ).bind(studentId, circleId, note),
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
  await syncStudentPlacementColumns(env, studentId, circleId, trackId);
}
