import type { Env } from "../types";
import { getOrLoadCached, WORKER_CACHE_TTL_MS } from "./worker-memory-cache";

const TABLES_CACHE_KEY = "schema:sqlite_master_tables";

async function loadTableNames(env: Env): Promise<Set<string>> {
  return getOrLoadCached(TABLES_CACHE_KEY, async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    return new Set((rows.results ?? []).map((r) => r.name));
  }, WORKER_CACHE_TTL_MS);
}

async function loadTableColumns(env: Env, table: string): Promise<Set<string>> {
  return getOrLoadCached(`schema:columns:${table}`, async () => {
    const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
      name: string;
    }>();
    return new Set((rows.results ?? []).map((r) => r.name));
  }, WORKER_CACHE_TTL_MS);
}

export async function hasTable(env: Env, table: string): Promise<boolean> {
  const tables = await loadTableNames(env);
  return tables.has(table);
}

export async function tableHasColumn(
  env: Env,
  table: string,
  column: string,
): Promise<boolean> {
  const cols = await loadTableColumns(env, table);
  return cols.has(column);
}

/** Active placement predicate for student_circle_history (legacy open row). */
export async function activePlacementSql(
  env: Env,
  alias = "h",
): Promise<string> {
  const hasToAt = await tableHasColumn(env, "student_circle_history", "to_at");
  if (!hasToAt) {
    return "1=0";
  }
  const hasFrozen = await tableHasColumn(
    env,
    "student_circle_history",
    "frozen_at",
  );
  const p = `${alias}.to_at IS NULL`;
  return hasFrozen ? `${p} AND ${alias}.frozen_at IS NULL` : p;
}

/** Legacy placement row uses circle_id; v25 archive log uses new_circle_id only. */
export async function historyCircleColumn(
  env: Env,
  alias = "h",
): Promise<string | null> {
  if (!(await hasTable(env, "student_circle_history"))) return null;
  if (await tableHasColumn(env, "student_circle_history", "circle_id")) {
    return `${alias}.circle_id`;
  }
  if (await tableHasColumn(env, "student_circle_history", "new_circle_id")) {
    return `${alias}.new_circle_id`;
  }
  return null;
}

export async function historyTrackColumn(
  env: Env,
  alias = "h",
): Promise<string | null> {
  if (!(await hasTable(env, "student_circle_history"))) return null;
  if (await tableHasColumn(env, "student_circle_history", "track_id")) {
    return `${alias}.track_id`;
  }
  if (await tableHasColumn(env, "student_circle_history", "new_track_id")) {
    return `${alias}.new_track_id`;
  }
  return null;
}

/**
 * SQLite-safe «active» predicate — D1 may store is_active as TEXT '1.0' not INTEGER 1.
 * Time O(1) per row evaluation; Space O(1).
 */
export function sqliteActiveEq1(columnExpr: string): string {
  return `COALESCE(CAST(${columnExpr} AS INTEGER), 1) = 1`;
}

export async function studentIsActiveSql(
  env: Env,
  alias = "s",
): Promise<string> {
  const parts: string[] = [];
  if (await tableHasColumn(env, "students", "is_active")) {
    const col = alias ? `${alias}.is_active` : "is_active";
    parts.push(sqliteActiveEq1(col));
  }
  if (await tableHasColumn(env, "students", "deleted_at")) {
    const col = alias ? `${alias}.deleted_at` : "deleted_at";
    parts.push(`${col} IS NULL`);
  }
  return parts.length > 0 ? parts.join(" AND ") : "1=1";
}

/** Archived / soft-deleted students — is_active = 0 (Time O(1) per row; Space O(1)). */
export async function studentIsArchivedSql(
  env: Env,
  alias = "s",
): Promise<string> {
  if (!(await tableHasColumn(env, "students", "is_active"))) {
    return "1=0";
  }
  const col = alias ? `${alias}.is_active` : "is_active";
  return `COALESCE(CAST(${col} AS INTEGER), 1) = 0`;
}

/** طالب مؤهل للتحضير والتقارير النشطة — يستبعد المعلّقين */
export async function studentAttendanceEligibleSql(
  env: Env,
  alias = "s",
): Promise<string> {
  const parts = [await studentIsActiveSql(env, alias)];
  if (await tableHasColumn(env, "students", "account_status")) {
    const col = alias ? `${alias}.account_status` : "account_status";
    parts.push(`COALESCE(${col}, 'active') != 'suspended'`);
  }
  return parts.join(" AND ");
}

/** Join history only when it represents current placement (legacy schema). */
export async function canJoinStudentHistoryForPlacement(env: Env): Promise<boolean> {
  const circleCol = await historyCircleColumn(env, "h");
  if (!circleCol) return false;
  return tableHasColumn(env, "student_circle_history", "to_at");
}
