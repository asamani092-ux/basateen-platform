import type { Env } from "../types";

export type LiveSessionKind = "yom_himma" | "competition";

export type ResolvedLiveSession = {
  kind: LiveSessionKind;
  id: number;
  complexId: number;
  name_ar: string;
  date: string;
  status: string;
  access_pin: string;
  rules: Record<string, unknown>;
  tv_key: string;
  created_by_user_id: number | null;
};

export async function resolveLiveSessionByToken(
  env: Env,
  token: string,
): Promise<ResolvedLiveSession | null> {
  const himma = await env.DB.prepare(
    `SELECT id, complex_id, name_ar, session_date, status, rules_json,
            tv_launch_key, access_pin, created_by_user_id
     FROM yom_himma_sessions
     WHERE live_log_token = ? OR tv_launch_key = ?
     LIMIT 1`,
  )
    .bind(token, token)
    .first<{
      id: number;
      complex_id: number;
      name_ar: string;
      session_date: string;
      status: string;
      rules_json: string;
      access_pin: string;
      tv_launch_key: string;
      created_by_user_id: number | null;
    }>();

  if (himma) {
    return {
      kind: "yom_himma",
      id: himma.id,
      complexId: himma.complex_id,
      name_ar: himma.name_ar,
      date: himma.session_date,
      status: himma.status,
      access_pin: himma.access_pin ?? "1234",
      rules: JSON.parse(himma.rules_json) as Record<string, unknown>,
      tv_key: himma.tv_launch_key,
      created_by_user_id: himma.created_by_user_id,
    };
  }

  const comp = await env.DB.prepare(
    `SELECT id, complex_id, name_ar, start_date, status, rules_json,
            tv_launch_key, access_pin, created_by_user_id
     FROM competitions
     WHERE live_log_token = ? OR tv_launch_key = ?
     LIMIT 1`,
  )
    .bind(token, token)
    .first<{
      id: number;
      complex_id: number;
      name_ar: string;
      start_date: string;
      status: string;
      rules_json: string;
      access_pin: string;
      tv_launch_key: string;
      created_by_user_id: number | null;
    }>();

  if (comp) {
    return {
      kind: "competition",
      id: comp.id,
      complexId: comp.complex_id,
      name_ar: comp.name_ar,
      date: comp.start_date,
      status: comp.status,
      access_pin: comp.access_pin ?? "1234",
      rules: JSON.parse(comp.rules_json || "{}") as Record<string, unknown>,
      tv_key: comp.tv_launch_key,
      created_by_user_id: comp.created_by_user_id,
    };
  }

  return null;
}

export function liveContextType(
  kind: LiveSessionKind,
): "yom_himma" | "competition" {
  return kind;
}
