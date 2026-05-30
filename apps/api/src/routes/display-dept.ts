import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable } from "../lib/db-schema";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function migrationRequired(): Response {
  return json({ error: "migration_required", table: "display_media" }, 503);
}

const DISPLAY_ROLES = ["super_admin"] as const;

export async function handleDisplayDeptRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/display-dept/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...DISPLAY_ROLES])) return json({ error: "forbidden" }, 403);
  if (!(await hasTable(env, "display_media"))) return migrationRequired();

  const method = request.method;
  const complexId = auth.complexId;

  if (method === "GET" && path === "/api/display-dept/media") {
    const rows = await env.DB.prepare(
      `SELECT id, media_type, media_url, display_order, is_active, created_at
       FROM display_media
       WHERE complex_id = ?
       ORDER BY display_order ASC, id ASC`,
    )
      .bind(complexId)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (method === "POST" && path === "/api/display-dept/media") {
    let body: {
      media_type?: string;
      media_url?: string;
      display_order?: number;
      is_active?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const mediaType = String(body.media_type ?? "image").trim();
    if (!["image", "gif", "video"].includes(mediaType)) {
      return json({ error: "invalid_media_type" }, 400);
    }
    const mediaUrl = String(body.media_url ?? "").trim();
    if (!mediaUrl) return json({ error: "media_url_required" }, 400);
    if (mediaUrl.length > 500_000) {
      return json({ error: "media_too_large" }, 400);
    }

    const maxRow = await env.DB.prepare(
      `SELECT COALESCE(MAX(display_order), 0) AS m FROM display_media WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first<{ m: number }>();

    const ins = await env.DB.prepare(
      `INSERT INTO display_media (complex_id, media_type, media_url, display_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        complexId,
        mediaType,
        mediaUrl,
        Number(body.display_order) || (maxRow?.m ?? 0) + 1,
        body.is_active === 0 ? 0 : 1,
      )
      .run();

    return json({ ok: true, id: ins.meta.last_row_id });
  }

  const mediaMatch = path.match(/^\/api\/display-dept\/media\/(\d+)$/);
  if (mediaMatch) {
    const mediaId = Number(mediaMatch[1]);
    const owned = await env.DB.prepare(
      `SELECT id FROM display_media WHERE id = ? AND complex_id = ?`,
    )
      .bind(mediaId, complexId)
      .first();
    if (!owned) return json({ error: "not_found" }, 404);

    if (method === "PATCH") {
      let body: {
        media_type?: string;
        media_url?: string;
        display_order?: number;
        is_active?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const row = await env.DB.prepare(
        `SELECT media_type, media_url, display_order, is_active FROM display_media WHERE id = ?`,
      )
        .bind(mediaId)
        .first<{
          media_type: string;
          media_url: string;
          display_order: number;
          is_active: number;
        }>();

      const mediaType = body.media_type?.trim() ?? row?.media_type ?? "image";
      if (!["image", "gif", "video"].includes(mediaType)) {
        return json({ error: "invalid_media_type" }, 400);
      }
      const mediaUrl = body.media_url?.trim() ?? row?.media_url ?? "";
      if (!mediaUrl) return json({ error: "media_url_required" }, 400);
      if (mediaUrl.length > 500_000) return json({ error: "media_too_large" }, 400);

      await env.DB.prepare(
        `UPDATE display_media SET
           media_type = ?,
           media_url = ?,
           display_order = ?,
           is_active = ?
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          mediaType,
          mediaUrl,
          body.display_order ?? row?.display_order ?? 0,
          body.is_active === 0 ? 0 : body.is_active === 1 ? 1 : (row?.is_active ?? 1),
          mediaId,
          complexId,
        )
        .run();
      return json({ ok: true });
    }

    if (method === "DELETE") {
      await env.DB.prepare(`DELETE FROM display_media WHERE id = ? AND complex_id = ?`)
        .bind(mediaId, complexId)
        .run();
      return json({ ok: true });
    }
  }

  if (method === "POST" && path === "/api/display-dept/media/reorder") {
    let body: { order?: number[] };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const order = body.order ?? [];
    for (let i = 0; i < order.length; i++) {
      await env.DB.prepare(
        `UPDATE display_media SET display_order = ? WHERE id = ? AND complex_id = ?`,
      )
        .bind(i + 1, order[i], complexId)
        .run();
    }
    return json({ ok: true });
  }

  return json({ error: "not_found" }, 404);
}
