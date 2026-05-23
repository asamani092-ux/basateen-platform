import type { Env } from "../env";
import { isProductionEnv } from "../lib/setup-guard";

export function handleHealth(_request: Request, env: Env): Response {
  const production = isProductionEnv(env);
  return Response.json({
    ok: true,
    service: "basateen-api",
    environment: env.ENVIRONMENT ?? "development",
    jwt_configured: Boolean(env.JWT_SECRET?.length),
    ...(production && !env.JWT_SECRET
      ? { warning: "JWT_SECRET missing — set wrangler secret before go-live" }
      : {}),
  });
}