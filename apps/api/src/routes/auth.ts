import type { Env } from "../types";
import type { UserRow } from "../types";
import { createToken, getAuth } from "../middleware/auth";
import { verifyPassword } from "../lib/password";
import { sha256Hex } from "../lib/crypto";
import { normalizeMobile } from "../lib/mobile";
import type { UserRole } from "../types";

type UsersSchemaMode = "legacy-role" | "flat-v25";

async function detectUsersSchemaMode(env: Env): Promise<UsersSchemaMode> {
  const info = await env.DB.prepare("PRAGMA table_info(users)").all<{
    name: string;
  }>();
  const names = new Set((info.results ?? []).map((c) => c.name));
  return names.has("role") ? "legacy-role" : "flat-v25";
}

function roleFromFlags(row: {
  is_admin?: number;
  is_educational?: number;
  is_programs?: number;
  is_teacher?: number;
  is_track_supervisor?: number;
}): UserRole {
  if (row.is_teacher === 1) return "teacher";
  if (row.is_programs === 1) return "prog_supervisor";
  if (row.is_educational === 1) return "edu_supervisor";
  if (row.is_admin === 1) return "general_manager";
  if (row.is_track_supervisor === 1) return "edu_supervisor";
  return "general_manager";
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
  const mode = await detectUsersSchemaMode(env);
  const user =
    mode === "legacy-role"
      ? await env.DB.prepare(
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
          }>()
      : await env.DB.prepare(
          `SELECT id, email, mobile, full_name_ar, complex_id,
                  COALESCE(is_admin,0) AS is_admin,
                  COALESCE(is_educational,0) AS is_educational,
                  COALESCE(is_programs,0) AS is_programs,
                  COALESCE(is_teacher,0) AS is_teacher,
                  COALESCE(is_track_supervisor,0) AS is_track_supervisor,
                  COALESCE(stage_scope,'global') AS stage_scope
           FROM users WHERE id = ? AND is_active = 1`,
        )
          .bind(userId)
          .first<{
            id: number;
            email: string;
            mobile: string | null;
            full_name_ar: string;
            complex_id: number;
            is_admin: number;
            is_educational: number;
            is_programs: number;
            is_teacher: number;
            is_track_supervisor: number;
            stage_scope: string | null;
          }>();

  if (!user) return null;

  const sections =
    mode === "legacy-role"
      ? await env.DB.prepare(
          "SELECT section FROM user_sections WHERE user_id = ?",
        )
          .bind(userId)
          .all<{ section: string }>()
          .catch(() => ({ results: [] }))
      : ({
          results: [
            ...(user.is_admin ? [{ section: "admin" }] : []),
            ...(user.is_educational || user.is_teacher || user.is_track_supervisor
              ? [{ section: "education" }]
              : []),
            ...(user.is_programs ? [{ section: "programs" }] : []),
          ],
        } as { results?: Array<{ section: string }> });

  return {
    id: user.id,
    email: user.email,
    mobile: user.mobile,
    full_name_ar: user.full_name_ar,
    role: mode === "legacy-role" ? user.role : roleFromFlags(user),
    supervisor_scope:
      mode === "legacy-role"
        ? user.supervisor_scope ?? "global"
        : user.stage_scope ?? "global",
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

  const mode = await detectUsersSchemaMode(env);
  const user =
    mode === "legacy-role"
      ? await env.DB.prepare(
          `SELECT id, email, mobile, password_hash, role, full_name_ar, complex_id, is_active
           FROM users WHERE email = ? LIMIT 1`,
        )
          .bind(body.email.trim().toLowerCase())
          .first<UserRow>()
      : await env.DB.prepare(
          `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
                  COALESCE(is_admin,0) AS is_admin,
                  COALESCE(is_educational,0) AS is_educational,
                  COALESCE(is_programs,0) AS is_programs,
                  COALESCE(is_teacher,0) AS is_teacher,
                  COALESCE(is_track_supervisor,0) AS is_track_supervisor
           FROM users WHERE email = ? LIMIT 1`,
        )
          .bind(body.email.trim().toLowerCase())
          .first<
            Omit<UserRow, "role"> & {
              is_admin: number;
              is_educational: number;
              is_programs: number;
              is_teacher: number;
              is_track_supervisor: number;
            }
          >();

  if (!user || user.is_active !== 1) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const authUser =
    mode === "legacy-role"
      ? user
      : ({ ...user, role: roleFromFlags(user) } as UserRow);
  const { token } = await issueSession(env, authUser);
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

  const mode = await detectUsersSchemaMode(env);
  const user =
    mode === "legacy-role"
      ? await env.DB.prepare(
          `SELECT id, email, mobile, password_hash, role, full_name_ar, complex_id, is_active
           FROM users WHERE mobile = ? LIMIT 1`,
        )
          .bind(mobile)
          .first<UserRow>()
      : await env.DB.prepare(
          `SELECT id, email, mobile, password_hash, full_name_ar, complex_id, is_active,
                  COALESCE(is_admin,0) AS is_admin,
                  COALESCE(is_educational,0) AS is_educational,
                  COALESCE(is_programs,0) AS is_programs,
                  COALESCE(is_teacher,0) AS is_teacher,
                  COALESCE(is_track_supervisor,0) AS is_track_supervisor
           FROM users WHERE mobile = ? LIMIT 1`,
        )
          .bind(mobile)
          .first<
            Omit<UserRow, "role"> & {
              is_admin: number;
              is_educational: number;
              is_programs: number;
              is_teacher: number;
              is_track_supervisor: number;
            }
          >();

  if (!user) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.is_active !== 1) {
    return Response.json({ error: "account_frozen" }, { status: 403 });
  }

  const authUser =
    mode === "legacy-role"
      ? user
      : ({ ...user, role: roleFromFlags(user) } as UserRow);
  const { token } = await issueSession(env, authUser);
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
