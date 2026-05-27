import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { FIELD_EDU_ROLES } from "../lib/roles";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleYomHimmaLiveLogToken(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/yom-himma\/(\d+)\/live-log-token$/);
  if (request.method !== "POST" || !m) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, FIELD_EDU_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const sessionId = Number(m[1]);
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  await env.DB.prepare(
    `UPDATE yom_himma_sessions SET live_log_token = ?, status = 'live', updated_at = datetime('now')
     WHERE id = ? AND complex_id = ?`,
  )
    .bind(token, sessionId, auth.complexId)
    .run();

  return json({ ok: true, live_log_token: token, path: `/live-log/${token}` });
}
