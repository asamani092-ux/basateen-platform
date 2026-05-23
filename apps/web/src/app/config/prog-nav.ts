export type ProgNavItem = {
  id: string;
  label: string;
  path: string;
};

export const PROG_NAV_ITEMS: ProgNavItem[] = [
  { id: "quizzes", label: "صانع الاختبارات", path: "/prog-supervisor/quizzes" },
  { id: "analytics", label: "إحصائيات الأنشطة", path: "/prog-supervisor/analytics" },
  { id: "vault", label: "بنك المعرفة", path: "/prog-supervisor/vault" },
];

export function isProgNavActive(itemPath: string, pathname: string): boolean {
  if (itemPath === "/prog-supervisor/quizzes") {
    return (
      pathname === "/prog-supervisor/quizzes" ||
      pathname.startsWith("/prog-supervisor/quizzes/")
    );
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
