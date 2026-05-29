/** أزرار تحضير موحّدة — حاضر / مستأذن / غائب */
export const ATTENDANCE_STATUS_BUTTONS = [
  {
    value: "present" as const,
    label: "حاضر",
    active: "bg-primary text-primary-foreground ring-2 ring-primary",
    idle: "bg-primary/15 text-primary border border-primary/30",
  },
  {
    value: "excused" as const,
    label: "مستأذن",
    active: "bg-amber-500 text-white ring-2 ring-amber-500",
    idle: "bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-100",
  },
  {
    value: "absent" as const,
    label: "غائب",
    active: "bg-destructive text-destructive-foreground ring-2 ring-destructive",
    idle: "bg-destructive/10 text-destructive border border-destructive/30",
  },
] as const;
