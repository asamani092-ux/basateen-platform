export type NavItem = {
  label: string;
  path: string;
  section: "admin" | "education" | "programs";
};

export const navItems: NavItem[] = [
  { label: "لوحة التحكم", path: "/dashboard", section: "admin" },
  { label: "إدارة الطلاب", path: "/admin/students", section: "admin" },
  { label: "الحلقات والمسارات", path: "/admin/circles", section: "admin" },
  { label: "نقل الطلاب", path: "/admin/transfers", section: "admin" },
  { label: "التعهدات والمخالفات", path: "/admin/violations", section: "admin" },
  { label: "المهام التعليمية", path: "/education/tasks", section: "education" },
  { label: "الرصد اليومي", path: "/education/daily-log", section: "education" },
  { label: "المنافسة والدرجات", path: "/education/competition", section: "education" },
  { label: "يوم الهمة", path: "/education/himma", section: "education" },
  { label: "البرامج", path: "/programs", section: "programs" },
  { label: "الاختبارات", path: "/programs/quizzes", section: "programs" },
  { label: "الأرشيف والبرامج", path: "/programs/archive", section: "programs" },
];
