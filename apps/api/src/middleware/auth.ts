import type { AuthContext, Env, UserRole } from "../types";
import type { DbUserRow } from "../../../../packages/types/schema";
import { normalizeUserRole, resolveRoleFromUser } from "../../../../packages/types/schema";

const encoder = new TextEncoder();
const authFailureFlags = new WeakMap<Request, "legacy_session_detected" | "unauthorized">();
const VALID_ROLES: UserRole[] = [
  "super_admin",
  "edu_supervisor",
  "admin_supervisor",
  "prog_supervisor",
  "teacher",
];

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? encoder.encode(data)
      : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(signature);
}

export async function createToken(
  ctx: AuthContext,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(
    JSON.stringify({
      sub: ctx.userId,
      role: ctx.role,
      complexId: ctx.complexId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
  const signature = await sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<AuthContext | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = await sign(`${header}.${body}`, secret);
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as {
      sub: number;
      role: UserRole;
      complexId: number;
      exp: number;
    };

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      userId: payload.sub,
      role: payload.role,
      complexId: payload.complexId,
    };
  } catch {
    return null;
  }
}

async function verifyTokenWithReason(
  token: string,
  secret: string,
): Promise<{ auth: AuthContext | null; reason: "legacy_session_detected" | "unauthorized" | null }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { auth: null, reason: "legacy_session_detected" };

  const [header, body, signature] = parts;
  const expected = await sign(`${header}.${body}`, secret);
  if (signature !== expected) return { auth: null, reason: "legacy_session_detected" };

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as {
      sub?: number;
      role?: string;
      complexId?: number;
      exp?: number;
      is_admin?: number;
    };

    // Reject legacy/contaminated schema explicitly (flat flags inside JWT)
    if (typeof payload.is_admin !== "undefined") {
      return { auth: null, reason: "legacy_session_detected" };
    }
  const role = normalizeUserRole(String(payload.role ?? ""));
    if (
      typeof payload.sub !== "number" ||
      typeof payload.complexId !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.role !== "string" ||
      !VALID_ROLES.includes(role)
    ) {
      return { auth: null, reason: "legacy_session_detected" };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { auth: null, reason: "unauthorized" };
    }
    return {
      auth: {
        userId: payload.sub,
        role,
        complexId: payload.complexId,
      },
      reason: null,
    };
  } catch {
    return { auth: null, reason: "legacy_session_detected" };
  }
}

export async function getAuth(
  request: Request,
  env: Env,
): Promise<AuthContext | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const secret = env.JWT_SECRET || "dev-only-change-in-production";
  const verified = await verifyTokenWithReason(token, secret);
  if (!verified.auth) {
    authFailureFlags.set(request, verified.reason ?? "unauthorized");
    return null;
  }

  const pragma = await env.DB.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const hasRole = (pragma.results ?? []).some((c) => c.name === "role");

  const userRow = hasRole
    ? await env.DB.prepare(
        `SELECT id, is_active, role FROM users WHERE id = ? LIMIT 1`,
      )
        .bind(verified.auth.userId)
        .first<{ id: number; is_active: number | null; role: string | null }>()
    : await env.DB.prepare(
        `SELECT id, is_active, is_admin, is_educational, is_programs, is_teacher
         FROM users WHERE id = ? LIMIT 1`,
      )
        .bind(verified.auth.userId)
        .first<DbUserRow & { id: number; is_active: number | null }>();

  if (!userRow || typeof userRow.is_active === "undefined" || userRow.is_active !== 1) {
    authFailureFlags.set(request, "legacy_session_detected");
    return null;
  }
  const role = normalizeUserRole(
    hasRole
      ? String((userRow as { role: string }).role)
      : resolveRoleFromUser(userRow as DbUserRow),
  );
  if (!VALID_ROLES.includes(role)) {
    authFailureFlags.set(request, "legacy_session_detected");
    return null;
  }

  return verified.auth;
}

export function requireAuth(
  auth: AuthContext | null,
): auth is AuthContext {
  return auth !== null;
}

export function requireRoles(
  auth: AuthContext,
  roles: UserRole[],
): boolean {
  return roles.includes(auth.role);
}

export function authUnauthorizedResponse(request: Request): Response {
  const reason = authFailureFlags.get(request) ?? "unauthorized";
  if (reason === "legacy_session_detected") {
    return Response.json(
      {
        error: "legacy_session_detected",
        message: "Legacy or contaminated role context found. Purging browser state.",
        clear_polluted_session: true,
      },
      { status: 401 },
    );
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
