import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  clearAuth,
  getAuthUser,
  getSession,
  loginWithMobile,
  type AuthUser,
} from "../lib/auth-store";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (mobile: string) => AuthUser | null;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("basateen-auth", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("basateen-auth", callback);
  };
}

function getSnapshot() {
  return getSession();
}

function notifyAuthChange() {
  window.dispatchEvent(new Event("basateen-auth"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const login = useCallback((mobile: string) => {
    const user = loginWithMobile(mobile);
    if (user) notifyAuthChange();
    return user;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    notifyAuthChange();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session != null,
      login,
      logout,
    }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthUser(): AuthUser | null {
  return getAuthUser();
}
