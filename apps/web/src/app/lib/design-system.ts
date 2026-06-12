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
  card: "rounded-3xl border border-border bg-card text-card-foreground shadow-md shadow-slate-900/8",
  btnRound: "rounded-xl",
  /** حقول نص / تاريخ / قائمة منسدلة أصلية — ارتفاع وانحناء موحّد */
  field:
    "h-9 w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
  select:
    "h-9 w-full rounded-xl border border-input bg-input-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  dialog:
    "rounded-2xl border border-border bg-card text-card-foreground shadow-lg sm:max-w-lg max-h-[90vh] overflow-y-auto",
  tableWrap: "w-full overflow-x-auto",
  tableMin: "w-full",
  table: {
    head: "text-right align-middle font-medium text-sm text-muted-foreground px-3 py-2",
    cell: "text-right align-middle text-sm px-3 py-2",
    truncateCell: "min-w-0",
    colName: "",
    colId: "whitespace-nowrap",
    colPhone: "whitespace-nowrap",
    colPlacement: "min-w-0 max-w-[12rem]",
    colStatus: "whitespace-nowrap",
    colStatusBtns: "w-[1%] whitespace-nowrap",
    headActions: "text-center align-middle w-[1%] whitespace-nowrap px-2 py-2",
    headActionsWide: "text-center align-middle w-[1%] whitespace-nowrap px-2 py-2",
    actionsCell: "text-center align-middle w-[1%] whitespace-nowrap p-1.5",
    actionsCellWide: "text-center align-middle w-[1%] whitespace-nowrap p-1.5",
    actionsWrap: "inline-flex items-center justify-center gap-0.5",
    actionsWrapWide: "inline-flex flex-wrap items-center justify-center gap-0.5",
  },
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
    idle: "rounded-xl border border-input bg-input-background text-foreground hover:bg-muted",
  },
  /** فلاتر متجاوبة: عمود على الجوال، صف على الشاشات الأوسع */
  filterRow:
    "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4",
  loading: "flex min-h-[12rem] items-center justify-center",
  /** شريط KPI — عمودان على الجوال، أربعة على الشاشات الأوسع */
  kpiStrip: "grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4",
  /** زر حفظ/إرسال أساسي — إبهام واضح على الجوال */
  primaryActionBtn: "min-h-11 px-6 font-semibold",
  /** رسالة خطأ ترحيل قاعدة البيانات (API/D1) */
  dbMigrationErrorHint:
    "خطأ في قاعدة البيانات: يرجى إبلاغ الإدارة التقنية. قد تحتاج المنصة إلى تحديث ترحيل.",
} as const;
