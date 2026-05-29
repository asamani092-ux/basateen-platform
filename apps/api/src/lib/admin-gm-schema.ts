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
    ? "u.role = 'teacher'"
    : "COALESCE(u.is_teacher, 0) = 1";
  const stageExpr = await circleStageIdExpr(env);

  if (hasAssignments) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            ta.circle_id, c.name_ar AS circle_name,
            ${stageExpr} AS stage_id
     FROM users u
     LEFT JOIN teacher_assignments ta ON ta.user_id = u.id
     LEFT JOIN circles c ON c.id = ta.circle_id
     WHERE u.complex_id = ? AND ${teacherFilter}
     ORDER BY u.full_name_ar`;
  }

  if (hasTeacherOnCircle) {
    return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
            c.id AS circle_id, c.name_ar AS circle_name,
            ${stageExpr} AS stage_id
     FROM users u
     LEFT JOIN circles c ON c.teacher_id = u.id AND c.complex_id = u.complex_id
       AND COALESCE(c.is_active, 1) = 1
     WHERE u.complex_id = ? AND ${teacherFilter}
     ORDER BY u.full_name_ar`;
  }

  return `SELECT u.id, u.full_name_ar, u.mobile, u.is_active,
          NULL AS circle_id, NULL AS circle_name, 2 AS stage_id
   FROM users u
   WHERE u.complex_id = ? AND ${teacherFilter}
   ORDER BY u.full_name_ar`;
}
