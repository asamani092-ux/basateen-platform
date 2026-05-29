import type { Env } from "../types";
import { activePlacementSql, hasTable, tableHasColumn } from "./db-schema";

const STAGE_ID_TO_CIRCLE_STAGE: Record<number, string> = {
  1: "tlaqeen",
  2: "primary",
  3: "middle",
  4: "secondary",
};

/** Returns SQL fragment to restrict students to one circle (legacy history vs flat column). */
export async function studentCircleScopeSql(
  env: Env,
  opts?: { studentAlias?: string; historyAlias?: string },
): Promise<{
  joinSql: string;
  circlePredicate: string;
  usesFlatColumn: boolean;
}> {
  const s = opts?.studentAlias ?? "s";
  const h = opts?.historyAlias ?? "h";
  const hasCurrent = await tableHasColumn(env, "students", "current_circle_id");
  if (hasCurrent) {
    return {
      usesFlatColumn: true,
      joinSql: "",
      circlePredicate: `${s}.current_circle_id = ?`,
    };
  }

  const active = await activePlacementSql(env, h);
  return {
    usesFlatColumn: false,
    joinSql: `INNER JOIN student_circle_history ${h}
      ON ${h}.student_id = ${s}.id AND ${active} AND ${h}.circle_id = ?`,
    circlePredicate: "1=1",
  };
}

export async function validateCircleStage(
  env: Env,
  circleId: number,
  complexId: number,
  stageId: number,
): Promise<{ ok: true; circle: { id: number } } | { ok: false; error: string }> {
  const expectedStage = STAGE_ID_TO_CIRCLE_STAGE[stageId];
  const hasStageText = await tableHasColumn(env, "circles", "stage");
  const hasStageId = await tableHasColumn(env, "circles", "stage_id");

  if (hasStageText) {
    const circle = await env.DB.prepare(
      `SELECT id, stage FROM circles WHERE id = ? AND complex_id = ?`,
    )
      .bind(circleId, complexId)
      .first<{ id: number; stage: string }>();
    if (!circle) return { ok: false, error: "circle_not_found" };
    if (circle.stage !== expectedStage) {
      return { ok: false, error: "circle_stage_mismatch" };
    }
    return { ok: true, circle: { id: circle.id } };
  }

  if (hasStageId) {
    const circle = await env.DB.prepare(
      `SELECT id, stage_id FROM circles WHERE id = ? AND complex_id = ?`,
    )
      .bind(circleId, complexId)
      .first<{ id: number; stage_id: number }>();
    if (!circle) return { ok: false, error: "circle_not_found" };
    if (Number(circle.stage_id) !== stageId) {
      return { ok: false, error: "circle_stage_mismatch" };
    }
    return { ok: true, circle: { id: circle.id } };
  }

  const circle = await env.DB.prepare(
    `SELECT id FROM circles WHERE id = ? AND complex_id = ?`,
  )
    .bind(circleId, complexId)
    .first<{ id: number }>();
  if (!circle) return { ok: false, error: "circle_not_found" };
  return { ok: true, circle: { id: circle.id } };
}

export async function circleLabelRow(
  env: Env,
  circleId: number,
): Promise<{ id: number; name_ar: string; stage?: string; stage_id?: number } | null> {
  const hasStageText = await tableHasColumn(env, "circles", "stage");
  if (hasStageText) {
    return env.DB.prepare(`SELECT id, name_ar, stage FROM circles WHERE id = ?`)
      .bind(circleId)
      .first();
  }
  return env.DB.prepare(
    `SELECT id, name_ar, COALESCE(stage_id, 2) AS stage_id FROM circles WHERE id = ?`,
  )
    .bind(circleId)
    .first();
}

export async function usesFlatHistory(env: Env): Promise<boolean> {
  const cols = await tableHasColumn(env, "student_circle_history", "new_circle_id");
  return cols;
}

export async function syncStudentPlacementColumns(
  env: Env,
  studentId: number,
  circleId: number,
  trackId: number | null,
  stageId?: number,
): Promise<void> {
  if (await tableHasColumn(env, "students", "current_circle_id")) {
    const sets = ["current_circle_id = ?", "current_track_id = ?"];
    const binds: (number | null)[] = [circleId, trackId];
    if (stageId != null && (await tableHasColumn(env, "students", "stage_id"))) {
      sets.push("stage_id = ?");
      binds.push(stageId);
    }
    binds.push(studentId);
    await env.DB.prepare(
      `UPDATE students SET ${sets.join(", ")} WHERE id = ?`,
    )
      .bind(...binds)
      .run();
  }
}
