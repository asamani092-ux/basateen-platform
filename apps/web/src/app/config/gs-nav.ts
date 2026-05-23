export type GsNavItem = {
  id: string;
  label: string;
  path: string;
};

export const GS_NAV_ITEMS: GsNavItem[] = [
  {
    id: "student-attendance",
    label: "تحضير الطلاب",
    path: "/general-supervisor/student-attendance",
  },
  { id: "staff", label: "تحضير المنسوبين", path: "/general-supervisor/staff" },
  { id: "admissions", label: "القبول والتسجيل", path: "/general-supervisor/admissions" },
  { id: "violations", label: "التعهدات والانضباط", path: "/general-supervisor/violations" },
  { id: "dashboard", label: "المؤشرات والبث", path: "/general-supervisor/dashboard" },
];

export function isGsNavActive(itemPath: string, pathname: string): boolean {
  if (pathname === "/general-supervisor") {
    return itemPath === "/general-supervisor/student-attendance";
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
