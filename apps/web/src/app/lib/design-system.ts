/**
 * هوية بصرية ثابتة — مجمع بساتين
 * عند أي ميزة جديدة: استخدم هذه الثوابت فقط (لا ألوان/أزرار مخصصة جديدة).
 */
export const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

export const ds = {
  page: {
    title: "text-[30px] font-bold leading-tight text-foreground",
    description: "text-[13px] font-medium text-muted-foreground mt-1",
    section: "text-xl font-bold leading-snug text-foreground",
    data: "text-[15px] font-medium text-foreground",
    caption: "text-[13px] font-medium text-muted-foreground",
  },
  card: "rounded-3xl border border-border bg-card text-card-foreground",
  btnRound: "rounded-xl",
  /** حقول نص / تاريخ / قائمة منسدلة أصلية — ارتفاع وانحناء موحّد */
  field:
    "h-11 w-full rounded-xl border border-input bg-input-background px-3.5 py-2 text-sm text-foreground shadow-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
  select:
    "h-11 w-full rounded-xl border border-input bg-input-background px-3.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  dialog:
    "rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--elevated-shadow)] sm:max-w-lg max-h-[90vh] overflow-y-auto",
  tableWrap: "w-full overflow-x-auto",
  tableMin: "w-full",
  table: {
    head: "text-right align-middle font-semibold text-xs text-muted-foreground px-3 py-2 h-11",
    cell: "text-right align-middle text-[15px] px-3 py-2 min-h-11",
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
    rowPresent: "bg-attendance-present-surface/40",
    rowHover: "hover:bg-muted/60",
    rowSelected: "bg-secondary border-s-2 border-s-primary font-semibold",
  },
  nav: {
    active:
      "block px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground min-h-11",
    idle:
      "block px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground min-h-11",
  },
  alert: {
    info: "rounded-xl border-s-[3px] border-s-info bg-info-surface p-3.5 text-[13px] font-semibold text-info-foreground",
    error:
      "rounded-xl border-s-[3px] border-s-destructive bg-destructive/10 p-3.5 text-[13px] font-semibold text-destructive",
    success:
      "rounded-xl border-s-[3px] border-s-success bg-success-surface p-3.5 text-[13px] font-semibold text-success-foreground",
    warn:
      "rounded-xl border-s-[3px] border-s-warning bg-warning-surface p-3.5 text-[13px] font-semibold text-warning-foreground",
  },
  tab: {
    active: "rounded-lg bg-card text-primary font-semibold shadow-sm",
    idle: "rounded-lg text-muted-foreground font-medium hover:text-foreground",
  },
  /** فلاتر متجاوبة: عمود على الجوال، صف على الشاشات الأوسع */
  filterRow:
    "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4",
  loading: "flex min-h-[12rem] items-center justify-center",
  /** شريط KPI — عمودان على الجوال، أربعة على الشاشات الأوسع */
  kpiStrip: "grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4",
  kpiCard:
    "rounded-2xl border border-border bg-card p-3.5 shadow-sm",
  kpiLabel: "text-[13px] font-semibold text-muted-foreground",
  kpiValue: "text-[26px] font-extrabold leading-tight text-primary",
  /** زر حفظ/إرسال أساسي — إبهام واضح على الجوال */
  primaryActionBtn: "min-h-11 px-6 font-bold",
  /** رسالة خطأ ترحيل قاعدة البيانات (API/D1) */
  dbMigrationErrorHint:
    "خطأ في قاعدة البيانات: يرجى إبلاغ الإدارة التقنية. قد تحتاج المنصة إلى تحديث ترحيل.",
  /** شارة مسار الطالب */
  trackBadge:
    "border border-info/35 bg-info-surface text-info-foreground rounded-full px-3 py-0.5 text-xs font-bold",
  /** زر حفظ/رصد — توسيط على الجوال */
  saveActionWrap: "flex flex-col items-center justify-center gap-2",
  /** Toast — بطاقة نظيفة + دلالة لونية على الحد والأيقونة فقط */
  toast: {
    base: "rounded-xl border bg-card text-card-foreground shadow-[0_8px_24px_rgba(15,23,42,0.12)]",
    title: "text-sm font-semibold text-right text-foreground",
    description: "text-sm text-right text-muted-foreground",
    success:
      "border-success/40 [&_[data-icon]]:!text-success",
    error:
      "border-destructive/45 [&_[data-icon]]:!text-destructive",
  },
  /** غلاف صفحات البوابات (معلم / مشرف مسار) */
  pageShell: "space-y-4 max-w-[1200px]",
  hubTabsList:
    "w-full justify-start gap-1 rounded-xl border border-border bg-muted p-1 h-auto flex-wrap",
  hubTabTrigger:
    "rounded-lg px-4 py-2.5 text-sm font-semibold min-h-11 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm",
  hubBottomNav:
    "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden print:hidden",
  hubBottomNavInner:
    "mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
  hubBottomNavBtn:
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors touch-manipulation text-muted-foreground hover:text-foreground hover:bg-muted/60 min-h-11",
  hubBottomNavBtnActive: "text-primary bg-primary/10 font-semibold",
  /** دلالات التحضير — segmented control */
  attendance: {
    segmentedWrap: "inline-flex gap-0.5 rounded-[10px] bg-muted p-0.5 min-h-11",
    segmentBase:
      "flex-1 text-center rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors min-h-[38px]",
    presentActive: "bg-attendance-present text-white font-bold",
    presentIdle: "text-muted-foreground hover:text-foreground",
    absentActive: "bg-attendance-absent text-white font-bold",
    absentIdle: "text-muted-foreground hover:text-foreground",
    excusedActive: "bg-attendance-excused text-white font-bold",
    excusedIdle: "text-muted-foreground hover:text-foreground",
    presentBadge:
      "inline-flex items-center rounded-full bg-success-surface px-3 py-1 text-xs font-bold text-success-foreground",
    absentBadge:
      "inline-flex items-center rounded-full bg-attendance-absent-surface px-3 py-1 text-xs font-bold text-destructive",
    excusedBadge:
      "inline-flex items-center rounded-full bg-warning-surface px-3 py-1 text-xs font-bold text-warning-foreground",
    attendedToday:
      "text-[10.5px] font-bold text-success",
  },
  /** جداول الطباعة الموحّدة */
  printTable: "print-table w-full text-right",
} as const;
