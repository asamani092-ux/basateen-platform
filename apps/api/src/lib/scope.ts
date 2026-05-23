import type { AuthContext, Env } from "../types";
import { ADMIN_DATA_ROLES } from "./roles";

/** O(1) — فهرس على supervisor_scopes */
export async function supervisorHasCircle(
  env: Env,
  userId: number,
  circleId: number,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM supervisor_scopes
     WHERE user_id = ? AND circle_id = ? LIMIT 1`,
  )
    .bind(userId, circleId)
    .first<{ ok: number }>();
  return row != null;
}

export async function canManageCircle(
  env: Env,
  auth: AuthContext,
  circleId: number,
): Promise<boolean> {
  if (auth.role === "general_manager") return true;
  if (auth.role === "edu_supervisor") {
    return supervisorHasCircle(env, auth.userId, circleId);
  }
  return false;
}

export function canAccessAdminData(auth: AuthContext): boolean {
  return ADMIN_DATA_ROLES.includes(auth.role);
}
