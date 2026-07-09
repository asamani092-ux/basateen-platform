import type { Env } from "../types";
import { EXPECTED_MIGRATIONS } from "./expected-migrations";

/** O(A) — A = عدد الترحيلات المطبّقة */
export async function listAppliedMigrations(env: Env): Promise<string[]> {
  try {
    const rows = await env.DB.prepare(
      "SELECT name FROM _migrations_applied ORDER BY name",
    ).all<{ name: string }>();
    return (rows.results ?? []).map((r) => r.name);
  } catch {
    return [];
  }
}

/** O(M) — M = عدد ملفات الترحيل المتوقعة */
export async function pendingMigrationNames(env: Env): Promise<string[]> {
  const applied = new Set(await listAppliedMigrations(env));
  return EXPECTED_MIGRATIONS.filter((name) => !applied.has(name));
}
