const SESSION_KEY = "basateen_session";

const LEGACY_TOKEN_KEY = "basateen_token";



export type UserRole =

  | "teacher"

  | "edu_supervisor"

  | "prog_supervisor"

  | "general_supervisor"

  | "general_manager";



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

  mock: boolean;

};



/** Mock users — mobile only (MASTER-SPEC) */

const MOCK_BY_MOBILE: Record<string, Omit<AuthUser, "mobile">> = {

  "0500000001": {

    id: 1,

    full_name_ar: "عبدالله — مدير عام",

    role: "general_manager",

    sections: ["admin"],

    homePath: "/admin/staff",

  },

  "0500000002": {

    id: 2,

    full_name_ar: "مشرف تعليمي",

    role: "edu_supervisor",

    sections: ["admin", "education"],

    homePath: "/edu-supervisor/dashboard",

  },

  "0500000003": {

    id: 3,

    full_name_ar: "مشرف البرامج",

    role: "prog_supervisor",

    sections: ["programs"],

    homePath: "/prog-supervisor",

  },

  "0500000004": {

    id: 4,

    full_name_ar: "مشرف عام",

    role: "general_supervisor",

    sections: ["admin", "education", "programs"],

    homePath: "/general-supervisor/student-attendance",

  },

  "0500000005": {

    id: 5,

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



function isValidSession(data: unknown): data is AuthSession {

  if (!data || typeof data !== "object") return false;

  const s = data as AuthSession;

  const u = s.user;

  const roles: UserRole[] = [

    "teacher",

    "edu_supervisor",

    "prog_supervisor",

    "general_supervisor",

    "general_manager",

  ];

  return Boolean(u?.homePath && u?.role && u?.full_name_ar && u?.mobile) && roles.includes(u.role);

}



/** تنظيف جلسة قديمة (أدوار/توكن قديم) */

export function sanitizeStoredAuth(): void {

  try {

    localStorage.removeItem(LEGACY_TOKEN_KEY);

  } catch {

    /* ignore */

  }

  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) return;

  try {

    const parsed: unknown = JSON.parse(raw);

    if (!isValidSession(parsed)) {

      localStorage.removeItem(SESSION_KEY);

      return;

    }

    const role = (parsed as AuthSession).user.role as string;
    if (role === "supervisor") {
      localStorage.removeItem(SESSION_KEY);

    }

  } catch {

    localStorage.removeItem(SESSION_KEY);

  }

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

/** Session from real API login (D1 user — not mock whitelist) */
export function loginWithApiUser(
  apiUser: {
    id: number;
    full_name_ar: string;
    role: UserRole;
    sections?: string[];
  },
  rawMobile: string,
  homePath: string,
): AuthUser | null {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return null;
  const user: AuthUser = {
    id: apiUser.id,
    mobile,
    full_name_ar: apiUser.full_name_ar,
    role: apiUser.role,
    sections: apiUser.sections ?? [],
    homePath,
  };
  const session: AuthSession = { user, mock: false };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return user;
}



export function getSession(): AuthSession | null {

  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) return null;

  try {

    const parsed: unknown = JSON.parse(raw);

    if (!isValidSession(parsed)) return null;

    return parsed;

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

  try {

    localStorage.removeItem(LEGACY_TOKEN_KEY);

  } catch {

    /* ignore */

  }

}



/** @deprecated Mock auth — no JWT in session */

export function getToken(): string | null {

  return null;

}


