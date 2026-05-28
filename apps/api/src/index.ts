import type { Env } from "./types";
import { handleRequest } from "./router";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env).catch((error: unknown) => {
      console.error("Sovereign global exception:", error);
      return Response.json(
        {
          error: "api_internal_crash",
          message: error instanceof Error ? error.message : "Internal server error",
        },
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    });
  },
};
