import type { Env } from "./env";
import { handleRequest } from "./router";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
