import type { Env } from "../types";
import type { UserRow } from "../types";
import { createToken, getAuth } from "../middleware/auth";
import { verifyPassword } from "../lib/password";
import { sha256Hex } from "../lib/crypto";

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
    `SELECT id, email, password_hash, role, full_name_ar, complex_id, is_active
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

  const sections = await env.DB.prepare(
    "SELECT section FROM user_sections WHERE user_id = ?",
  )
    .bind(user.id)
    .all<{ section: string }>();

  return Response.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name_ar: user.full_name_ar,
      role: user.role,
      sections: sections.results?.map((r) => r.section) ?? [],
    },
  });
}

export async function handleMe(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!auth) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await env.DB.prepare(
    `SELECT id, email, full_name_ar, role, complex_id
     FROM users WHERE id = ? AND is_active = 1`,
  )
    .bind(auth.userId)
    .first<{
      id: number;
      email: string;
      full_name_ar: string;
      role: string;
      complex_id: number;
    }>();

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const sections = await env.DB.prepare(
    "SELECT section FROM user_sections WHERE user_id = ?",
  )
    .bind(auth.userId)
    .all<{ section: string }>();

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      full_name_ar: user.full_name_ar,
      role: user.role,
      sections: sections.results?.map((r) => r.section) ?? [],
    },
  });
}
