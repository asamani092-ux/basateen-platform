import type { Env } from "../types";
import type { LiveSessionKind } from "./live-session";

const encoder = new TextEncoder();

export type ReciterAuthContext = {
  role: "reciter_live";
  sessionKind: LiveSessionKind;
  sessionId: number;
  complexId: number;
  liveToken: string;
  markDate: string;
  loggedByUserId: number;
};

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
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

export async function createReciterToken(
  ctx: ReciterAuthContext,
  secret: string,
  expiresInSeconds = 60 * 60 * 12,
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(
    JSON.stringify({
      role: "reciter_live",
      sessionKind: ctx.sessionKind,
      sessionId: ctx.sessionId,
      complexId: ctx.complexId,
      liveToken: ctx.liveToken,
      markDate: ctx.markDate,
      loggedByUserId: ctx.loggedByUserId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
  );
  const signature = await sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export async function verifyReciterToken(
  token: string,
  secret: string,
): Promise<ReciterAuthContext | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = await sign(`${header}.${body}`, secret);
  if (signature !== expected) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as {
      role: string;
      sessionKind: LiveSessionKind;
      sessionId: number;
      complexId: number;
      liveToken: string;
      markDate: string;
      loggedByUserId: number;
      exp: number;
    };
    if (payload.role !== "reciter_live") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      role: "reciter_live",
      sessionKind: payload.sessionKind,
      sessionId: payload.sessionId,
      complexId: payload.complexId,
      liveToken: payload.liveToken,
      markDate: payload.markDate,
      loggedByUserId: payload.loggedByUserId,
    };
  } catch {
    return null;
  }
}

export async function getReciterAuth(
  request: Request,
  env: Env,
): Promise<ReciterAuthContext | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const secret = env.JWT_SECRET || "dev-only-change-in-production";
  return verifyReciterToken(header.slice(7), secret);
}
