/** أزرار تحضير موحّدة — حاضر / مستأذن / غائب */
export const ATTENDANCE_STATUS_BUTTONS = [
  {
    value: "present" as const,
    label: "حاضر",
    active: "bg-attendance-present text-white ring-2 ring-attendance-present",
    idle: "bg-attendance-present-surface text-success-foreground border border-attendance-present/30",
  },
  {
    value: "excused" as const,
    label: "مستأذن",
    active: "bg-attendance-excused text-white ring-2 ring-attendance-excused",
    idle: "bg-attendance-excused-surface text-warning-foreground border border-attendance-excused/30",
  },
  {
    value: "absent" as const,
    label: "غائب",
    active: "bg-attendance-absent text-white ring-2 ring-attendance-absent",
    idle: "bg-attendance-absent-surface text-destructive border border-attendance-absent/30",
  },
] as const;
