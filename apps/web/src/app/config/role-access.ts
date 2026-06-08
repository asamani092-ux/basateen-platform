import type { UserRole } from "../lib/auth-store";

export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/admin-dept/reports",
  edu_supervisor: "/edu-dept/dashboard",
  admin_supervisor: "/admin-dept/staff-attendance",
  prog_supervisor: "/prog-dept/quizzes",
  programs_supervisor: "/prog-dept/quizzes",
  track_supervisor: "/edu-dept/daily-recitation",
  teacher: "/edu-dept/daily-recitation",
};

/** مسار البداية الصحيح — يُصحّح الجلسات القديمة (general-supervisor وغيرها) */
export function roleHomePath(role: UserRole): string {
  return ROLE_HOME[role];
}

export function normalizeStoredHomePath(role: UserRole, homePath: string): string {
  if (
    homePath.includes("general-supervisor") ||
    homePath === "/dashboard" ||
    (homePath.startsWith("/admin/") && !homePath.startsWith("/admin-dept/"))
  ) {
    return ROLE_HOME[role];
  }
  if (pathAllowedForRole(role, homePath)) return homePath;
  return ROLE_HOME[role];
}

export const STAFF_ROLES: UserRole[] = [
  "super_admin",
  "edu_supervisor",
  "programs_supervisor",
  "track_supervisor",
  "teacher",
];

const PATH_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/super-admin", roles: ["super_admin"] },
  { prefix: "/edu-dept", roles: ["edu_supervisor", "super_admin", "teacher", "track_supervisor"] },
  { prefix: "/admin-dept", roles: ["super_admin"] },
  { prefix: "/prog-dept", roles: ["programs_supervisor", "super_admin"] },
  { prefix: "/display-dept", roles: ["super_admin"] },
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/tv-live", roles: STAFF_ROLES },
  { prefix: "/live-log", roles: STAFF_ROLES },
  {
    prefix: "/welcome",
    roles: ["super_admin", "edu_supervisor", "programs_supervisor", "track_supervisor", "teacher"],
  },
];

/** Legacy URL redirects (pre–great-purge) */
export const LEGACY_REDIRECTS: Record<string, string | "home"> = {
  "/admin/staff": "/super-admin/staff",
  "/admin/circles-setup": "/super-admin/circles-setup",
  "/admin/statistics": "/admin-dept/reports",
  "/super-admin/statistics": "/admin-dept/reports",
  "/edu-supervisor": "/edu-dept/dashboard",
  "/edu-supervisor/dashboard": "/edu-dept/dashboard",
  "/edu-supervisor/master-grid": "/edu-dept/master-grid",
  "/edu-supervisor/placement": "/edu-dept/master-grid",
  "/edu-supervisor/students": "/edu-dept/students",
  "/edu-supervisor/transfers": "/edu-dept/transfers",
  "/edu-supervisor/circles": "/edu-dept/circles",
  "/edu-supervisor/events-engine": "/edu-dept/competitions",
  "/edu-supervisor/yom-himma": "/edu-dept/competitions",
  "/edu-supervisor/competitions": "/edu-dept/competitions",
  "/general-supervisor": "/admin-dept/staff-attendance",
  "/general-supervisor/student-attendance": "/admin-dept/student-attendance",
  "/general-supervisor/staff": "/admin-dept/staff-attendance",
  "/general-supervisor/staff-attendance": "/admin-dept/staff-attendance",
  "/general-supervisor/admissions": "/admin-dept/students",
  "/admin-dept/admissions": "/admin-dept/students",
  "/general-supervisor/violations": "/admin-dept/pledges",
  "/general-supervisor/dashboard": "/admin-dept/reports",
  "/admin-dept/dashboard": "/admin-dept/reports",
  "/admin-dept/violations": "/admin-dept/pledges",
  "/prog-supervisor": "/prog-dept/quizzes",
  "/dashboard": "home",
  "/teacher": "/edu-dept/daily-recitation",
  "/teacher/daily-log": "/edu-dept/daily-recitation",
};

const TEACHER_ONLY_EDU_PATHS = ["/edu-dept/teacher-competitions"];

const RECITATION_EDU_PATH = "/edu-dept/daily-recitation";
const RECITATION_ROLES: UserRole[] = [
  "teacher",
  "track_supervisor",
  "edu_supervisor",
  "super_admin",
  "programs_supervisor",
];

export function pathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (pathname === "/login" || pathname === "/tv-live") return true;
  if (pathname.startsWith("/quiz/")) return true;
  if (pathname.startsWith("/live-log/")) return true;
  if (pathname.startsWith("/public/")) return true;

  for (const prefix of TEACHER_ONLY_EDU_PATHS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return role === "teacher" || role === "track_supervisor";
    }
  }

  if (
    pathname === RECITATION_EDU_PATH ||
    pathname.startsWith(`${RECITATION_EDU_PATH}/`)
  ) {
    return RECITATION_ROLES.includes(role);
  }

  for (const rule of PATH_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles.includes(role);
    }
  }
  return false;
}

export function resolveLegacyRedirect(
  pathname: string,
  role: UserRole,
): string | null {
  const exact = LEGACY_REDIRECTS[pathname];
  if (exact) return exact === "home" ? ROLE_HOME[role] : exact;
  if (pathname.startsWith("/edu-supervisor/")) {
    return pathname.replace("/edu-supervisor", "/edu-dept");
  }
  if (pathname.startsWith("/general-supervisor/")) {
    return pathname.replace("/general-supervisor", "/admin-dept");
  }
  if (pathname.startsWith("/prog-supervisor/")) {
    return pathname.replace("/prog-supervisor", "/prog-dept");
  }
  if (pathname.startsWith("/admin/") && !pathname.startsWith("/admin-dept/")) {
    return pathname.replace(/^\/admin/, "/super-admin");
  }
  return null;
}

export const TV_LAUNCH_ROLES: UserRole[] = ["super_admin"];
