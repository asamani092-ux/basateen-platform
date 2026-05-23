import type { Env } from "../env";

export function handleHealth(_request: Request, env: Env): Response {
  const production = (env.ENVIRONMENT ?? "").toLowerCase() === "production";
  const jwtOk = Boolean(env.JWT_SECRET?.length);

  return Response.json({
    ok: true,
    service: "basateen-api",
    environment: env.ENVIRONMENT ?? "development",
    jwt_configured: jwtOk,
    ...(production && !jwtOk
      ? { warning: "JWT_SECRET missing — set wrangler secret before go-live" }
      : {}),
  });
}
