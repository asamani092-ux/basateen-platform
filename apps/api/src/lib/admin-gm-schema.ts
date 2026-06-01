import type { Env } from "../types";
import { activePlacementSql, hasTable, tableHasColumn } from "./db-schema";
import { usersHaveRoleColumn } from "./db-user";

const STAGE_TEXT_TO_ID_SQL = `CASE c.stage
  WHEN 'tlaqeen' THEN 1
  WHEN 'primary' THEN 2
  WHEN 'middle' THEN 3
  WHEN 'secondary' THEN 4
  ELSE 2
END`;

export const STAGE_ID_TO_CIRCLE_STAGE: Record<number, string> = {
  1: "tlaqeen",
  2: "primary",
  3: "middle",
  4: "secondary",
};

export async function createCircleRow(
  env: Env,
  complexId: number,
  params: {
    name_ar: string;
    stage_id: number;
    capacity: number;
    teacher_id: number;
    track_id: number | null;
  },
): Promise<number> {
  const stageKey = STAGE_ID_TO_CIRCLE_STAGE[params.stage_id] ?? "primary";
  const hasTeacherId = await tableHasColumn(env, "circles", "teacher_id");
  const hasStageText = await tableHasColumn(env, "circles", "stage");
  const hasStageId = await tableHasColumn(env, "circles", "stage_id");
  const hasTrackId = await tableHasColumn(env, "circles", "track_id");
  const hasDefaultCap = await tableHasColumn(env, "circles", "default_capacity");

  if (hasTeacherId && hasStageText) {
    const ins = await env.DB.prepare(
      `INSERT INTO circles (complex_id, name_ar, teacher_id, stage, capacity)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        complexId,
        params.name_ar,
        params.teacher_id,
        stageKey,
        params.capacity,
      )
      .run();
    return ins.meta.last_row_id as number;
  }

  const cols = ["complex_id", "name_ar", "capacity"];
  const vals: (string | number | null)[] = [
    complexId,
    params.name_ar,
    params.capacity,
  ];
  if (hasDefaultCap) {
    cols.push("default_capacity");
    vals.push(params.capacity);
  }
  if (hasStageId) {
    cols.push("stage_id");
    vals.push(params.stage_id);
  }
  if (hasTrackId && params.track_id != null) {
    cols.push("track_id");
    vals.push(params.track_id);
  }

  const ins = await env.DB.prepare(
    `INSERT INTO circles (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
  )
    .bind(...vals)
    .run();

  const circleId = ins.meta.last_row_id as number;

  if (await hasTable(env, "teacher_assignments")) {
    await env.DB.prepare(`DELETE FROM teacher_assignments WHERE circle_id = ?`)
      .bind(circleId)
      .run();
    await env.DB.prepare(
      `INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)`,
    )
      .bind(params.teacher_id, circleId)
      .run();
  }

  if (
    params.track_id != null &&
    (await hasTable(env, "track_circles")) &&
    Number.isFinite(params.track_id)
  ) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO track_circles (track_id, circle_id) VALUES (?, ?)`,
    )
      .bind(params.track_id, circleId)
      .run();
    if (await tableHasColumn(env, "circles", "track_id")) {
      await env.DB.prepare(`UPDATE circles SET track_id = ? WHERE id = ?`)
        .bind(params.track_id, circleId)
        .run();
    }
  }

  return circleId;
}

export async function circleStageIdExpr(env: Env): Promise<string> {
  const hasStageId = await tableHasColumn(env, "circles", "stage_id");
  const hasStageText = await tableHasColumn(env, "circles", "stage");
  if (hasStageId && hasStageText) {
    return `COALESCE(c.stage_id, ${STAGE_TEXT_TO_ID_SQL})`;
  }
  if (hasStageId) return `COALESCE(c.stage_id, 2)`;
  if (hasStageText) return STAGE_TEXT_TO_ID_SQL;
  return `2`;
}

export async function circleIsActiveSelectExpr(env: Env): Promise<string> {
  const has = await tableHasColumn(env, "circles", "is_active");
  return has ? `COALESCE(c.is_active, 1) AS is_active` : `1 AS is_active`;
}

export async function circleCapacityExpr(env: Env): Promise<string> {
  const hasDefault = await tableHasColumn(env, "circles", "default_capacity");
  if (hasDefault) {
    return `COALESCE(c.default_capacity, c.capacity, 20)`;
  }
  return `COALESCE(c.capacity, 20)`;
}

export async function circleTrackSelectSql(env: Env): Promise<{
  joinSql: string;
  trackIdCol: string;
  trackNameCol: string;
}> {
  const hasTrackOnCircle = await tableHasColumn(env, "circles", "track_id");
  if (hasTrackOnCircle) {
    return {
      joinSql: `LEFT JOIN tracks t ON t.id = c.track_id`,
      trackIdCol: `c.track_id`,
      trackNameCol: `t.name_ar AS track_name`,
    };
  }
  return {
    joinSql: "",
    trackIdCol: `NULL AS track_id`,
    trackNameCol: `NULL AS track_name`,
  };
}

export async function circleStudentCountSubquery(env: Env): Promise<string> {
  if (await tableHasColumn(env, "students", "current_circle_id")) {
    return `(SELECT COUNT(*) FROM students s
             WHERE s.current_circle_id = c.id
               AND s.complex_id = c.complex_id
               AND COALESCE(s.is_active, 1) = 1)`;
  }

  const hasHist = await hasTable(env, "student_circle_history");
  if (!hasHist) return `0`;

  const hasLegacyCircle = await tableHasColumn(
    env,
    "student_circle_history",
    "circle_id",
  );
  if (hasLegacyCircle) {
    const hasToAt = await tableHasColumn(env, "student_circle_history", "to_at");
    if (hasToAt) {
      const active = await activePlacementSql(env, "h");
      return `(SELECT COUNT(DISTINCT h.student_id) FROM student_circle_history h
               WHERE h.circle_id = c.id AND ${active})`;
    }
  }

  const hasNewCircle = await tableHasColumn(
    env,
    "student_circle_history",
    "new_circle_id",
  );
  if (hasNewCircle) {
    return `(SELECT COUNT(DISTINCT h.student_id) FROM student_circle_history h
             WHERE h.new_circle_id = c.id)`;
  }

  return `0`;
}

export async function circleTeacherJoinSql(env: Env): Promise<{
  joinSql: string;
  teacherIdCol: string;
  teacherNameCol: string;
}> {
  const hasAssignments = await hasTable(env, "teacher_assignments");
  const hasTeacherOnCircle = await tableHasColumn(env, "circles", "teacher_id");
  const hasRole = await usersHaveRoleColumn(env);
  const teacherRoleFilter = hasRole
    ? "u.role = 'teacher'"
    : "COALESCE(u.is_teacher, 0) = 1";

  if (hasAssignments) {
    return {
      joinSql: `LEFT JOIN teacher_assignments ta ON ta.circle_id = c.id
     LEFT JOIN users u ON u.id = ta.user_id AND ${teacherRoleFilter}`,
      teacherIdCol: `u.id AS teacher_id`,
      teacherNameCol: `u.full_name_ar AS teacher_name`,
    };
  }

  if (hasTeacherOnCircle) {
    return {
      joinSql: `LEFT JOIN users u ON u.id = c.teacher_id AND ${teacherRoleFilter}`,
      teacherIdCol: `u.id AS teacher_id`,
      teacherNameCol: `u.full_name_ar AS teacher_name`,
    };
  }

  return {
    joinSql: "",
    teacherIdCol: `NULL AS teacher_id`,
    teacherNameCol: `NULL AS teacher_name`,
  };
}

export async function teachersListSql(env: Env): Promise<string> {
  const hasAssignments = await hasTable(env, "teacher_assignments");
  const hasTeacherOnCircle = await tableHasColumn(env, "circles", "teacher_id");
  const hasRole = await usersHaveRoleColumn(env);
  const teacherFilter = hasRole
    ? "u.role IN ('teacher', 'track_supervisor')"
    : "(COALESCE(u.is_teacher, 0) = 1 OR COALESCE(u.is_track_supervisor, 0) = 1)";
  const roleExpr = hasRole
    ? "u.role"
    : `CASE WHEN COALESCE(u.is_track_supervisor, 0) = 1 THEN 'track_supervisor' ELSE 'teacher' END`;
  const stageExpr = await circleStageIdExpr(env);

  const hasTracks = await hasTable(env, "tracks");
  const hasTrackSupervisorCol =
    hasTracks && (await tableHasColumn(env, "tracks", "supervisor_id"));
  const tracksHaveComplexId =
    hasTrackSupervisorCol &&
    (await tableHasColumn(env, "tracks", "complex_id"));
  const trackJoinOn = tracksHaveComplexId
    ? "tr_sup.supervisor_id = u.id AND tr_sup.complex_id = u.complex_id"
    : "tr_sup.supervisor_id = u.id";
  const trackJoin = hasTrackSupervisorCol
    ? `LEFT JOIN tracks tr_sup ON ${trackJoinOn}`
    : "";
  const trackNameCol = hasTrackSupervisorCol
    ? `tr_sup.name_ar AS track_name`
    : `NULL AS track_name`;
  const hasCircleTrackId =
    hasTracks && (await tableHasColumn(env, "circles", "track_id"));
  const circleTrackJoin = hasCircleTrackId
    ? `LEFT JOIN tracks t_circ ON t_circ.id = c.track_id`
    : "";
  const hasCircleIsActive = await tableHasColumn(env, "circles", "is_active");
  const circleActiveFilter = hasCircleIsActive
    ? " AND COALESCE(c.is_active, 1) = 1"
    : "";

  if (hasAssignments) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            ${roleExpr} AS role, ta.circle_id, c.name_ar AS circle_name,
            ${trackNameCol},
            ${stageExpr} AS stage_id
     FROM users u
     LEFT JOIN teacher_assignments ta ON ta.user_id = u.id
     LEFT JOIN circles c ON c.id = ta.circle_id
     ${trackJoin}
     WHERE u.complex_id = ? AND ${teacherFilter}
     ORDER BY u.full_name_ar`;
  }

  if (hasTeacherOnCircle) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            ${roleExpr} AS role, c.id AS circle_id, c.name_ar AS circle_name,
            ${hasTrackSupervisorCol ? `COALESCE(tr_sup.name_ar, t_circ.name_ar) AS track_name` : `NULL AS track_name`},
            ${stageExpr} AS stage_id
     FROM users u
     LEFT JOIN circles c ON c.teacher_id = u.id AND c.complex_id = u.complex_id${circleActiveFilter}
     ${trackJoin}
     ${circleTrackJoin}
     WHERE u.complex_id = ? AND ${teacherFilter}
     ORDER BY u.full_name_ar`;
  }

  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
          'teacher' AS role, NULL AS circle_id, NULL AS circle_name,
          NULL AS track_name, 2 AS stage_id
   FROM users u
   ${trackJoin}
   WHERE u.complex_id = ? AND ${teacherFilter}
   ORDER BY u.full_name_ar`;
}
