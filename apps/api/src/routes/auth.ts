import type { Env, UserRow } from "../types";
import { createToken, getAuth } from "../middleware/auth";
import { verifyPassword, hashPassword } from "../lib/password";
import { sha256Hex } from "../lib/crypto";
import { normalizeMobile } from "../lib/mobile";
import {
  loadUserByEmail,
  loadUserByMobile,
  loadUserPayload,
} from "../lib/db-user";
import { tableHasColumn } from "../lib/db-schema";
import {
  DEFAULT_STAFF_PASSWORD,
  resolveJwtSecret,
} from "../lib/setup-guard";

async function userMustChangePassword(
  env: Env,
  userId: number,
  plaintext?: string,
): Promise<boolean> {
  const hasCol = await tableHasColumn(env, "users", "must_change_password");
  if (hasCol) {
    const row = await env.DB.prepare(
      "SELECT must_change_password FROM users WHERE id = ?",
    )
      .bind(userId)
      .first<{ must_change_password: number | null }>();
    if (Number(row?.must_change_password ?? 0) === 1) return true;
  }
  if (plaintext && plaintext === DEFAULT_STAFF_PASSWORD && userId !== 1) {
    return true;
  }
  return false;
}

async function clearMustChangePassword(env: Env, userId: number): Promise<void> {
  if (!(await tableHasColumn(env, "users", "must_change_password"))) return;
  await env.DB.prepare(
    "UPDATE users SET must_change_password = 0 WHERE id = ?",
  )
    .bind(userId)
    .run();
}

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
    resolveJwtSecret(env),
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

function passwordChangeRequiredResponse(userId: number): Response {
  return Response.json(
    {
      error: "password_change_required",
      user_id: userId,
      message: "يجب تغيير كلمة المرور الافتراضية قبل الدخول — استخدم «تغيير كلمة المرور»",
    },
    { status: 403 },
  );
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

  if (await userMustChangePassword(env, user.id, body.password)) {
    return passwordChangeRequiredResponse(user.id);
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

  const user = await loadUserByMobile(env, mobile);

  if (!user) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.is_active !== 1) {
    return Response.json({ error: "account_frozen" }, { status: 403 });
  }

  if (await userMustChangePassword(env, user.id)) {
    return passwordChangeRequiredResponse(user.id);
  }

  const { token } = await issueSession(env, user);
  const payload = await loadUserPayload(env, user.id);

  return Response.json({ token, user: payload });
}

/** تغيير كلمة المرور — أول دخول أو تحديث */
export async function handleChangePassword(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  let body: {
    email?: string;
    mobile?: string;
    current_password?: string;
    new_password?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const newPassword = body.new_password?.trim() ?? "";
  if (newPassword.length < 8) {
    return Response.json({ error: "weak_password" }, { status: 400 });
  }
  if (newPassword === DEFAULT_STAFF_PASSWORD) {
    return Response.json({ error: "default_password_forbidden" }, { status: 400 });
  }

  const currentPassword = body.current_password ?? "";
  if (!currentPassword) {
    return Response.json({ error: "current_password_required" }, { status: 400 });
  }

  let user: UserRow | null = null;
  if (body.email?.trim()) {
    user = await loadUserByEmail(env, body.email.trim().toLowerCase());
  } else if (body.mobile?.trim()) {
    const mob = normalizeMobile(body.mobile.trim());
    if (!mob) {
      return Response.json({ error: "invalid_mobile" }, { status: 400 });
    }
    user = await loadUserByMobile(env, mob);
  } else {
    const auth = await getAuth(request, env);
    if (auth) {
      user = await env.DB.prepare(
        "SELECT id, email, mobile, password_hash, role, full_name_ar, complex_id, is_active FROM users WHERE id = ?",
      )
        .bind(auth.userId)
        .first<UserRow>();
    }
  }

  if (!user || user.is_active !== 1) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const password_hash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(password_hash, user.id)
    .run();
  await clearMustChangePassword(env, user.id);

  const { token } = await issueSession(env, user);
  const payload = await loadUserPayload(env, user.id);
  return Response.json({ ok: true, token, user: payload });
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
