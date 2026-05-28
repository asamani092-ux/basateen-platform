import type { Env } from "../types";
import type { UserRow } from "../types";
import { createToken, getAuth } from "../middleware/auth";
import { verifyPassword } from "../lib/password";
import { sha256Hex } from "../lib/crypto";
import { normalizeMobile } from "../lib/mobile";
import { loadUserByEmail, loadUserByMobile, loadUserPayload } from "../lib/db-user";

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

  const user = await loadUserByEmail(env, body.email.trim().toLowerCase());

  if (!user || user.is_active !== 1) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { token } = await issueSession(env, user);
  const payload = await loadUserPayload(env, user.id);

  return Response.json({ token, user: payload });
}

/** Mobile-only login — MASTER-SPEC */
export async function handleLoginMobile(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { mobile?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = normalizeMobile(body.mobile ?? "");
  if (!mobile) {
    return Response.json({ error: "invalid_mobile" }, { status: 400 });
  }

  const user = await loadUserByMobile(env, mobile);

  if (!user) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.is_active !== 1) {
    return Response.json({ error: "account_frozen" }, { status: 403 });
  }

  if (body.password) {
    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }
  }

  const { token } = await issueSession(env, user);
  const payload = await loadUserPayload(env, user.id);

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

  const payload = await loadUserPayload(env, auth.userId);
  if (!payload) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({ user: payload });
}
