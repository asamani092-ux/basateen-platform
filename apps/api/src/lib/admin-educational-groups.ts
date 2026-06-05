/**
 * Unified educational groups (circles + tracks) — tables from 023_rebuild_v25.sql.
 */
import type { Env } from "../types";
import {
  computeCapacity,
  capacityWarningMessage,
} from "./circle-capacity";
import {
  circleCapacityExpr,
  circleIsActiveSelectExpr,
  circleStageIdExpr,
  circleStudentCountSubquery,
  circleTeacherJoinSql,
  circleTrackSelectSql,
} from "./admin-gm-schema";
import { hasTable, tableHasColumn } from "./db-schema";
import { SOVEREIGN_USER_ID } from "./admin-staff";

export type EducationalEntityType = "circle" | "track";

export type EducationalGroupRow = {
  id: number;
  entity_type: EducationalEntityType;
  name_ar: string;
  assignee_name: string | null;
  assignee_id: number | null;
  student_count: number;
  default_capacity: number;
  is_active: number;
  stage_id?: number;
  capacity_warning?: string | null;
  stage_ids?: number[];
};

export async function fetchEducationalGroups(
  env: Env,
  complexId: number,
): Promise<EducationalGroupRow[]> {
  const items: EducationalGroupRow[] = [];

  const stageExpr = await circleStageIdExpr(env);
  const capacityExpr = await circleCapacityExpr(env);
  const isActiveExpr = await circleIsActiveSelectExpr(env);
  const track = await circleTrackSelectSql(env);
  const teacher = await circleTeacherJoinSql(env);
  const studentCount = await circleStudentCountSubquery(env);

  if (await hasTable(env, "circles")) {
  const circles = await env.DB.prepare(
    `SELECT c.id, c.name_ar, ${stageExpr} AS stage_id,
            ${capacityExpr} AS default_capacity,
            ${isActiveExpr},
            ${teacher.teacherIdCol}, ${teacher.teacherNameCol},
            ${studentCount} AS student_count
     FROM circles c
     ${track.joinSql}
     ${teacher.joinSql}
     WHERE c.complex_id = ?
       AND COALESCE(c.is_active, 1) = 1
     ORDER BY c.name_ar`,
  )
    .bind(complexId)
    .all<{
      id: number;
      name_ar: string;
      stage_id: number;
      default_capacity: number;
      is_active: number;
      teacher_id: number | null;
      teacher_name: string | null;
      student_count: number;
    }>();

  for (const c of circles.results ?? []) {
    const cap = computeCapacity(c.default_capacity, c.student_count);
    items.push({
      id: c.id,
      entity_type: "circle",
      name_ar: c.name_ar,
      assignee_id: c.teacher_id,
      assignee_name: c.teacher_name,
      student_count: c.student_count,
      default_capacity: c.default_capacity,
      is_active: c.is_active,
      stage_id: c.stage_id,
      capacity_warning: capacityWarningMessage({
        circle_id: c.id,
        ...cap,
      }),
    });
  }
  }

  const hasSupervisorCol = await tableHasColumn(env, "tracks", "supervisor_id");
  const hasStudentsCurrentTrack = await tableHasColumn(
    env,
    "students",
    "current_track_id",
  );

  if (hasSupervisorCol) {
    const tracks = await env.DB.prepare(
      `SELECT t.id, t.name_ar, t.supervisor_id,
              COALESCE(t.default_capacity, 20) AS default_capacity,
              COALESCE(t.is_active, 1) AS is_active,
              u.full_name_ar AS supervisor_name
       FROM tracks t
       LEFT JOIN users u ON u.id = t.supervisor_id
     WHERE t.complex_id = ?
       AND COALESCE(t.is_active, 1) = 1
     ORDER BY t.name_ar`,
    )
      .bind(complexId)
      .all<{
        id: number;
        name_ar: string;
        supervisor_id: number;
        supervisor_name: string | null;
        default_capacity: number;
        is_active: number;
      }>();

    for (const t of tracks.results ?? []) {
      let studentCountN = 0;
      if (hasStudentsCurrentTrack) {
        const sc = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM students
           WHERE current_track_id = ? AND complex_id = ?
             AND COALESCE(is_active, 1) = 1`,
        )
          .bind(t.id, complexId)
          .first<{ c: number }>();
        studentCountN = sc?.c ?? 0;
      }
      items.push({
        id: t.id,
        entity_type: "track",
        name_ar: t.name_ar,
        assignee_id: t.supervisor_id,
        assignee_name: t.supervisor_name,
        student_count: studentCountN,
        default_capacity: t.default_capacity,
        is_active: t.is_active,
        stage_ids: [],
      });
    }
  }

  items.sort((a, b) => {
    if (a.entity_type !== b.entity_type) {
      return a.entity_type === "circle" ? -1 : 1;
    }
    return a.name_ar.localeCompare(b.name_ar, "ar");
  });

  return items;
}

async function detachStudentsFromCircle(
  env: Env,
  circleId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  if (await tableHasColumn(env, "students", "current_circle_id")) {
    stmts.push(
      env.DB.prepare(
        `UPDATE students SET current_circle_id = NULL
         WHERE current_circle_id = ? AND complex_id = ?`,
      ).bind(circleId, complexId),
    );
  }
  return stmts;
}

async function detachStudentsFromTrack(
  env: Env,
  trackId: number,
  complexId: number,
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  if (await tableHasColumn(env, "students", "current_track_id")) {
    stmts.push(
      env.DB.prepare(
        `UPDATE students SET current_track_id = NULL
         WHERE current_track_id = ? AND complex_id = ?`,
      ).bind(trackId, complexId),
    );
  }
  return stmts;
}

export async function safeDeleteEducationalGroup(
  env: Env,
  entityType: EducationalEntityType,
  id: number,
  complexId: number,
): Promise<{ soft_deleted?: boolean }> {
  if (entityType === "circle") {
    if (!(await hasTable(env, "circles"))) throw new Error("circle_not_found");

    const row = await env.DB.prepare(
      `SELECT id FROM circles WHERE id = ? AND complex_id = ?`,
    )
      .bind(id, complexId)
      .first();
    if (!row) throw new Error("circle_not_found");

    const batch: D1PreparedStatement[] = [
      ...(await detachStudentsFromCircle(env, id, complexId)),
    ];
    if (await hasTable(env, "teacher_assignments")) {
      batch.push(
        env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`).bind(
          id,
        ),
      );
    }
    if (await hasTable(env, "track_circles")) {
      batch.push(
        env.DB.prepare(`DELETE FROM track_circles WHERE circle_id = ?`).bind(id),
      );
    }
    if (await tableHasColumn(env, "circles", "is_active")) {
      batch.push(
        env.DB.prepare(
          `UPDATE circles SET is_active = 0 WHERE id = ? AND complex_id = ?`,
        ).bind(id, complexId),
      );
    } else {
      batch.push(
        env.DB.prepare(`DELETE FROM circles WHERE id = ? AND complex_id = ?`).bind(
          id,
          complexId,
        ),
      );
    }

    await env.DB.batch(batch);
    return {};
  }

  const row = await env.DB.prepare(
    `SELECT id FROM tracks WHERE id = ? AND complex_id = ?`,
  )
    .bind(id, complexId)
    .first();
  if (!row) throw new Error("track_not_found");

  const batch: D1PreparedStatement[] = [
    ...(await detachStudentsFromTrack(env, id, complexId)),
  ];
  if (await hasTable(env, "track_circles")) {
    batch.push(
      env.DB.prepare(`DELETE FROM track_circles WHERE track_id = ?`).bind(id),
    );
  }
  if (await tableHasColumn(env, "circles", "track_id")) {
    batch.push(
      env.DB.prepare(
        `UPDATE circles SET track_id = NULL WHERE track_id = ? AND complex_id = ?`,
      ).bind(id, complexId),
    );
  }
  if (await hasTable(env, "track_stages")) {
    batch.push(
      env.DB.prepare(`DELETE FROM track_stages WHERE track_id = ?`).bind(id),
    );
  }
  batch.push(
    env.DB.prepare(`DELETE FROM tracks WHERE id = ? AND complex_id = ?`).bind(
      id,
      complexId,
    ),
  );

  await env.DB.batch(batch);
  return {};
}

export function parseEducationalEntityType(
  raw: string | null,
): EducationalEntityType | null {
  if (raw === "circle" || raw === "track") return raw;
  return null;
}
