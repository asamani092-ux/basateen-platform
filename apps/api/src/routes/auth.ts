import type { Env } from "../env";

/** Placeholder — full auth in next phase after users table + JWT_SECRET */
export async function handleLogin(
  request: Request,
  _env: Env,
): Promise<Response> {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }

  return Response.json(
    {
      error: "not_implemented",
      message: "سيتم تفعيل تسجيل الدخول بعد تنفيذ جداول users و JWT",
    },
    { status: 501 },
  );
}

export function handleMe(_request: Request, _env: Env): Response {
  return Response.json(
    { error: "not_implemented", message: "يتطلب جلسة مصادقة" },
    { status: 501 },
  );
}
