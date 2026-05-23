import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleComplexSettingsGet(
  _request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(_request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare(
    `SELECT graduates_count, huffadh_count, display_slides_json, display_mode
     FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(auth.complexId)
    .first<{
      graduates_count: number;
      huffadh_count: number;
      display_slides_json: string | null;
      display_mode: string;
    }>();

  return json({
    graduates_count: row?.graduates_count ?? 0,
    huffadh_count: row?.huffadh_count ?? 0,
    display_mode: row?.display_mode ?? "carousel",
    slides: row?.display_slides_json
      ? JSON.parse(row.display_slides_json)
      : [],
  });
}

export async function handleComplexSettingsPatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ["general_manager"])) {
    return json({ error: "forbidden" }, 403);
  }

  let body: {
    graduates_count?: number;
    huffadh_count?: number;
    display_mode?: string;
    slides?: unknown[];
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const cur = await env.DB.prepare(
    `SELECT graduates_count, huffadh_count, display_slides_json, display_mode
     FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(auth.complexId)
    .first<{
      graduates_count: number;
      huffadh_count: number;
      display_slides_json: string | null;
      display_mode: string;
    }>();

  const graduates =
    body.graduates_count ?? cur?.graduates_count ?? 0;
  const huffadh = body.huffadh_count ?? cur?.huffadh_count ?? 0;
  const mode = body.display_mode ?? cur?.display_mode ?? "carousel";
  const slidesJson = body.slides
    ? JSON.stringify(body.slides)
    : cur?.display_slides_json ?? "[]";

  await env.DB.prepare(
    `INSERT INTO complex_settings (complex_id, graduates_count, huffadh_count, display_slides_json, display_mode)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(complex_id) DO UPDATE SET
       graduates_count = excluded.graduates_count,
       huffadh_count = excluded.huffadh_count,
       display_slides_json = excluded.display_slides_json,
       display_mode = excluded.display_mode,
       updated_at = datetime('now')`,
  )
    .bind(auth.complexId, graduates, huffadh, slidesJson, mode)
    .run();

  return json({ ok: true });
}
