const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);

  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith(".pages.dev"))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return withCors(new Response(null, { status: 204 }), request);
}
