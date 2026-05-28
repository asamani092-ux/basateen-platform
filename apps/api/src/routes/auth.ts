import type { Env } from "../types";
import type { UserRow } from "../types";
import { createToken, getAuth } from "../middleware/auth";
import { verifyPassword } from "../lib/password";
import { sha256Hex } from "../lib/crypto";
import { normalizeMobile } from "../lib/mobile";

async function issueSession(
  env: Env,
  user: Pick<UserRow, "id" | "role" | "complex_id">,
): Promise<{ token: string; expiresAt: string }> {
  const token = await createToken(
    {
      userId: user.id,
      role: user.role,
      complexId: user.complex_id,
    },
    env.JWT_SECRET || "dev-only-change-in-production",
  );

  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
  )
    .bind(user.id, tokenHash, expiresAt)
    .run();

  return { token, expiresAt };
}

async function userPayload(env: Env, userId: number) {
  const user = await env.DB.prepare(
    `SELECT id, email, mobile, full_name_ar, role, complex_id, supervisor_scope
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
      supervisor_scope: string | null;
    }>();

  if (!user) return null;

  const sections = await env.DB.prepare(
    "SELECT section FROM user_sections WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ section: string }>();

  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile,
    full_name_ar: user.full_name_ar,
    role: user.role,
    supervisor_scope: user.supervisor_scope ?? "global",
    sections: sections.results?.map((r) => r.section) ?? [],
  };
}

/** Legacy email/password — used by api-token bridge until full mobile API */
export async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }

  const user = await env.DB.prepare(
    `SELECT id, email, mobile, password_hash, role, full_name_ar, complex_id, is_active
     FROM users WHERE email = ? LIMIT 1`,
  )
    .bind(body.email.trim().toLowerCase())
    .first<UserRow>();

  if (!user || user.is_active !== 1) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { token } = await issueSession(env, user);
  const payload = await userPayload(env, user.id);

  return Response.json({ token, user: payload });
}

/** Mobile-only login — MASTER-SPEC */
export async function handleLoginMobile(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { mobile?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = normalizeMobile(body.mobile ?? "");
  if (!mobile) {
    return Response.json({ error: "invalid_mobile" }, { status: 400 });
  }

  const keys = mobileLookupKeys(mobile);
  const placeholders = keys.map(() => "?").join(", ");
  const user = await env.DB.prepare(
    `SELECT id, email, mobile, password_hash, role, full_name_ar, complex_id, is_active
     FROM users WHERE mobile IN (${placeholders}) LIMIT 1`,
  )
    .bind(...keys)
    .first<UserRow>();

  if (!user) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.is_active !== 1) {
    return Response.json({ error: "account_frozen" }, { status: 403 });
  }

  const { token } = await issueSession(env, user);
  const payload = await userPayload(env, user.id);

  return Response.json({ token, user: payload });
}

export async function handleMe(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!auth) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await userPayload(env, auth.userId);
  if (!payload) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ user: payload });
}
