import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { hasTable, tableHasColumn } from "../lib/db-schema";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function migrationRequired(): Response {
  return json({ error: "migration_required", table: "display_media" }, 503);
}

const DISPLAY_ROLES = ["super_admin"] as const;

const VALID_SLIDE_TYPES = ["media", "kpi", "competition"] as const;
type SlideType = (typeof VALID_SLIDE_TYPES)[number];

function clampDuration(sec: number, fallback = 12): number {
  const n = Number(sec);
  if (!Number.isFinite(n)) return fallback;
  return n >= 3 && n <= 120 ? Math.round(n) : fallback;
}

async function hasSlideTypeColumn(env: Env): Promise<boolean> {
  return tableHasColumn(env, "display_media", "slide_type");
}

async function loadDisplaySettings(env: Env, complexId: number) {
  let slideSeconds = 12;
  let indicatorsEnabled = true;
  if (await hasTable(env, "complex_settings")) {
    const hasSeconds = await tableHasColumn(env, "complex_settings", "display_slide_seconds");
    const hasIndicators = await tableHasColumn(
      env,
      "complex_settings",
      "display_indicators_enabled",
    );
    const cols: string[] = [];
    if (hasSeconds) cols.push("display_slide_seconds");
    if (hasIndicators) cols.push("display_indicators_enabled");
    if (cols.length) {
      const row = await env.DB.prepare(
        `SELECT ${cols.join(", ")} FROM complex_settings WHERE complex_id = ?`,
      )
        .bind(complexId)
        .first<{
          display_slide_seconds?: number;
          display_indicators_enabled?: number;
        }>();
      if (hasSeconds) slideSeconds = clampDuration(Number(row?.display_slide_seconds ?? 12));
      if (hasIndicators) indicatorsEnabled = (row?.display_indicators_enabled ?? 1) !== 0;
    }
  }
  return { slide_seconds: slideSeconds, indicators_enabled: indicatorsEnabled };
}

function serializeMediaRow(
  row: Record<string, unknown>,
  defaultSeconds: number,
  hasSlideCols: boolean,
) {
  const slideType = hasSlideCols
    ? String(row.slide_type ?? "media")
    : "media";
  const duration = hasSlideCols
    ? clampDuration(Number(row.duration_seconds ?? defaultSeconds), defaultSeconds)
    : defaultSeconds;
  return {
    id: Number(row.id),
    slide_type: slideType,
    media_type: String(row.media_type ?? "image"),
    media_url: String(row.media_url ?? ""),
    competition_id:
      hasSlideCols && row.competition_id != null ? Number(row.competition_id) : null,
    duration_seconds: duration,
    display_order: Number(row.display_order ?? 0),
    is_active: Number(row.is_active ?? 1),
    created_at: String(row.created_at ?? ""),
  };
}

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

  const method = request.method;
  const complexId = auth.complexId;
  const hasSlideCols = await hasSlideTypeColumn(env);

  if (method === "GET" && path === "/api/display-dept/settings") {
    return json(await loadDisplaySettings(env, complexId));
  }

  if (method === "PATCH" && path === "/api/display-dept/settings") {
    let body: { slide_seconds?: number; indicators_enabled?: boolean };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!(await hasTable(env, "complex_settings"))) {
      return json({ error: "migration_required" }, 503);
    }
    const hasSeconds = await tableHasColumn(env, "complex_settings", "display_slide_seconds");
    const hasIndicators = await tableHasColumn(
      env,
      "complex_settings",
      "display_indicators_enabled",
    );
    let sec: number | undefined;
    if (body.slide_seconds != null) {
      const raw = Number(body.slide_seconds);
      if (!Number.isFinite(raw) || raw < 3 || raw > 120) {
        return json({ error: "invalid_slide_seconds" }, 400);
      }
      sec = clampDuration(raw);
    }
    const indicators =
      body.indicators_enabled != null ? (body.indicators_enabled ? 1 : 0) : undefined;

    const existing = await env.DB.prepare(
      `SELECT complex_id FROM complex_settings WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first();

    if (existing) {
      const sets: string[] = [];
      const binds: Array<number> = [];
      if (sec != null && hasSeconds) {
        sets.push("display_slide_seconds = ?");
        binds.push(sec);
      }
      if (indicators != null && hasIndicators) {
        sets.push("display_indicators_enabled = ?");
        binds.push(indicators);
      }
      if (sets.length) {
        binds.push(complexId);
        await env.DB.prepare(
          `UPDATE complex_settings SET ${sets.join(", ")} WHERE complex_id = ?`,
        )
          .bind(...binds)
          .run();
      }
    } else {
      const cols = ["complex_id"];
      const vals = ["?"];
      const binds: Array<number> = [complexId];
      if (sec != null && hasSeconds) {
        cols.push("display_slide_seconds");
        vals.push("?");
        binds.push(sec);
      }
      if (indicators != null && hasIndicators) {
        cols.push("display_indicators_enabled");
        vals.push("?");
        binds.push(indicators);
      }
      await env.DB.prepare(
        `INSERT INTO complex_settings (${cols.join(", ")}) VALUES (${vals.join(", ")})`,
      )
        .bind(...binds)
        .run();
    }

    const settings = await loadDisplaySettings(env, complexId);
    return json({ ok: true, ...settings });
  }

  if (method === "GET" && path === "/api/display-dept/competitions") {
    if (!(await hasTable(env, "competitions"))) {
      return json({ items: [] });
    }
    const rows = await env.DB.prepare(
      `SELECT id, name_ar, start_date, end_date, status
       FROM competitions
       WHERE complex_id = ?
       ORDER BY start_date DESC, id DESC
       LIMIT 100`,
    )
      .bind(complexId)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (!(await hasTable(env, "display_media"))) return migrationRequired();

  const selectCols = hasSlideCols
    ? "id, slide_type, media_type, media_url, competition_id, duration_seconds, display_order, is_active, created_at"
    : "id, media_type, media_url, display_order, is_active, created_at";

  if (method === "GET" && path === "/api/display-dept/media") {
    const settings = await loadDisplaySettings(env, complexId);
    const rows = await env.DB.prepare(
      `SELECT ${selectCols}
       FROM display_media
       WHERE complex_id = ?
       ORDER BY display_order ASC, id ASC`,
    )
      .bind(complexId)
      .all();
    const items = (rows.results ?? []).map((r) =>
      serializeMediaRow(r as Record<string, unknown>, settings.slide_seconds, hasSlideCols),
    );
    return json({ items });
  }

  if (method === "POST" && path === "/api/display-dept/media") {
    let body: {
      slide_type?: string;
      media_type?: string;
      media_url?: string;
      competition_id?: number;
      duration_seconds?: number;
      display_order?: number;
      is_active?: number;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const settings = await loadDisplaySettings(env, complexId);
    const slideType = String(body.slide_type ?? "media").trim() as SlideType;
    if (!VALID_SLIDE_TYPES.includes(slideType)) {
      return json({ error: "invalid_slide_type" }, 400);
    }

    const duration = clampDuration(
      Number(body.duration_seconds ?? settings.slide_seconds),
      settings.slide_seconds,
    );

    let mediaType = String(body.media_type ?? "image").trim();
    let mediaUrl = String(body.media_url ?? "").trim();
    let competitionId: number | null = null;

    if (slideType === "media") {
      if (!["image", "gif", "video"].includes(mediaType)) {
        return json({ error: "invalid_media_type" }, 400);
      }
      if (!mediaUrl) return json({ error: "media_url_required" }, 400);
      if (mediaUrl.length > 10_000_000) return json({ error: "media_too_large" }, 400);
    } else if (slideType === "kpi") {
      mediaType = "image";
      mediaUrl = mediaUrl || "-";
    } else {
      competitionId = Number(body.competition_id);
      if (!Number.isFinite(competitionId) || competitionId <= 0) {
        return json({ error: "competition_id_required" }, 400);
      }
      const comp = await env.DB.prepare(
        `SELECT id FROM competitions WHERE id = ? AND complex_id = ?`,
      )
        .bind(competitionId, complexId)
        .first();
      if (!comp) return json({ error: "competition_not_found" }, 404);
      mediaType = "image";
      mediaUrl = mediaUrl || "-";
    }

    const maxRow = await env.DB.prepare(
      `SELECT COALESCE(MAX(display_order), 0) AS m FROM display_media WHERE complex_id = ?`,
    )
      .bind(complexId)
      .first<{ m: number }>();

    let ins;
    if (hasSlideCols) {
      ins = await env.DB.prepare(
        `INSERT INTO display_media (
           complex_id, slide_type, media_type, media_url, competition_id,
           duration_seconds, display_order, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          complexId,
          slideType,
          mediaType,
          mediaUrl,
          competitionId,
          duration,
          Number(body.display_order) || (maxRow?.m ?? 0) + 1,
          body.is_active === 0 ? 0 : 1,
        )
        .run();
    } else {
      ins = await env.DB.prepare(
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
    }

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
        slide_type?: string;
        media_type?: string;
        media_url?: string;
        competition_id?: number;
        duration_seconds?: number;
        display_order?: number;
        is_active?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const settings = await loadDisplaySettings(env, complexId);
      const row = await env.DB.prepare(`SELECT ${selectCols} FROM display_media WHERE id = ?`)
        .bind(mediaId)
        .first<Record<string, unknown>>();

      const slideType = (body.slide_type?.trim() ??
        (hasSlideCols ? String(row?.slide_type ?? "media") : "media")) as SlideType;
      if (!VALID_SLIDE_TYPES.includes(slideType)) {
        return json({ error: "invalid_slide_type" }, 400);
      }

      const mediaType = body.media_type?.trim() ?? String(row?.media_type ?? "image");
      const mediaUrl = body.media_url?.trim() ?? String(row?.media_url ?? "");
      const duration = clampDuration(
        Number(body.duration_seconds ?? row?.duration_seconds ?? settings.slide_seconds),
        settings.slide_seconds,
      );
      let competitionId =
        body.competition_id != null
          ? Number(body.competition_id)
          : hasSlideCols && row?.competition_id != null
            ? Number(row.competition_id)
            : null;

      if (slideType === "media") {
        if (!["image", "gif", "video"].includes(mediaType)) {
          return json({ error: "invalid_media_type" }, 400);
        }
        if (!mediaUrl) return json({ error: "media_url_required" }, 400);
        if (mediaUrl.length > 10_000_000) return json({ error: "media_too_large" }, 400);
        competitionId = null;
      } else if (slideType === "competition") {
        if (!Number.isFinite(competitionId) || (competitionId ?? 0) <= 0) {
          return json({ error: "competition_id_required" }, 400);
        }
      } else {
        competitionId = null;
      }

      if (hasSlideCols) {
        await env.DB.prepare(
          `UPDATE display_media SET
             slide_type = ?,
             media_type = ?,
             media_url = ?,
             competition_id = ?,
             duration_seconds = ?,
             display_order = ?,
             is_active = ?
           WHERE id = ? AND complex_id = ?`,
        )
          .bind(
            slideType,
            mediaType,
            mediaUrl || "-",
            competitionId,
            duration,
            body.display_order ?? Number(row?.display_order ?? 0),
            body.is_active === 0 ? 0 : body.is_active === 1 ? 1 : Number(row?.is_active ?? 1),
            mediaId,
            complexId,
          )
          .run();
      } else {
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
            body.display_order ?? Number(row?.display_order ?? 0),
            body.is_active === 0 ? 0 : body.is_active === 1 ? 1 : Number(row?.is_active ?? 1),
            mediaId,
            complexId,
          )
          .run();
      }
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
