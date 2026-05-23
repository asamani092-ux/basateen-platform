import type { UserRole } from "../lib/auth-store";
import { GS_NAV_ITEMS } from "./gs-nav";
import { EDU_NAV_ITEMS } from "./edu-nav";
import { PROG_NAV_ITEMS, isProgNavActive } from "./prog-nav";

export type NavItem = {
  label: string;
  path: string;
  roles: UserRole[];
};

const GM_NAV: NavItem[] = [
  { label: "إدارة الموظفين", path: "/admin/staff", roles: ["general_manager"] },
  {
    label: "إدارة الحلقات",
    path: "/admin/circles-setup",
    roles: ["general_manager"],
  },
  { label: "الإحصائيات", path: "/admin/statistics", roles: ["general_manager"] },
];

const GS_NAV: NavItem[] = GS_NAV_ITEMS.map((item) => ({
  label: item.label,
  path: item.path,
  roles: ["general_supervisor"] as UserRole[],
}));

const EDU_NAV: NavItem[] = EDU_NAV_ITEMS.map((item) => ({
  label: item.label,
  path: item.path,
  roles: ["edu_supervisor"] as UserRole[],
}));

const PROG_NAV: NavItem[] = PROG_NAV_ITEMS.map((item) => ({
  label: item.label,
  path: item.path,
  roles: ["prog_supervisor"] as UserRole[],
}));

export const navItems: NavItem[] = [
  ...GM_NAV,
  ...GS_NAV,
  ...EDU_NAV,
  ...PROG_NAV,
];

export function navForRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

export function isNavActive(path: string, pathname: string): boolean {
  if (path.startsWith("/general-supervisor/")) {
    if (pathname === "/general-supervisor") {
      return path === "/general-supervisor/student-attendance";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  if (path.startsWith("/edu-supervisor/")) {
    if (pathname === "/edu-supervisor") {
      return path === "/edu-supervisor/dashboard";
    }
    if (path === "/edu-supervisor/students") {
      return (
        pathname === "/edu-supervisor/students" ||
        pathname.startsWith("/edu-supervisor/students/")
      );
    }
    if (path === "/edu-supervisor/competitions") {
      return (
        pathname === "/edu-supervisor/competitions" ||
        pathname.startsWith("/edu-supervisor/competitions/")
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  if (path.startsWith("/prog-supervisor/")) {
    return isProgNavActive(path, pathname);
  }
  if (path === "/prog-supervisor") {
    return pathname.startsWith("/prog-supervisor");
  }
  if (path === "/admin/staff") return pathname.startsWith("/admin/staff");
  if (path === "/admin/circles-setup") {
    return pathname.startsWith("/admin/circles-setup");
  }
  if (path === "/admin/statistics") {
    return pathname.startsWith("/admin/statistics");
  }
  return pathname === path;
}
