import type { Env, UserRole, UserRow } from "../types";
import { normalizeUserRole } from "../../../../packages/types/schema";
import { mobileLookupVariants, normalizeMobile } from "./mobile";

let cachedHasRoleColumn: boolean | null = null;
let cachedHasUserSectionsTable: boolean | null = null;
let cachedUserColumns: Set<string> | null = null;

async function getUserColumns(env: Env): Promise<Set<string>> {
  if (cachedUserColumns) return cachedUserColumns;
  const rows = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  cachedUserColumns = new Set((rows.results ?? []).map((r) => r.name));
  return cachedUserColumns;
}

export async function usersHaveRoleColumn(env: Env): Promise<boolean> {
  if (cachedHasRoleColumn !== null) return cachedHasRoleColumn;
  cachedHasRoleColumn = (await getUserColumns(env)).has("role");
  return cachedHasRoleColumn;
}

async function hasUserSectionsTable(env: Env): Promise<boolean> {
  if (cachedHasUserSectionsTable !== null) return cachedHasUserSectionsTable;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'user_sections' LIMIT 1",
  ).first();
  cachedHasUserSectionsTable = row !== null;
  return cachedHasUserSectionsTable;
}

export function resolveRoleFromFlat(row: {
  is_admin?: number | null;
  is_educational?: number | null;
  is_programs?: number | null;
  is_teacher?: number | null;
  is_track_supervisor?: number | null;
}): UserRole {
  if (row.is_admin === 1) return "super_admin";
  if (row.is_educational === 1) return "edu_supervisor";
  if (row.is_programs === 1) return "programs_supervisor";
  if (row.is_track_supervisor === 1) return "track_supervisor";
  if (row.is_teacher === 1) return "teacher";
  return "super_admin";
}

function sectionsFromFlatFlags(row: {
  is_admin?: number | null;
  is_educational?: number | null;
  is_programs?: number | null;
  is_teacher?: number | null;
}): string[] {
  const sections: string[] = [];
  if (row.is_admin === 1) sections.push("admin");
  if (row.is_educational === 1) sections.push("education");
  if (row.is_programs === 1) sections.push("programs");
  if (row.is_teacher === 1 && !sections.includes("education")) {
    sections.push("education");
  }
  return sections.length ? sections : ["admin", "education", "programs"];
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
  is_track_supervisor?: number | null;
};

function toUserRow(raw: RawUser): UserRow {
  const role =
    raw.role && typeof raw.role === "string"
      ? normalizeUserRole(raw.role)
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
            is_admin, is_educational, is_programs, is_teacher, is_track_supervisor
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
}

export async function loadUserByMobile(
  env: Env,
  rawMobile: string,
): Promise<UserRow | null> {
  const keys = mobileLookupVariants(rawMobile);
  if (!keys.length) return null;

  const normalized = normalizeMobile(rawMobile.trim());
  const cols = await getUserColumns(env);
  const hasDeletedAt = cols.has("deleted_at");
  const notDeleted = hasDeletedAt
    ? "AND (deleted_at IS NULL OR TRIM(deleted_at) = '')"
    : "";
  const placeholders = keys.map(() => "?").join(", ");
  const orderSql = normalized
    ? `ORDER BY CASE WHEN mobile = ? THEN 0 WHEN mobile = ? THEN 1 ELSE 2 END, id DESC`
    : "ORDER BY id DESC";

  const sqlRole = `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active, role
     FROM users
     WHERE mobile IN (${placeholders})
       AND COALESCE(is_active, 1) = 1
       ${notDeleted}
     ${orderSql}
     LIMIT 1`;
  const sqlFlat = `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
            is_admin, is_educational, is_programs, is_teacher, is_track_supervisor
     FROM users
     WHERE mobile IN (${placeholders})
       AND COALESCE(is_active, 1) = 1
       ${notDeleted}
     ${orderSql}
     LIMIT 1`;

  const binds = normalized
    ? [...keys, normalized, `966${normalized.slice(1)}`]
    : keys;

  return queryUser(env, sqlRole, sqlFlat, binds);
}

export async function loadUserPayload(env: Env, userId: number) {
  const cols = await getUserColumns(env);
  const hasRole = cols.has("role");
  const hasSupervisorScope = cols.has("supervisor_scope");
  const hasStageScope = cols.has("stage_scope");

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
                is_admin, is_educational, is_programs, is_teacher, is_track_supervisor${
                  hasStageScope ? ", stage_scope" : ""
                }
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
          is_track_supervisor?: number | null;
          stage_scope?: string | null;
        }>();

  if (!user) return null;

  let sections: string[] = ["admin", "education", "programs"];
  if (await hasUserSectionsTable(env)) {
    const sectionRows = await env.DB.prepare(
      "SELECT section FROM user_sections WHERE user_id = ?",
    )
      .bind(userId)
      .all<{ section: string }>();
    if (sectionRows.results?.length) {
      sections = sectionRows.results.map((r) => r.section);
    }
  } else if (!hasRole) {
    sections = sectionsFromFlatFlags(
      user as Parameters<typeof sectionsFromFlatFlags>[0],
    );
  }

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
        : hasStageScope && "stage_scope" in user && user.stage_scope
          ? String(user.stage_scope)
          : "global",
    sections,
  };
}
