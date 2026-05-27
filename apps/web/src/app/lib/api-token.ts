import { api } from "./api-client";
import { ApiRequestError } from "./api-errors";
import { normalizeMobile } from "./auth-store";
import { DEV_PREVIEW_TOKEN, isUiDevPreview } from "./dev-preview";

const API_TOKEN_KEY = "basateen_api_token";

/** ربط الجوال التجريبي بحسابات API في D1 (بعد seed) */
export const MOBILE_API_CREDENTIALS: Record<
  string,
  { email: string; password: string }
> = {
  "0500000001": {
    email: "manager@basateen.local",
    password: "Basateen123!",
  },
  "0500000002": {
    email: "edu@basateen.local",
    password: "Basateen123!",
  },
  "0500000003": {
    email: "programs@basateen.local",
    password: "Basateen123!",
  },
  "0500000004": {
    email: "general@basateen.local",
    password: "Basateen123!",
  },
  "0500000005": {
    email: "teacher@basateen.local",
    password: "Basateen123!",
  },
};

export type ApiTokenSyncFailure =
  | "no_credentials"
  | "network"
  | "database"
  | "not_seeded"
  | "invalid_credentials"
  | "server";

export type ApiTokenSyncResult =
  | { ok: true }
  | { ok: false; reason: ApiTokenSyncFailure; detail?: string };

export function getApiToken(): string | null {
  return localStorage.getItem(API_TOKEN_KEY);
}

export function setApiToken(token: string | null): void {
  if (token) localStorage.setItem(API_TOKEN_KEY, token);
  else localStorage.removeItem(API_TOKEN_KEY);
}

export function clearApiToken(): void {
  localStorage.removeItem(API_TOKEN_KEY);
}

function mapLoginError(err: unknown): ApiTokenSyncResult {
  if (err instanceof ApiRequestError) {
    if (err.status === 503 || err.code === "database_error") {
      return {
        ok: false,
        reason: "database",
        detail: err.message,
      };
    }
    if (err.status === 401 || err.code === "invalid_credentials") {
      return { ok: false, reason: "invalid_credentials", detail: err.message };
    }
    return { ok: false, reason: "server", detail: err.message };
  }
  if (err instanceof TypeError) {
    return {
      ok: false,
      reason: "network",
      detail: "تعذّر الوصول إلى /api — تحقق من بروكسي Vite أو Worker",
    };
  }
  return {
    ok: false,
    reason: "server",
    detail: err instanceof Error ? err.message : undefined,
  };
}

/** O(1) — فحص صحة + طلب login واحد بعد دخول الجوال */
export async function syncApiTokenForMobile(
  rawMobile: string,
): Promise<ApiTokenSyncResult> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return { ok: false, reason: "no_credentials" };
  if (isUiDevPreview()) {
    setApiToken(DEV_PREVIEW_TOKEN);
    return { ok: true };
  }
  const creds = MOBILE_API_CREDENTIALS[mobile];
  if (!creds) return { ok: false, reason: "no_credentials" };

  try {
    const health = await api.health();
    if (health.db && !health.db.ok) {
      return {
        ok: false,
        reason: "database",
        detail: health.db.hint,
      };
    }
    if (health.db && !health.db.seeded) {
      return {
        ok: false,
        reason: "not_seeded",
        detail: health.db.hint,
      };
    }
  } catch (err) {
    return mapLoginError(err);
  }

  try {
    const res = await api.loginMobile(mobile).catch(() =>
      api.login(creds.email, creds.password),
    );
    setApiToken(res.token);
    return { ok: true };
  } catch (err) {
    setApiToken(null);
    return mapLoginError(err);
  }
}

export function apiTokenSyncErrorMessage(result: ApiTokenSyncResult): string {
  if (result.ok) return "";
  switch (result.reason) {
    case "network":
      return (
        result.detail ??
        "تعذّر الاتصال بالـ API — شغّل Worker (wrangler dev) أو تحقق من بروكسي Vite (/api)"
      );
    case "database":
      return (
        result.detail ??
        "قاعدة البيانات غير جاهزة — نفّذ ترحيل D1 ثم أعد المحاولة"
      );
    case "not_seeded":
      return (
        result.detail ??
        "لا يوجد مستخدمون في D1 — من الجذر: npm run setup:local (أو seed-users على Worker)"
      );
    case "invalid_credentials":
      return "بيانات الدخول غير موجودة في قاعدة البيانات — شغّل seed-users على Worker";
    case "no_credentials":
      return "رقم الجوال غير مربوط بحساب API";
    default:
      return (
        result.detail ??
        "تعذّر ربط API — تحقق من نشر Worker وحسابات seed"
      );
  }
}

/** @deprecated استخدم ApiTokenSyncResult */
export async function syncApiTokenForMobileLegacy(
  rawMobile: string,
): Promise<boolean> {
  const r = await syncApiTokenForMobile(rawMobile);
  return r.ok;
}
