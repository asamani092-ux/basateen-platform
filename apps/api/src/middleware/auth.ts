import type { AuthContext, Env, UserRole } from "../types";

const encoder = new TextEncoder();

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

export async function getAuth(
  request: Request,
  env: Env,
): Promise<AuthContext | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const secret = env.JWT_SECRET || "dev-only-change-in-production";
  return verifyToken(token, secret);
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
