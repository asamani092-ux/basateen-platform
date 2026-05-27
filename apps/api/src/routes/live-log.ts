import type { Env } from "../types";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleLiveLogRouter(
  _request: Request,
  _env: Env,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.match(/^\/api\/live-log\/([^/]+)$/)) return null;
  return json(
    {
      error: "deprecated",
      message:
        "تم إغلاق الرصد المفتوح. استخدم POST /api/v1/education/public/validate-gate",
      validate_gate: "/api/v1/education/public/validate-gate",
    },
    410,
  );
}

export { handleYomHimmaLiveLogToken } from "./live-log-token";
