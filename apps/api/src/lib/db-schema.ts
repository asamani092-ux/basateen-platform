import type { Env } from "../types";

let cachedTables: Set<string> | null = null;
const cachedColumns = new Map<string, Set<string>>();

export async function hasTable(env: Env, table: string): Promise<boolean> {
  if (!cachedTables) {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    cachedTables = new Set((rows.results ?? []).map((r) => r.name));
  }
  return cachedTables.has(table);
}

export async function tableHasColumn(
  env: Env,
  table: string,
  column: string,
): Promise<boolean> {
  let cols = cachedColumns.get(table);
  if (!cols) {
    const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
      name: string;
    }>();
    cols = new Set((rows.results ?? []).map((r) => r.name));
    cachedColumns.set(table, cols);
  }
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
  if (!(await tableHasColumn(env, "students", "is_active"))) {
    return "1=1";
  }
  return sqliteActiveEq1(`${alias}.is_active`);
}

/** Join history only when it represents current placement (legacy schema). */
export async function canJoinStudentHistoryForPlacement(env: Env): Promise<boolean> {
  const circleCol = await historyCircleColumn(env, "h");
  if (!circleCol) return false;
  return tableHasColumn(env, "student_circle_history", "to_at");
}
