import type { Env, UserRole, UserRow } from "../types";
import { mobileLookupKeys, normalizeMobile } from "./mobile";

let cachedHasRoleColumn: boolean | null = null;

export async function usersHaveRoleColumn(env: Env): Promise<boolean> {
  if (cachedHasRoleColumn !== null) return cachedHasRoleColumn;
  const rows = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  cachedHasRoleColumn = (rows.results ?? []).some((r) => r.name === "role");
  return cachedHasRoleColumn;
}

export function resolveRoleFromFlat(row: {
  is_admin?: number | null;
  is_educational?: number | null;
  is_programs?: number | null;
  is_teacher?: number | null;
}): UserRole {
  if (row.is_admin === 1) return "general_manager";
  if (row.is_educational === 1) return "edu_supervisor";
  if (row.is_programs === 1) return "prog_supervisor";
  if (row.is_teacher === 1) return "teacher";
  return "general_manager";
}

type RawUser = {
  id: number;
  email: string;
  mobile: string | null;
  password_hash: string;
  full_name_ar: string;
  complex_id: number;
  is_active: number;
  role?: string;
  is_admin?: number | null;
  is_educational?: number | null;
  is_programs?: number | null;
  is_teacher?: number | null;
};

function toUserRow(raw: RawUser): UserRow {
  const role =
    raw.role && typeof raw.role === "string"
      ? (raw.role as UserRole)
      : resolveRoleFromFlat(raw);
  return {
    id: raw.id,
    email: raw.email,
    mobile: raw.mobile,
    password_hash: raw.password_hash,
    full_name_ar: raw.full_name_ar,
    complex_id: raw.complex_id,
    is_active: raw.is_active,
    role,
  };
}

async function queryUser(
  env: Env,
  sqlRole: string,
  sqlFlat: string,
  binds: string[],
): Promise<UserRow | null> {
  const hasRole = await usersHaveRoleColumn(env);
  const row = await env.DB.prepare(hasRole ? sqlRole : sqlFlat)
    .bind(...binds)
    .first<RawUser>();
  return row ? toUserRow(row) : null;
}

export async function loadUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return queryUser(
    env,
    `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active, role
     FROM users WHERE email = ? LIMIT 1`,
    `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
            is_admin, is_educational, is_programs, is_teacher
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
}

export async function loadUserByMobile(
  env: Env,
  rawMobile: string,
): Promise<UserRow | null> {
  const keys = mobileLookupKeys(
    normalizeMobile(rawMobile) ?? rawMobile,
  );
  const placeholders = keys.map(() => "?").join(", ");
  return queryUser(
    env,
    `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active, role
     FROM users WHERE mobile IN (${placeholders}) LIMIT 1`,
    `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
            is_admin, is_educational, is_programs, is_teacher
     FROM users WHERE mobile IN (${placeholders}) LIMIT 1`,
    keys,
  );
}

export async function loadUserPayload(env: Env, userId: number) {
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
        .first<{
          id: number;
          email: string;
          mobile: string | null;
          full_name_ar: string;
          role: string;
          complex_id: number;
          supervisor_scope?: string | null;
        }>()
    : await env.DB.prepare(
        `SELECT id, email, mobile, full_name_ar, complex_id,
                is_admin, is_educational, is_programs, is_teacher, stage_scope
         FROM users WHERE id = ? AND is_active = 1`,
      )
        .bind(userId)
        .first<{
          id: number;
          email: string;
          mobile: string | null;
          full_name_ar: string;
          complex_id: number;
          is_admin?: number | null;
          is_educational?: number | null;
          is_programs?: number | null;
          is_teacher?: number | null;
          stage_scope?: string | null;
        }>();

  if (!user) return null;

  const sections = await env.DB.prepare(
    "SELECT section FROM user_sections WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ section: string }>();

  const role = hasRole
    ? (user as { role: string }).role
    : resolveRoleFromFlat(user as Parameters<typeof resolveRoleFromFlat>[0]);

  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile,
    full_name_ar: user.full_name_ar,
    role: role as UserRole,
    complex_id: user.complex_id,
    supervisor_scope:
      hasRole && "supervisor_scope" in user && user.supervisor_scope
        ? String(user.supervisor_scope)
        : "stage_scope" in user && user.stage_scope
          ? String(user.stage_scope)
          : "global",
    sections:
      sections.results?.length
        ? sections.results.map((r) => r.section)
        : ["admin", "education", "programs"],
  };
}
