import type { Env } from "../env";

export function handleHealth(
  _request: Request,
  _env: Env,
): Response {
  return Response.json({ ok: true, service: "basateen-api" });
}
