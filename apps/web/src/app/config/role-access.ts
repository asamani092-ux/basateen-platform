import type { UserRole } from "../lib/auth-store";

export const ROLE_HOME: Record<UserRole, string> = {
  teacher: "/teacher",
  edu_supervisor: "/edu-supervisor/dashboard",
  prog_supervisor: "/prog-supervisor/quizzes",
  general_supervisor: "/general-supervisor/student-attendance",
  general_manager: "/admin/staff",
};

export const STAFF_ROLES: UserRole[] = [
  "edu_supervisor",
  "prog_supervisor",
  "general_supervisor",
  "general_manager",
];

const PATH_RULES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/admin/staff", roles: ["general_manager"] },
  { prefix: "/admin/circles-setup", roles: ["general_manager"] },
  { prefix: "/admin/statistics", roles: ["general_manager"] },
  { prefix: "/edu-supervisor/yom-himma", roles: ["edu_supervisor"] },
  { prefix: "/edu-supervisor/master-grid", roles: ["edu_supervisor"] },
  { prefix: "/edu-supervisor/competitions", roles: ["edu_supervisor"] },
  { prefix: "/edu-supervisor", roles: ["edu_supervisor"] },
  { prefix: "/prog-supervisor", roles: ["prog_supervisor"] },
  { prefix: "/general-supervisor", roles: ["general_supervisor"] },
  { prefix: "/admin/students", roles: ["edu_supervisor"] },
  { prefix: "/admin/transfers", roles: ["edu_supervisor"] },
  { prefix: "/admin/violations", roles: ["general_supervisor"] },
  { prefix: "/education", roles: ["edu_supervisor"] },
  { prefix: "/programs", roles: ["prog_supervisor"] },
  {
    prefix: "/welcome",
    roles: [
      "teacher",
      "edu_supervisor",
      "prog_supervisor",
      "general_supervisor",
      "general_manager",
    ],
  },
];

export function pathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (pathname === "/login" || pathname === "/tv-live") return true;
  if (pathname.startsWith("/quiz/")) return true;
  for (const rule of PATH_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles.includes(role);
    }
  }
  return false;
}

export const LEGACY_REDIRECTS: Record<string, string | "home"> = {
  "/dashboard": "home",
  "/admin/staff-management": "/admin/staff",
  "/admin/students/import": "/edu-supervisor/students?excel=1",
  "/education/himma": "/edu-supervisor/yom-himma",
  "/programs": "/prog-supervisor/quizzes",
  "/prog-supervisor": "/prog-supervisor/quizzes",
  "/admin/circles": "/edu-supervisor/circles",
};

/** تحويل ?tab= القديمة للمشرف التعليمي */
export const EDU_LEGACY_TAB_REDIRECTS: Record<string, string> = {
  placement: "/edu-supervisor/placement",
  students: "/edu-supervisor/students",
  transfers: "/edu-supervisor/transfers",
  circles: "/edu-supervisor/circles",
  education: "/edu-supervisor/competitions",
  attendance: "/edu-supervisor/placement",
};

export function resolveEduTabRedirect(pathname: string, tab: string | null): string | null {
  if (pathname !== "/edu-supervisor" || !tab) return null;
  return EDU_LEGACY_TAB_REDIRECTS[tab] ?? null;
}

export const GS_LEGACY_TAB_REDIRECTS: Record<string, string> = {
  staff: "/general-supervisor/staff",
  admissions: "/general-supervisor/admissions",
  violations: "/general-supervisor/violations",
  dashboard: "/general-supervisor/dashboard",
  attendance: "/general-supervisor/student-attendance",
  "student-attendance": "/general-supervisor/student-attendance",
};

export function resolveGsTabRedirect(pathname: string, tab: string | null): string | null {
  if (pathname !== "/general-supervisor" || !tab) return null;
  return GS_LEGACY_TAB_REDIRECTS[tab] ?? null;
}

/** تحويل ?tab= القديمة لمشرف البرامج */
export const PROG_LEGACY_TAB_REDIRECTS: Record<string, string> = {
  programs: "/prog-supervisor/quizzes",
  quizzes: "/prog-supervisor/quizzes",
  analytics: "/prog-supervisor/analytics",
  archive: "/prog-supervisor/vault",
  vault: "/prog-supervisor/vault",
};

export function resolveProgTabRedirect(pathname: string, tab: string | null): string | null {
  if (pathname !== "/prog-supervisor" || !tab) return null;
  return PROG_LEGACY_TAB_REDIRECTS[tab] ?? "/prog-supervisor/quizzes";
}

export function resolveLegacyRedirect(
  pathname: string,
  role: UserRole,
): string | null {
  const target = LEGACY_REDIRECTS[pathname];
  if (!target) return null;
  if (target === "home") return ROLE_HOME[role];
  return target;
}

export const TV_LAUNCH_ROLES: UserRole[] = [
  "general_manager",
  "general_supervisor",
];
