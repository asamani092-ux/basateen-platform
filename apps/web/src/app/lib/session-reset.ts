import { clearAuth } from "./auth-store";
import { clearApiToken } from "./api-token";

const LEGACY_KEYS = ["auth_token", "basateen_token"] as const;

/** O(k) — k = number of legacy keys; clears client auth after server session purge signal */
export function resetClientSession(): void {
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  clearAuth();
  clearApiToken();
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function redirectToLoginAfterSessionReset(): void {
  const path = window.location.pathname;
  if (path === "/login" || path.startsWith("/login/")) return;
  window.location.replace("/login?reason=session_reset");
}
