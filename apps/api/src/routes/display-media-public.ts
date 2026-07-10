import type { Env } from "../types";
import { extractR2KeyFromPublicUrl, r2Available } from "../lib/display-media-r2";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** O(1) I/O — بث كائن R2 للعرض العام (شاشة التلفزيون) */
export async function handleDisplayMediaPublicRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const prefix = "/api/public/display-media/";
  if (!url.pathname.startsWith(prefix)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!r2Available(env)) return json({ error: "not_found" }, 404);

  const encodedKey = url.pathname.slice(prefix.length);
  if (!encodedKey) return json({ error: "not_found" }, 404);

  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return json({ error: "not_found" }, 404);
  }

  const obj = await env.DISPLAY_MEDIA.get(key);
  if (!obj) return json({ error: "not_found" }, 404);

  const headers = new Headers();
  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");

  if (request.method === "HEAD") {
    if (obj.size != null) headers.set("Content-Length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  return new Response(obj.body, { status: 200, headers });
}

/** يُستخدم في الاختبارات — التحقق من مطابقة المفتاح للرابط */
export function displayMediaKeyFromUrl(mediaUrl: string): string | null {
  return extractR2KeyFromPublicUrl(mediaUrl);
}
