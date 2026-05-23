import type { Env } from "../types";

export function isProductionEnv(env: Env): boolean {
  return (env.ENVIRONMENT ?? "").toLowerCase() === "production";
}

/** يمنع seed الأمثلة (Edu/Prog) على بيئة الإنتاج */
export function demoSetupBlockedResponse(env: Env): Response | null {
  if (!isProductionEnv(env)) return null;
  return Response.json(
    {
      error: "disabled_in_production",
      message: "تعطيل seed الأمثلة في الإنتاج — استخدم seed-users فقط عند الإعداد الأول",
    },
    { status: 403 },
  );
}
