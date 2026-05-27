const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://basateen.sam-dev.win",
  "https://sam-dev.win",
]);

function extraOriginsFromEnv(env?: { CORS_ALLOWED_ORIGINS?: string }): Set<string> {
  const raw = env?.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function withCors(
  response: Response,
  request: Request,
  env?: { CORS_ALLOWED_ORIGINS?: string },
): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);
  const allowed = extraOriginsFromEnv(env);

  if (
    origin &&
    (LOCAL_ORIGINS.has(origin) ||
      allowed.has(origin) ||
      origin.endsWith(".pages.dev"))
  ) {
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

export function handleOptions(
  request: Request,
  env?: { CORS_ALLOWED_ORIGINS?: string },
): Response | null {
  if (request.method !== "OPTIONS") return null;
  return withCors(new Response(null, { status: 204 }), request, env);
}
