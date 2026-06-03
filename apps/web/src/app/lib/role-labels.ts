const ROLE_LABELS_AR: Record<string, string> = {
  super_admin: "مشرف عام",
  general_manager: "مدير عام",
  general_supervisor: "مشرف عام",
  admin_supervisor: "مشرف إداري",
  edu_supervisor: "مشرف تعليمي",
  programs_supervisor: "مشرف برامج",
  prog_supervisor: "مشرف برامج",
  track_supervisor: "مشرف مسار",
  teacher: "معلم",
};

/** ترجمة دور المنسوب للعرض في واجهة التحضير */
export function roleLabelAr(role: string | null | undefined): string {
  if (!role?.trim()) return "—";
  return ROLE_LABELS_AR[role] ?? role;
}
