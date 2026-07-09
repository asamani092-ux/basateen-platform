/**
 * بروكسي /api/* على Pages → Worker (نفس النطاق = بدون CORS)
 */
const API_ORIGIN = "https://winter-term-cb93.a-samani092.workers.dev";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;

  const method = context.request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  const response = await fetch(target, {
    method,
    headers: context.request.headers,
    body: hasBody ? await context.request.arrayBuffer() : undefined,
  });

  if (url.pathname.includes("/competitions")) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
};
