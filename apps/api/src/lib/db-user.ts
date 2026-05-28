import type { DbUserRow, UserRole } from "../../../../packages/types/schema";
import { resolveRoleFromUser } from "../../../../packages/types/schema";
import type { Env, UserRow } from "../types";

let cachedRoleColumn: boolean | null = null;

async function usersHaveRoleColumn(env: Env): Promise<boolean> {
  if (cachedRoleColumn !== null) return cachedRoleColumn;
  const rows = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  cachedRoleColumn = (rows.results ?? []).some((r) => r.name === "role");
  return cachedRoleColumn;
}

function toUserRow(raw: DbUserRow & { is_active: number }): UserRow {
  return {
    id: raw.id,
    email: raw.email,
    mobile: raw.mobile ?? null,
    password_hash: raw.password_hash,
    full_name_ar: raw.full_name_ar,
    complex_id: raw.complex_id,
    is_active: raw.is_active,
    role: resolveRoleFromUser(raw),
  };
}

export async function loadUserByEmail(
  env: Env,
  email: string,
): Promise<UserRow | null> {
  const hasRole = await usersHaveRoleColumn(env);
  const row = hasRole
    ? await env.DB.prepare(
        `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active, role
         FROM users WHERE email = ? LIMIT 1`,
      )
        .bind(email)
        .first<DbUserRow & { is_active: number }>()
    : await env.DB.prepare(
        `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
                is_admin, is_educational, is_programs, is_teacher, is_track_supervisor, stage_scope
         FROM users WHERE email = ? LIMIT 1`,
      )
        .bind(email)
        .first<DbUserRow & { is_active: number }>();

  return row ? toUserRow(row) : null;
}

export async function loadUserByMobile(
  env: Env,
  mobile: string,
): Promise<UserRow | null> {
  const hasRole = await usersHaveRoleColumn(env);
  const row = hasRole
    ? await env.DB.prepare(
        `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active, role
         FROM users WHERE mobile = ? LIMIT 1`,
      )
        .bind(mobile)
        .first<DbUserRow & { is_active: number }>()
    : await env.DB.prepare(
        `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
                is_admin, is_educational, is_programs, is_teacher, is_track_supervisor, stage_scope
         FROM users WHERE mobile = ? LIMIT 1`,
      )
        .bind(mobile)
        .first<DbUserRow & { is_active: number }>();

  return row ? toUserRow(row) : null;
}

export async function loadUserPayload(
  env: Env,
  userId: number,
): Promise<{
  id: number;
  email: string;
  mobile: string | null;
  full_name_ar: string;
  role: UserRole;
  complex_id: number;
  supervisor_scope: string;
  sections: string[];
} | null> {
  const hasRole = await usersHaveRoleColumn(env);
  const hasSupervisorScope = (await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>())
    .results?.some((r) => r.name === "supervisor_scope");

  const user = hasRole
    ? await env.DB.prepare(
        `SELECT id, email, mobile, full_name_ar, role, complex_id${
          hasSupervisorScope ? ", supervisor_scope" : ""
        }
         FROM users WHERE id = ? AND is_active = 1`,
      )
        .bind(userId)
        .first<DbUserRow & { supervisor_scope?: string | null }>()
    : await env.DB.prepare(
        `SELECT id, email, mobile, full_name_ar, complex_id,
                is_admin, is_educational, is_programs, is_teacher, is_track_supervisor, stage_scope
         FROM users WHERE id = ? AND is_active = 1`,
      )
        .bind(userId)
        .first<DbUserRow>();

  if (!user) return null;

  const sections = await env.DB.prepare(
    "SELECT section FROM user_sections WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ section: string }>();

  const flat = user as DbUserRow & { stage_scope?: string | null };
  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile ?? null,
    full_name_ar: user.full_name_ar,
    role: resolveRoleFromUser(user),
    complex_id: user.complex_id,
    supervisor_scope:
      hasSupervisorScope && "supervisor_scope" in flat && flat.supervisor_scope
        ? String(flat.supervisor_scope)
        : flat.stage_scope
          ? String(flat.stage_scope)
          : "global",
    sections: sections.results?.map((r) => r.section) ?? ["admin", "education", "programs"],
  };
}
