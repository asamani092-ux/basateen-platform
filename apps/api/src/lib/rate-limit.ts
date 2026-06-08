const DEFAULT_MAX = 40;
const DEFAULT_WINDOW_SEC = 60;

function clientKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Simple cache-backed rate limiter for public endpoints.
 * Time O(1) per request; Space O(1) per IP bucket in cache.
 */
export async function enforceRateLimit(
  request: Request,
  bucket: string,
  maxRequests = DEFAULT_MAX,
  windowSec = DEFAULT_WINDOW_SEC,
): Promise<Response | null> {
  const cache = caches.default;
  const key = `https://rate-limit.internal/${bucket}/${clientKey(request)}`;
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= maxRequests) {
    return Response.json(
      { error: "rate_limited", message: "طلبات كثيرة — انتظر قليلاً" },
      { status: 429 },
    );
  }
  await cache.put(
    key,
    new Response(String(count + 1), {
      headers: { "Cache-Control": `max-age=${windowSec}` },
    }),
  );
  return null;
}
