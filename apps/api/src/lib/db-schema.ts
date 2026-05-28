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

/** Active placement predicate for student_circle_history (flat vs full schema). */
export async function activePlacementSql(
  env: Env,
  alias = "h",
): Promise<string> {
  const hasFrozen = await tableHasColumn(env, "student_circle_history", "frozen_at");
  const p = `${alias}.to_at IS NULL`;
  return hasFrozen ? `${p} AND ${alias}.frozen_at IS NULL` : p;
}
