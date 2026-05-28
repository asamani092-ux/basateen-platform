import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAuth,
  getSession,
  loginWithMobile,
  sanitizeStoredAuth,
  type AuthSession,
  type AuthUser,
} from "../lib/auth-store";
import { resetClientSession } from "../lib/session-reset";

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (mobile: string) => AuthUser | null;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getSession());

  useEffect(() => {
    sanitizeStoredAuth();
    setSession(getSession());

    function sync() {
      setSession(getSession());
    }

    window.addEventListener("basateen-auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("basateen-auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback((mobile: string) => {
    const user = loginWithMobile(mobile);
    setSession(getSession());
    window.dispatchEvent(new Event("basateen-auth"));
    return user;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    clearApiToken();
    setSession(null);
    window.dispatchEvent(new Event("basateen-auth"));
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
