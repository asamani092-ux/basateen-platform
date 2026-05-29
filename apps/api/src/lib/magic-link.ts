import type { Env } from "../types";
import { hasTable } from "./db-schema";

export type MagicLinkContext = {
  circle_id?: number;
  attendance_date?: string;
  scope?: string;
};

export function randomMagicToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseMagicContext(raw: string | null | undefined): MagicLinkContext {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as MagicLinkContext;
  } catch {
    return {};
  }
}

export type SharedAccessTokenRow = {
  id: number;
  complex_id: number;
  token: string;
  feature_name: string;
  context_data: string;
  is_active: number;
  created_by_user_id: number;
  created_at: string;
  deactivated_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

export async function loadSharedToken(
  env: Env,
  token: string,
): Promise<SharedAccessTokenRow | null> {
  if (!(await hasTable(env, "shared_access_tokens"))) return null;
  const row = await env.DB.prepare(
    `SELECT id, complex_id, token, feature_name, context_data, is_active,
            created_by_user_id, created_at, deactivated_at, expires_at,
            last_used_at, use_count
     FROM shared_access_tokens WHERE token = ? LIMIT 1`,
  )
    .bind(token)
    .first<SharedAccessTokenRow>();
  return row ?? null;
}

/** Active when is_active=1; expires_at is optional and not enforced if NULL */
export function isSharedTokenUsable(row: SharedAccessTokenRow): boolean {
  if (row.is_active !== 1) return false;
  if (!row.expires_at) return true;
  const exp = Date.parse(`${row.expires_at}T23:59:59Z`);
  if (Number.isNaN(exp)) return true;
  return Date.now() <= exp;
}

export async function touchSharedTokenUse(env: Env, tokenId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE shared_access_tokens
     SET use_count = use_count + 1, last_used_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(tokenId)
    .run();
}
