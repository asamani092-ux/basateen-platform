/**
 * هوية بصرية ثابتة — مجمع البساتين
 * عند أي ميزة جديدة: استخدم هذه الثوابت فقط (لا ألوان/أزرار مخصصة جديدة).
 */
export const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export const ds = {
  page: {
    title: "text-2xl font-bold text-foreground",
    description: "text-sm text-muted-foreground mt-1",
    section: "text-lg font-semibold text-foreground",
  },
  card: "rounded-3xl border border-border bg-card text-card-foreground shadow-sm",
  btnRound: "rounded-xl",
  /** حقول نص / تاريخ / قائمة منسدلة أصلية — ارتفاع وانحناء موحّد */
  field:
    "h-9 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
  select:
    "h-9 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  dialog: "rounded-2xl border border-border bg-card text-card-foreground shadow-lg sm:max-w-lg",
  tableWrap: "w-full overflow-x-auto",
  tableMin: "min-w-[640px] w-full table-fixed",
  nav: {
    active:
      "block px-4 py-2.5 rounded-xl text-sm bg-primary text-primary-foreground",
    idle:
      "block px-4 py-2.5 rounded-xl text-sm text-foreground hover:bg-muted",
  },
  alert: {
    info: "rounded-2xl border border-border bg-muted p-4 text-sm text-foreground",
    error:
      "rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive",
    success:
      "rounded-2xl border border-primary/30 bg-secondary p-4 text-sm text-foreground",
    warn:
      "rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground",
  },
  tab: {
    active: "rounded-xl bg-primary text-primary-foreground",
    idle: "rounded-xl border border-border bg-background text-foreground hover:bg-muted",
  },
} as const;
