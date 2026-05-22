const SESSION_KEY = "basateen_session";

export type UserRole = "general_manager" | "supervisor" | "teacher";

export type AuthUser = {
  id: number;
  mobile: string;
  full_name_ar: string;
  role: UserRole;
  sections: string[];
  homePath: string;
};

export type AuthSession = {
  user: AuthUser;
  mock: true;
};

/** Mock users — mobile only (no email/password) */
const MOCK_BY_MOBILE: Record<string, Omit<AuthUser, "mobile">> = {
  "0500000001": {
    id: 1,
    full_name_ar: "عبدالله — مدير عام",
    role: "general_manager",
    sections: ["admin", "education", "programs"],
    homePath: "/dashboard",
  },
  "0500000002": {
    id: 2,
    full_name_ar: "مشرف الحلقات",
    role: "supervisor",
    sections: ["admin", "education"],
    homePath: "/dashboard",
  },
  "0500000003": {
    id: 3,
    full_name_ar: "معلم حلقة الصديق",
    role: "teacher",
    sections: ["education"],
    homePath: "/teacher",
  },
};

export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) return digits;
  if (digits.length === 12 && digits.startsWith("9665")) return `0${digits.slice(3)}`;
  return null;
}

export function loginWithMobile(rawMobile: string): AuthUser | null {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return null;
  const profile = MOCK_BY_MOBILE[mobile];
  if (!profile) return null;
  const user: AuthUser = { ...profile, mobile };
  const session: AuthSession = { user, mock: true };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return user;
}

export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getAuthUser(): AuthUser | null {
  return getSession()?.user ?? null;
}

export function isLoggedIn(): boolean {
  return Boolean(getSession());
}

export function isMockAuth(): boolean {
  return getSession()?.mock === true;
}

export function clearAuth(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** @deprecated Mock auth — no JWT */
export function getToken(): string | null {
  return null;
}
