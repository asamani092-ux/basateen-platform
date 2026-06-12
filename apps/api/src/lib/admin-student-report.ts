import type { Env } from "../types";
import { studentIsActiveSql, tableHasColumn } from "./db-schema";
import { resolveMemorizationFields } from "./quran-memorization";
import { buildStudentPlacementSql } from "./student-list-sql";

export type AdminReportStudentRow = {
  id: number;
  full_name_ar: string;
  guardian_phone: string | null;
  stage_id: number | null;
  circle_name: string | null;
  track_name: string | null;
  memorization_faces?: number | null;
  memorization_amount?: string | null;
};

async function studentNameSelect(env: Env): Promise<string> {
  const hasFull = await tableHasColumn(env, "students", "full_name_ar");
  const hasName = await tableHasColumn(env, "students", "name");
  if (hasFull && hasName) {
    return "COALESCE(NULLIF(TRIM(s.full_name_ar), ''), s.name) AS full_name_ar";
  }
  if (hasFull) return "s.full_name_ar";
  if (hasName) return "s.name AS full_name_ar";
  return "'' AS full_name_ar";
}

async function studentColumn(
  env: Env,
  column: string,
  fallback = "NULL",
): Promise<string> {
  return (await tableHasColumn(env, "students", column))
    ? `s.${column}`
    : `${fallback} AS ${column}`;
}

/**
 * Resolves a student for admin individual reports — mirrors students/search id semantics.
 * Time O(1) queries; Space O(1).
 */
export async function fetchStudentForAdminReport(
  env: Env,
  complexId: number,
  personRef: string | number,
): Promise<AdminReportStudentRow | null> {
  const personId = Number(personRef);
  if (!Number.isFinite(personId) || personId <= 0) return null;

  const isActiveExpr = await studentIsActiveSql(env, "s");
  const placement = await buildStudentPlacementSql(env);
  const { historyJoin, circleJoin, trackJoin } = placement;
  const nameSelect = await studentNameSelect(env);
  const guardianSelect = await studentColumn(env, "guardian_phone");
  const stageSelect = await studentColumn(env, "stage_id");

  const hasMemFaces = await tableHasColumn(env, "students", "memorization_faces");
  const hasMemAmount = await tableHasColumn(env, "students", "memorization_amount");
  const memFacesSelect = hasMemFaces ? "s.memorization_faces" : "NULL AS memorization_faces";
  const memAmountSelect = hasMemAmount
    ? "s.memorization_amount"
    : "NULL AS memorization_amount";

  const baseSql = `
    SELECT s.id, ${nameSelect}, ${guardianSelect}, ${stageSelect},
           c.name_ar AS circle_name, t.name_ar AS track_name,
           ${memFacesSelect}, ${memAmountSelect}
    FROM students s
    ${historyJoin}
    ${circleJoin}
    ${trackJoin}
    WHERE s.complex_id = ? AND ${isActiveExpr}`;

  const byId = await env.DB.prepare(`${baseSql} AND s.id = ?`)
    .bind(complexId, personId)
    .first<AdminReportStudentRow>();
  if (byId) {
    const mem = resolveMemorizationFields({
      memorization_faces: byId.memorization_faces,
      memorization_amount: byId.memorization_amount,
    });
    return {
      ...byId,
      memorization_faces: mem.faces,
      memorization_amount: mem.text,
    };
  }

  if (!(await tableHasColumn(env, "students", "national_id"))) return null;

  const nationalRef = String(personRef).trim();
  if (!nationalRef) return null;

  const byNational = await env.DB.prepare(`${baseSql} AND s.national_id = ?`)
    .bind(complexId, nationalRef)
    .first<AdminReportStudentRow>();
  if (!byNational) return null;
  const memNational = resolveMemorizationFields({
    memorization_faces: byNational.memorization_faces,
    memorization_amount: byNational.memorization_amount,
  });
  return {
    ...byNational,
    memorization_faces: memNational.faces,
    memorization_amount: memNational.text,
  };
}
