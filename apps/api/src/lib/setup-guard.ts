import type { Env } from "../types";

export function isProductionEnv(env: Env): boolean {
  return (env.ENVIRONMENT ?? "").toLowerCase() === "production";
}

/** يمنع seed الأمثلة (Edu/Prog) على بيئة الإنتاج */
export function demoSetupBlockedResponse(env: Env): Response | null {
  if (!isProductionEnv(env)) return null;
  return Response.json(
    {
      error: "gone",
      message: "تعطيل seed الأمثلة في الإنتاج — استخدم seed-users فقط عند الإعداد الأول",
    },
    { status: 410 },
  );
}

const DEV_JWT_FALLBACK = "dev-only-change-in-production";

/** O(1) — سر JWT: إلزامي في الإنتاج، افتراضي محلي فقط */
export function resolveJwtSecret(env: Env): string {
  if (env.JWT_SECRET?.length) return env.JWT_SECRET;
  if (isProductionEnv(env)) {
    throw new Error("JWT_SECRET is required in production");
  }
  return DEV_JWT_FALLBACK;
}

/** O(1) — يرفض الإقلاع في الإنتاج بدون أسرار إلزامية */
export function productionSecretsGuard(env: Env): Response | null {
  if (!isProductionEnv(env)) return null;
  const missing: string[] = [];
  if (!env.JWT_SECRET?.length) missing.push("JWT_SECRET");
  if (!env.SETUP_KEY?.length) missing.push("SETUP_KEY");
  if (!missing.length) return null;
  return Response.json(
    {
      error: "misconfigured",
      message: `Production requires secrets: ${missing.join(", ")}`,
    },
    { status: 503 },
  );
}

/** O(1) — التحقق من رمز الوصول لشاشة التلفاز العامة */
export function tvAccessAllowed(request: Request, env: Env): boolean {
  const required = env.TV_ACCESS_TOKEN?.trim();
  if (!required) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token")?.trim();
  const fromHeader = request.headers.get("X-TV-Token")?.trim();
  return fromQuery === required || fromHeader === required;
}

export const DEFAULT_STAFF_PASSWORD = "Basateen123!";
