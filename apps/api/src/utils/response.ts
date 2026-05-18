export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function error(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
