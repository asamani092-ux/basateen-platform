import type { Env } from "./types";
import { handleOptions, withCors } from "./middleware/cors";
import { handleHealth } from "./routes/health";
import { handleTvSummary } from "./routes/tv-summary";
import { handleLogin, handleMe } from "./routes/auth";
import { handleSeedUsers } from "./routes/setup";
import { handleStudentsList } from "./routes/students";
import {
  handleStudentsBulkImport,
  handleStudentsExport,
} from "./routes/students-bulk";
import { handleCirclesList } from "./routes/circles";
import {
  handleStudentDetail,
  handleStudentTransfer,
} from "./routes/transfers";

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
) => Promise<Response> | Response;

const routes: Array<{ method: string; pattern: RegExp; handler: RouteHandler }> = [
  { method: "GET", pattern: /^\/api\/health$/, handler: handleHealth },
  { method: "GET", pattern: /^\/api\/tv\/summary$/, handler: handleTvSummary },
  { method: "POST", pattern: /^\/api\/auth\/login$/, handler: handleLogin },
  { method: "GET", pattern: /^\/api\/auth\/me$/, handler: handleMe },
  { method: "POST", pattern: /^\/api\/setup\/seed-users$/, handler: handleSeedUsers },
  { method: "GET", pattern: /^\/api\/circles$/, handler: handleCirclesList },
  { method: "GET", pattern: /^\/api\/students$/, handler: handleStudentsList },
  { method: "GET", pattern: /^\/api\/students\/export$/, handler: handleStudentsExport },
  { method: "POST", pattern: /^\/api\/students\/bulk$/, handler: handleStudentsBulkImport },
  {
    method: "GET",
    pattern: /^\/api\/students\/\d+$/,
    handler: handleStudentDetail,
  },
  {
    method: "POST",
    pattern: /^\/api\/students\/\d+\/transfer$/,
    handler: handleStudentTransfer,
  },
];

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const options = handleOptions(request);
  if (options) return options;

  const url = new URL(request.url);

  for (const route of routes) {
    if (request.method === route.method && route.pattern.test(url.pathname)) {
      const response = await route.handler(request, env, url);
      return withCors(response, request);
    }
  }

  return withCors(
    Response.json({ error: "Not Found", path: url.pathname }, { status: 404 }),
    request,
  );
}
