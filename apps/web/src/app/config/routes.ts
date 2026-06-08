import type { UserRole } from "../lib/auth-store";

export type NavItem = {
  id: string;
  label: string;
  path: string;
  roles: UserRole[];
};

export type NavGroup = {
  id: string;
  label: string;
  roles: UserRole[];
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const ADMIN_DEPT_ROLES: UserRole[] = ["super_admin"];

const EDU_SUPERVISOR_ROLES: UserRole[] = ["edu_supervisor", "super_admin"];

/** مرحلة 1 — أساسيات القسم التعليمي */
const EDU_DEPT_CORE_NAV: NavItem[] = [
  {
    id: "edu-settings",
    label: "إعدادات التعليم",
    path: "/edu-dept/settings",
    roles: EDU_SUPERVISOR_ROLES,
  },
  {
    id: "daily-recitation",
    label: "الرصد اليومي",
    path: "/edu-dept/daily-recitation",
    roles: ["teacher", "edu_supervisor", "programs_supervisor", "track_supervisor"],
  },
  {
    id: "teacher-competitions",
    label: "منافسات الحلقة",
    path: "/edu-dept/teacher-competitions",
    roles: ["teacher", "track_supervisor"],
  },
  {
    id: "edu-reports",
    label: "التقارير والمتابعة",
    path: "/edu-dept/reports",
    roles: EDU_SUPERVISOR_ROLES,
  },
  {
    id: "transfer-requests",
    label: "متابعة النقل",
    path: "/edu-dept/transfer-requests",
    roles: EDU_SUPERVISOR_ROLES,
  },
];

/** القسم التعليمي — لوحات المشرف التعليمي */
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
    id: "competitions",
    label: "المنافسات",
    path: "/edu-dept/competitions",
    roles: ["edu_supervisor"],
  },
];

export const EDU_DEPT_GROUP: NavGroup = {
  id: "edu-dept",
  label: "القسم التعليمي",
  roles: ["edu_supervisor", "super_admin", "teacher", "track_supervisor"],
  children: [...EDU_DEPT_CORE_NAV, ...EDU_DEPT_NAV],
};

/** القسم الإداري — مسارات v2.6 (كل التبويبات داخل القائمة المنسدلة) */
export const ADMIN_DEPT_NAV: NavItem[] = [
  {
    id: "staff",
    label: "إدارة المنسوبين",
    path: "/super-admin/staff",
    roles: ["super_admin"],
  },
  {
    id: "circles-setup",
    label: "إعداد الحلقات والمسارات",
    path: "/super-admin/circles-setup",
    roles: ["super_admin"],
  },
  {
    id: "general-settings",
    label: "الإعدادات العامة",
    path: "/super-admin/settings",
    roles: ["super_admin"],
  },
  {
    id: "students-admin",
    label: "بيانات الطلاب",
    path: "/admin-dept/students",
    roles: ADMIN_DEPT_ROLES,
  },
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

/** @deprecated — استخدم ADMIN_DEPT_NAV داخل ADMIN_DEPT_GROUP */
export const SUPER_ADMIN_NAV: NavItem[] = [];

const PROG_DEPT_ROLES: UserRole[] = ["programs_supervisor", "super_admin"];

/** قسم إشراف البرامج */
export const PROG_DEPT_NAV: NavItem[] = [
  {
    id: "quizzes",
    label: "إختبارات إشراف البرامج",
    path: "/prog-dept/quizzes",
    roles: PROG_DEPT_ROLES,
  },
  {
    id: "archive",
    label: "أرشيف البرامج",
    path: "/prog-dept/archive",
    roles: PROG_DEPT_ROLES,
  },
  { id: "analytics", label: "التحليلات", path: "/prog-dept/analytics", roles: PROG_DEPT_ROLES },
];

export const PROG_DEPT_GROUP: NavGroup = {
  id: "prog-dept",
  label: "إشراف البرامج",
  roles: PROG_DEPT_ROLES,
  children: PROG_DEPT_NAV,
};

export const DISPLAY_DEPT_NAV: NavItem[] = [
  {
    id: "display-manager",
    label: "إدارة الشاشات",
    path: "/display-dept/manager",
    roles: ["super_admin"],
  },
];

export const DISPLAY_DEPT_GROUP: NavGroup = {
  id: "display-dept",
  label: "شاشات العرض",
  roles: ["super_admin"],
  children: DISPLAY_DEPT_NAV,
};

/** @deprecated — المعلم يستخدم EDU_DEPT_GROUP */
export const TEACHER_NAV: NavItem[] = [
  { id: "daily", label: "الرصد اليومي", path: "/edu-dept/daily-recitation", roles: ["teacher"] },
];

export const ADMIN_DEPT_GROUP: NavGroup = {
  id: "admin-dept",
  label: "القسم الإداري",
  roles: ADMIN_DEPT_ROLES,
  children: ADMIN_DEPT_NAV,
};

export const navItems: NavItem[] = [
  ...EDU_DEPT_CORE_NAV,
  ...EDU_DEPT_NAV,
  ...ADMIN_DEPT_NAV,
  ...PROG_DEPT_NAV,
  ...TEACHER_NAV,
];

export function navForRole(role: UserRole): NavEntry[] {
  const entries: NavEntry[] = [];
  if (role === "super_admin") {
    entries.push(ADMIN_DEPT_GROUP, EDU_DEPT_GROUP, PROG_DEPT_GROUP, DISPLAY_DEPT_GROUP);
    return entries;
  }
  if (role === "edu_supervisor") {
    entries.push(EDU_DEPT_GROUP);
    return entries;
  }
  if (role === "programs_supervisor") {
    entries.push(PROG_DEPT_GROUP);
    return entries;
  }
  if (role === "teacher" || role === "track_supervisor") {
    entries.push(EDU_DEPT_GROUP);
    return entries;
  }
  return navItems.filter((item) => item.roles.includes(role));
}

export function navGroupIsActive(group: NavGroup, pathname: string): boolean {
  return group.children.some((c) => isNavActive(c.path, pathname));
}

export function isNavActive(path: string, pathname: string): boolean {
  if (path === "/teacher" || path === "/edu-dept/daily-recitation") {
    return (
      pathname === "/teacher" ||
      pathname.startsWith("/teacher/") ||
      pathname === "/edu-dept/daily-recitation" ||
      pathname.startsWith("/edu-dept/daily-recitation/")
    );
  }
  if (path === "/edu-dept/competitions") {
    return (
      pathname === "/edu-dept/competitions" ||
      pathname.startsWith("/edu-dept/competitions/") ||
      pathname === "/edu-dept/events-engine" ||
      pathname === "/edu-dept/quranic-days" ||
      pathname === "/edu-dept/yom-himma"
    );
  }
  if (path === "/edu-dept/students") {
    return pathname === "/edu-dept/students" || pathname.startsWith("/edu-dept/students/");
  }
  if (path === "/prog-dept/quizzes") {
    return (
      pathname === "/prog-dept" ||
      pathname.startsWith("/prog-dept/quizzes") ||
      pathname.startsWith("/prog-dept/archive")
    );
  }
  if (path === "/prog-dept/archive") {
    return pathname === "/prog-dept/archive" || pathname.startsWith("/prog-dept/archive/");
  }
  if (path === "/display-dept/manager") {
    return pathname === "/display-dept/manager" || pathname.startsWith("/display-dept/");
  }
  if (path === "/super-admin/staff") {
    return (
      pathname === "/super-admin/staff" ||
      pathname.startsWith("/super-admin/staff") ||
      pathname === "/admin/staff"
    );
  }
  if (path === "/super-admin/circles-setup") {
    return (
      pathname === "/super-admin/circles-setup" ||
      pathname.startsWith("/super-admin/circles-setup") ||
      pathname === "/admin/circles-setup"
    );
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
