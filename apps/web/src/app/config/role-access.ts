import type { UserRole } from "../lib/auth-store";

export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: "/admin-dept/reports",
  edu_supervisor: "/edu-dept/dashboard",
  admin_supervisor: "/admin-dept/staff-attendance",
  prog_supervisor: "/prog-dept/quizzes",
  teacher: "/teacher",
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
  "admin_supervisor",
  "prog_supervisor",
];

const PATH_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/super-admin", roles: ["super_admin"] },
  { prefix: "/edu-dept", roles: ["edu_supervisor"] },
  { prefix: "/admin-dept", roles: ["admin_supervisor", "super_admin"] },
  { prefix: "/prog-dept", roles: ["prog_supervisor"] },
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/tv-live", roles: STAFF_ROLES },
  { prefix: "/live-log", roles: STAFF_ROLES },
  {
    prefix: "/welcome",
    roles: ["super_admin", "edu_supervisor", "admin_supervisor", "prog_supervisor", "teacher"],
  },
];

/** Legacy URL redirects (pre–great-purge) */
export const LEGACY_REDIRECTS: Record<string, string | "home"> = {
  "/admin/staff": "/super-admin/staff",
  "/admin/circles-setup": "/super-admin/circles-setup",
  "/admin/statistics": "/super-admin/statistics",
  "/edu-supervisor": "/edu-dept/dashboard",
  "/edu-supervisor/dashboard": "/edu-dept/dashboard",
  "/edu-supervisor/master-grid": "/edu-dept/master-grid",
  "/edu-supervisor/placement": "/edu-dept/master-grid",
  "/edu-supervisor/students": "/edu-dept/students",
  "/edu-supervisor/transfers": "/edu-dept/transfers",
  "/edu-supervisor/circles": "/edu-dept/circles",
  "/edu-supervisor/events-engine": "/edu-dept/events-engine",
  "/edu-supervisor/yom-himma": "/edu-dept/events-engine",
  "/edu-supervisor/competitions": "/edu-dept/events-engine",
  "/general-supervisor": "/admin-dept/staff-attendance",
  "/general-supervisor/student-attendance": "/admin-dept/student-attendance",
  "/general-supervisor/staff": "/admin-dept/staff-attendance",
  "/general-supervisor/staff-attendance": "/admin-dept/staff-attendance",
  "/general-supervisor/admissions": "/admin-dept/admissions",
  "/general-supervisor/violations": "/admin-dept/pledges",
  "/general-supervisor/dashboard": "/admin-dept/reports",
  "/admin-dept/dashboard": "/admin-dept/reports",
  "/admin-dept/violations": "/admin-dept/pledges",
  "/prog-supervisor": "/prog-dept/quizzes",
  "/dashboard": "home",
};

export function pathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (pathname === "/login" || pathname === "/tv-live") return true;
  if (pathname.startsWith("/quiz/")) return true;
  if (pathname.startsWith("/live-log/")) return true;
  if (pathname.startsWith("/public/")) return true;
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

export const TV_LAUNCH_ROLES: UserRole[] = ["super_admin", "admin_supervisor"];
