/**
 * بروكسي /api/* على Pages → Worker (نفس النطاق = بدون CORS)
 */
const API_ORIGIN = "https://winter-term-cb93.a-samani092.workers.dev";

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;

  const method = context.request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  return fetch(target, {
    method,
    headers: context.request.headers,
    body: hasBody ? await context.request.arrayBuffer() : undefined,
  });
};
