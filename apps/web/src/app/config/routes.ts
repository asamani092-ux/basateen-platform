import type { UserRole } from "../lib/auth-store";

export type NavItem = {
  id: string;
  label: string;
  path: string;
  roles: UserRole[];
};

const ADMIN_DEPT_ROLES: UserRole[] = ["admin_supervisor", "super_admin"];

/** المشرف السيادي — إدارة المجمع */
export const SUPER_ADMIN_NAV: NavItem[] = [
  { id: "staff", label: "إدارة المنسوبين", path: "/super-admin/staff", roles: ["super_admin"] },
  {
    id: "circles-setup",
    label: "إعداد الحلقات والمسارات",
    path: "/super-admin/circles-setup",
    roles: ["super_admin"],
  },
];

/** القسم التعليمي */
export const EDU_DEPT_NAV: NavItem[] = [
  { id: "dashboard", label: "لوحة المتابعة", path: "/edu-dept/dashboard", roles: ["edu_supervisor"] },
  {
    id: "master-grid",
    label: "انتظار القبول والتوزيع",
    path: "/edu-dept/master-grid",
    roles: ["edu_supervisor"],
  },
  { id: "students", label: "الطلاب و Excel", path: "/edu-dept/students", roles: ["edu_supervisor"] },
  { id: "transfers", label: "نقل الطلاب", path: "/edu-dept/transfers", roles: ["edu_supervisor"] },
  { id: "circles", label: "الحلقات التشغيلية", path: "/edu-dept/circles", roles: ["edu_supervisor"] },
  {
    id: "events-engine",
    label: "محرك الفعاليات",
    path: "/edu-dept/events-engine",
    roles: ["edu_supervisor"],
  },
];

/** القسم الإداري — مسارات v2.6 */
export const ADMIN_DEPT_NAV: NavItem[] = [
  {
    id: "staff-attendance",
    label: "تحضير المنسوبين",
    path: "/admin-dept/staff-attendance",
    roles: ADMIN_DEPT_ROLES,
  },
  {
    id: "student-attendance",
    label: "تحضير الطلاب",
    path: "/admin-dept/student-attendance",
    roles: ADMIN_DEPT_ROLES,
  },
  {
    id: "absent-whatsapp",
    label: "واتساب الغياب",
    path: "/admin-dept/absent-whatsapp",
    roles: ADMIN_DEPT_ROLES,
  },
  {
    id: "admissions",
    label: "القبول والتسجيل",
    path: "/admin-dept/admissions",
    roles: ADMIN_DEPT_ROLES,
  },
  {
    id: "pledges",
    label: "التعهدات والإجراءات",
    path: "/admin-dept/pledges",
    roles: ADMIN_DEPT_ROLES,
  },
  {
    id: "reports",
    label: "المؤشرات والتقارير",
    path: "/admin-dept/reports",
    roles: ADMIN_DEPT_ROLES,
  },
];

/** قسم إشراف البرامج */
export const PROG_DEPT_NAV: NavItem[] = [
  { id: "quizzes", label: "الاختبارات", path: "/prog-dept/quizzes", roles: ["prog_supervisor"] },
  { id: "analytics", label: "التحليلات", path: "/prog-dept/analytics", roles: ["prog_supervisor"] },
  { id: "vault", label: "أرشيف البرامج", path: "/prog-dept/vault", roles: ["prog_supervisor"] },
];

/** المعلم */
export const TEACHER_NAV: NavItem[] = [
  { id: "daily", label: "شبكة الرصد السريع", path: "/teacher", roles: ["teacher"] },
];

export const navItems: NavItem[] = [
  ...SUPER_ADMIN_NAV,
  ...EDU_DEPT_NAV,
  ...ADMIN_DEPT_NAV,
  ...PROG_DEPT_NAV,
];

export function navForRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

export function isNavActive(path: string, pathname: string): boolean {
  if (path === "/teacher") {
    return pathname === "/teacher" || pathname.startsWith("/teacher/");
  }
  if (path === "/edu-dept/events-engine") {
    return (
      pathname === "/edu-dept/events-engine" ||
      pathname === "/edu-dept/yom-himma" ||
      pathname.startsWith("/edu-dept/competitions")
    );
  }
  if (path === "/edu-dept/students") {
    return pathname === "/edu-dept/students" || pathname.startsWith("/edu-dept/students/");
  }
  if (path === "/prog-dept/quizzes") {
    return pathname === "/prog-dept" || pathname.startsWith("/prog-dept/quizzes");
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
