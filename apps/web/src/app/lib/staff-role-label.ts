const ROLE_LABELS: Record<string, string> = {
  super_admin: "مشرف عام",
  admin_supervisor: "مشرف إداري",
  edu_supervisor: "مشرف تعليمي",
  programs_supervisor: "مشرف برامج",
  prog_supervisor: "مشرف برامج",
  track_supervisor: "مشرف مسار",
  teacher: "معلم",
};

export function staffRoleLabel(role: string | null | undefined): string {
  if (!role) return "غير محدد";
  return ROLE_LABELS[role] ?? role;
}
