import { api } from "./api-client";
import { normalizeMobile } from "./auth-store";

const API_TOKEN_KEY = "basateen_api_token";

/** ربط الجوال التجريبي بحسابات API في D1 */
export const MOBILE_API_CREDENTIALS: Record<
  string,
  { email: string; password: string }
> = {
  "0500000001": {
    email: "admin@basateen.local",
    password: "Basateen123!",
  },
  "0500000002": {
    email: "supervisor@basateen.local",
    password: "Basateen123!",
  },
  "0500000003": {
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
  const creds = MOBILE_API_CREDENTIALS[mobile];
  if (!creds) return false;
  try {
    const res = await api.login(creds.email, creds.password);
    setApiToken(res.token);
    return true;
  } catch {
    setApiToken(null);
    return false;
  }
}
