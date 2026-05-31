/** تعريب أدوار النظام في الجداول والواجهة */
const ROLE_LABELS_AR: Record<string, string> = {
  super_admin: "المشرف العام",
  admin_supervisor: "مشرف القسم الإداري",
  edu_supervisor: "مشرف تعليمي",
  programs_supervisor: "مشرف البرامج",
  general_supervisor: "مشرف عام",
  teacher: "معلم",
  track_supervisor: "مشرف مسار",
};

export function roleLabelAr(role: string | null | undefined): string {
  if (!role?.trim()) return "—";
  return ROLE_LABELS_AR[role] ?? role;
}
