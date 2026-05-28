import { api } from "./api-client";
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

/** O(1) — طلب login واحد بعد دخول الجوال */
export async function syncApiTokenForMobile(
  rawMobile: string,
): Promise<boolean> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return false;
  if (isUiDevPreview()) {
    setApiToken(DEV_PREVIEW_TOKEN);
    return true;
  }
  const creds = MOBILE_API_CREDENTIALS[mobile];
  try {
    const res = creds
      ? await api.loginMobile(mobile).catch(() =>
          api.login(creds.email, creds.password),
        )
      : await api.loginMobile(mobile);
    setApiToken(res.token);
    return true;
  } catch {
    setApiToken(null);
    return false;
  }
}
