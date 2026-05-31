import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  GraduationCap,
  Printer,
  Search,
  Users,
} from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type DatePreset = "last3" | "last7" | "month" | "custom";
type StatusFilter = "all" | "absent_only";
type ReportViewId =
  | "overview"
  | "staff"
  | "students"
  | "discipline"
  | "student_lookup";

type ReportRow = {
  name: string;
  date: string;
  status: string;
  type: "staff" | "student";
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisciplinePct(row: {
  discipline_pct?: unknown;
  official_days?: unknown;
  present_days?: unknown;
}): string {
  const presentDays = Number(row.present_days ?? 0);
  const absentDays = Math.max(
    0,
    Number(row.official_days ?? 0) - presentDays,
  );
  const total = presentDays + absentDays;
  const fromApi = Number(row.discipline_pct);
  const percentage =
    total > 0
      ? Math.round((presentDays / total) * 100)
      : Number.isFinite(fromApi)
        ? Math.round(fromApi)
        : 0;
  return `${percentage}%`;
}

function formatPctValue(value: unknown): string {
  const n = Number(value);
  const percentage = Number.isFinite(n) ? Math.round(n) : 0;
  return `${percentage}%`;
}

function rangeForPreset(preset: DatePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  if (preset === "last3") start.setDate(end.getDate() - 2);
  else if (preset === "last7") start.setDate(end.getDate() - 6);
  else if (preset === "month") start.setDate(1);
  return { start: isoDate(start), end: isoDate(end) };
}

const STATUS_AR: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  excused: "مستأذن",
};

const emptySummary = {
  staff_total: 0,
  staff_present: 0,
  staff_absent: 0,
  staff_present_pct: 0,
  staff_absent_pct: 0,
  students_total: 0,
  students_present: 0,
  students_absent: 0,
  students_present_pct: 0,
  students_absent_pct: 0,
};

const REPORT_CARDS: Array<{
  id: ReportViewId;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "overview",
    title: "ملخص المؤشرات",
    description: "أرقام التحضير الإجمالية للفترة المحددة",
    icon: <BarChart3 className="w-5 h-5 text-primary" />,
  },
  {
    id: "staff",
    title: "تقرير المنسوبين",
    description: "جدول تفصيلي لحضور وغياب المنسوبين",
    icon: <Users className="w-5 h-5 text-primary" />,
  },
  {
    id: "students",
    title: "تقرير الطلاب",
    description: "جدول تفصيلي لحضور وغياب الطلاب",
    icon: <GraduationCap className="w-5 h-5 text-primary" />,
  },
  {
    id: "discipline",
    title: "انضباط الحلقات",
    description: "حضور رسمي ونسب انضباط لكل طالب وحلقة",
    icon: <ClipboardList className="w-5 h-5 text-primary" />,
  },
  {
    id: "student_lookup",
    title: "بحث طالب",
    description: "سجل حضور طالب واحد بالكامل",
    icon: <Search className="w-5 h-5 text-primary" />,
  },
];

type AttendanceSummaryRow = {
  name: string;
  presentDays: number;
  absentDays: number;
  disciplinePct: number;
};

function aggregateAttendance(rows: ReportRow[]): AttendanceSummaryRow[] {
  const map = new Map<string, { present: number; absent: number }>();
  for (const row of rows) {
    const cur = map.get(row.name) ?? { present: 0, absent: 0 };
    if (row.status === "present") cur.present += 1;
    else cur.absent += 1;
    map.set(row.name, cur);
  }
  return Array.from(map.entries()).map(([name, { present, absent }]) => {
    const total = present + absent;
    const disciplinePct =
      total > 0 ? Math.round((present / total) * 100) : 0;
    return { name, presentDays: present, absentDays: absent, disciplinePct };
  });
}

function AttendanceSummaryTable({
  rows,
  emptyLabel,
}: {
  rows: AttendanceSummaryRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground text-right" style={tajawal}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <Table className={`${ds.tableMin} text-right`} dir="rtl">
      <TableHeader>
        <TableRow>
          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
            الاسم
          </TableHead>
          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
            أيام الحضور
          </TableHead>
          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
            أيام الغياب
          </TableHead>
          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
            نسبة الانضباط
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell className="text-right font-medium" style={tajawal}>
              {row.name}
            </TableCell>
            <TableCell className="text-right" style={tajawal}>
              {row.presentDays}
            </TableCell>
            <TableCell className="text-right" style={tajawal}>
              {row.absentDays}
            </TableCell>
            <TableCell className="text-right" style={tajawal}>
              {row.disciplinePct}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DetailTable({
  rows,
  emptyLabel,
}: {
  rows: ReportRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground text-right" style={tajawal}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <Table className={`${ds.tableMin} text-right`} dir="rtl">
      <TableHeader>
        <TableRow>
          <TableHead className={`${ds.table.head} text-right w-[32%]`} style={tajawal}>
            الاسم
          </TableHead>
          <TableHead className={`${ds.table.head} text-right w-[22%]`} style={tajawal}>
            التاريخ
          </TableHead>
          <TableHead className={`${ds.table.head} text-right w-[22%]`} style={tajawal}>
            الحالة
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row.date}-${row.name}-${i}`}>
            <TableCell className="text-right font-medium" style={tajawal}>
              {row.name}
            </TableCell>
            <TableCell className="text-right" style={tajawal}>
              {row.date}
            </TableCell>
            <TableCell className="text-right" style={tajawal}>
              {STATUS_AR[row.status] ?? row.status}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AdminReportsPage() {
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [customStart, setCustomStart] = useState(() => isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => isoDate(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeView, setActiveView] = useState<ReportViewId>("overview");
  const [loading, setLoading] = useState(false);
  const [disciplineLoading, setDisciplineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [disciplineRows, setDisciplineRows] = useState<Awaited<
    ReturnType<typeof api.adminDeptCircleDisciplineReport>
  >["items"]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [studentReport, setStudentReport] = useState<Awaited<
    ReturnType<typeof api.adminDeptStudentAttendanceReport>
  > | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [circles, setCircles] = useState<
    Awaited<ReturnType<typeof api.adminCirclesSummary>>["items"]
  >([]);
  const [tracks, setTracks] = useState<
    Awaited<ReturnType<typeof api.adminTracks>>["items"]
  >([]);
  const [filterCircleId, setFilterCircleId] = useState<string>("all");
  const [filterTrackId, setFilterTrackId] = useState<string>("all");

  const { startDate, endDate } = useMemo(() => {
    if (preset === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    return rangeForPreset(preset);
  }, [preset, customStart, customEnd]);

  const staffItems = useMemo(
    () => items.filter((r) => r.type === "staff"),
    [items],
  );
  const studentItems = useMemo(
    () => items.filter((r) => r.type === "student"),
    [items],
  );
  const staffSummary = useMemo(
    () => aggregateAttendance(staffItems),
    [staffItems],
  );
  const studentSummary = useMemo(
    () => aggregateAttendance(studentItems),
    [studentItems],
  );

  useEffect(() => {
    if (!canUseApi()) return;
    void (async () => {
      try {
        const [c, t] = await Promise.all([
          api.adminCirclesSummary(),
          api.adminTracks(),
        ]);
        setCircles(c.items.filter((x) => x.is_active));
        setTracks(t.items.filter((x) => x.is_active));
      } catch {
        setCircles([]);
        setTracks([]);
      }
    })();
  }, []);

  const scopeParams = useMemo(() => {
    const p: { circle_id?: number; track_id?: number } = {};
    if (filterCircleId !== "all") p.circle_id = Number(filterCircleId);
    if (filterTrackId !== "all") p.track_id = Number(filterTrackId);
    return p;
  }, [filterCircleId, filterTrackId]);

  const loadCore = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptReports({
        startDate,
        endDate,
        status: statusFilter,
        type: "all",
        ...scopeParams,
      });
      setSummary({ ...emptySummary, ...res.summary });
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, scopeParams]);

  const loadDiscipline = useCallback(async () => {
    if (!canUseApi()) return;
    setDisciplineLoading(true);
    setError(null);
    try {
      const discipline = await api.adminDeptCircleDisciplineReport({
        startDate,
        endDate,
        ...scopeParams,
      });
      setDisciplineRows(discipline.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل تقرير الانضباط");
      setDisciplineRows([]);
    } finally {
      setDisciplineLoading(false);
    }
  }, [startDate, endDate, scopeParams]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (activeView === "discipline") {
      void loadDiscipline();
    }
  }, [activeView, loadDiscipline]);

  const loadStudentReport = useCallback(async (sid: number) => {
    if (!canUseApi()) return;
    setStudentLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStudentAttendanceReport(sid);
      setStudentReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل تقرير الطالب");
      setStudentReport(null);
    } finally {
      setStudentLoading(false);
    }
  }, []);

  function handlePrint() {
    if (loading || (activeView === "discipline" && disciplineLoading)) {
      setError("انتظر اكتمال تحميل البيانات قبل الطباعة");
      return;
    }
    window.requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 200);
    });
  }

  function selectReport(id: ReportViewId) {
    setActiveView(id);
    if (id === "student_lookup") {
      setStudentReport(null);
    }
  }

  const staffAttendanceSub = `حاضر ${summary.staff_present} (${summary.staff_present_pct}%) · غائب/مستأذن ${summary.staff_absent} (${summary.staff_absent_pct}%)`;
  const studentAttendanceSub = `حاضر ${summary.students_present} (${summary.students_present_pct}%) · غائب/مستأذن ${summary.students_absent} (${summary.students_absent_pct}%)`;

  const activeMeta = REPORT_CARDS.find((c) => c.id === activeView);

  return (
    <div className="space-y-6 max-w-[1200px]" dir="rtl">
      <div className="admin-reports-screen-only flex flex-col gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            المؤشرات والتقارير
          </h2>
          <p className={ds.page.description} style={tajawal}>
            اختر بطاقة التقرير لعرض التفاصيل في الأسفل دون تداخل الواجهة.
          </p>
        </div>

        <Card className={ds.card}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={tajawal}>
              فلاتر التقرير
            </CardTitle>
            <CardDescription style={tajawal}>
              اختر الفترة وحالة التصدير ثم حدّث البيانات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label style={tajawal}>الفترة السريعة</Label>
                <Select
                  value={preset}
                  onValueChange={(v) => setPreset(v as DatePreset)}
                >
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last3">آخر 3 أيام</SelectItem>
                    <SelectItem value="last7">آخر أسبوع</SelectItem>
                    <SelectItem value="month">هذا الشهر</SelectItem>
                    <SelectItem value="custom">مخصص</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={tajawal}>حالة التصدير</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الجميع</SelectItem>
                    <SelectItem value="absent_only">الغائبون فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label style={tajawal}>حلقة (تفصيلي)</Label>
                <Select value={filterCircleId} onValueChange={setFilterCircleId}>
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue placeholder="كل الحلقات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحلقات</SelectItem>
                    {circles.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label style={tajawal}>مسار (تفصيلي)</Label>
                <Select value={filterTrackId} onValueChange={setFilterTrackId}>
                  <SelectTrigger className={ds.btnRound}>
                    <SelectValue placeholder="كل المسارات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المسارات</SelectItem>
                    {tracks.map((tr) => (
                      <SelectItem key={tr.id} value={String(tr.id)}>
                        {tr.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preset === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label style={tajawal}>من تاريخ</Label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className={`w-full border border-border px-3 py-2 ${ds.btnRound}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={tajawal}>إلى تاريخ</Label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className={`w-full border border-border px-3 py-2 ${ds.btnRound}`}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={() => {
                  void loadCore();
                  if (activeView === "discipline") void loadDiscipline();
                }}
                disabled={loading}
                style={tajawal}
              >
                تحديث
              </Button>
              <Button
                type="button"
                className={ds.btnRound}
                onClick={handlePrint}
                style={tajawal}
              >
                <Printer className="w-4 h-4" />
                طباعة / تصدير PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {REPORT_CARDS.map((card) => {
            const selected = activeView === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => selectReport(card.id)}
                className={`text-right rounded-3xl border p-4 transition-all ${
                  selected
                    ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/30"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{card.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground" style={tajawal}>
                      {card.title}
                    </span>
                    <span
                      className="block text-xs text-muted-foreground mt-1 leading-relaxed"
                      style={tajawal}
                    >
                      {card.description}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className={`${ds.alert.error} admin-reports-screen-only`} style={tajawal}>
          {error}
        </p>
      )}

      <div
        id="admin-reports-print"
        className="admin-reports-print-body space-y-6 print:bg-white print:text-black print:dark:bg-white print:dark:text-black"
      >
        <div className="hidden print:block text-center border-b border-black/20 pb-4 mb-4 print:text-black print:bg-white print:dark:bg-white">
          <img
            src="/logo-light.png"
            alt="شعار مجمع البساتين"
            className="h-24 w-32 print:w-32 print:h-32 mx-auto mb-3 object-contain print:block"
          />
          <h1 className="text-2xl font-bold print:text-black" style={tajawal}>
            تقرير القسم الإداري — مجمع البساتين
          </h1>
          <p className="text-sm text-muted-foreground mt-1 print:text-black" style={tajawal}>
            {activeMeta?.title ?? "تقرير"} — من {startDate} إلى {endDate}
            {statusFilter === "absent_only" ? " — الغائبون فقط" : ""}
            {filterCircleId !== "all"
              ? ` — حلقة: ${circles.find((c) => String(c.id) === filterCircleId)?.name_ar ?? filterCircleId}`
              : ""}
            {filterTrackId !== "all"
              ? ` — مسار: ${tracks.find((t) => String(t.id) === filterTrackId)?.name_ar ?? filterTrackId}`
              : ""}
          </p>
        </div>

        {activeView !== "student_lookup" && (
          <Card className={ds.card}>
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className={ds.page.section} style={tajawal}>
                {activeMeta?.title ?? "التقرير"}
              </CardTitle>
              <CardDescription style={tajawal}>
                {activeMeta?.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-4">
              {loading && activeView !== "discipline" ? (
                <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
                  جاري التحميل…
                </p>
              ) : null}

              {activeView === "overview" && !loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-0 print:grid-cols-2">
                  <KpiCard
                    icon={<Users className="w-5 h-5 text-primary" />}
                    label="عدد المنسوبين"
                    value={summary.staff_total}
                  />
                  <KpiCard
                    icon={<Users className="w-5 h-5 text-primary" />}
                    label="تحضير المنسوبين"
                    value={summary.staff_present}
                    sub={staffAttendanceSub}
                  />
                  <KpiCard
                    icon={<GraduationCap className="w-5 h-5 text-primary" />}
                    label="عدد الطلاب"
                    value={summary.students_total}
                  />
                  <KpiCard
                    icon={<GraduationCap className="w-5 h-5 text-primary" />}
                    label="تحضير الطلاب"
                    value={summary.students_present}
                    sub={studentAttendanceSub}
                  />
                </div>
              )}

              {activeView === "staff" && !loading && (
                <AttendanceSummaryTable
                  rows={staffSummary}
                  emptyLabel="لا توجد سجلات منسوبين مطابقة للفلاتر."
                />
              )}

              {activeView === "students" && !loading && (
                <AttendanceSummaryTable
                  rows={studentSummary}
                  emptyLabel="لا توجد سجلات طلاب مطابقة للفلاتر."
                />
              )}

              {activeView === "discipline" && (
                <>
                  {disciplineLoading ? (
                    <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
                      جاري تحميل تقرير الانضباط…
                    </p>
                  ) : disciplineRows.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
                      لا توجد بيانات انضباط للفترة المحددة.
                    </p>
                  ) : (
                    <Table className={`${ds.tableMin} text-right`} dir="rtl">
                      <TableHeader>
                        <TableRow>
                          <TableHead className={ds.table.head} style={tajawal}>
                            اسم الطالب
                          </TableHead>
                          <TableHead className={ds.table.head} style={tajawal}>
                            الحلقة
                          </TableHead>
                          <TableHead className={ds.table.head} style={tajawal}>
                            أيام الحضور
                          </TableHead>
                          <TableHead className={ds.table.head} style={tajawal}>
                            أيام الغياب
                          </TableHead>
                          <TableHead className={ds.table.head} style={tajawal}>
                            نسبة الانضباط
                          </TableHead>
                          <TableHead className={ds.table.head} style={tajawal}>
                            انضباط الحلقة
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {disciplineRows.map((row) => (
                          <TableRow key={`${row.student_id}-${row.circle_id ?? "none"}`}>
                            <TableCell className={ds.table.cell} style={tajawal}>
                              {row.full_name_ar}
                            </TableCell>
                            <TableCell className={ds.table.cell} style={tajawal}>
                              {row.circle_name ?? "—"}
                            </TableCell>
                            <TableCell
                              className={`${ds.table.cell} tabular-nums`}
                              style={tajawal}
                            >
                              {Number(row.present_days ?? 0)}
                            </TableCell>
                            <TableCell
                              className={`${ds.table.cell} tabular-nums`}
                              style={tajawal}
                            >
                              {Math.max(
                                0,
                                Number(row.official_days ?? 0) -
                                  Number(row.present_days ?? 0),
                              )}
                            </TableCell>
                            <TableCell
                              className={`${ds.table.cell} tabular-nums`}
                              style={tajawal}
                            >
                              {formatDisciplinePct(row)}
                            </TableCell>
                            <TableCell
                              className={`${ds.table.cell} tabular-nums`}
                              style={tajawal}
                            >
                              {formatPctValue(row.circle_discipline_pct)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {activeView === "student_lookup" && (
          <Card className={ds.card}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2" style={tajawal}>
                <Search className="w-4 h-4 text-primary" />
                بحث عن طالب — سجل الحضور الكامل
              </CardTitle>
              <CardDescription style={tajawal}>
                اختر طالباً لعرض حضوره وغيابه واستئذانه في تاريخه بالكامل.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AdminStudentSearchCombobox
                id="admin-reports-student-search"
                value={studentId}
                onChange={(id) => {
                  setStudentId(id);
                  setStudentReport(null);
                  if (id != null) void loadStudentReport(id);
                }}
              />
              {studentLoading && (
                <p className="text-sm text-muted-foreground text-right" style={tajawal}>
                  جاري تحميل سجل الطالب…
                </p>
              )}
              {studentReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="حاضر" value={studentReport.summary.present} />
                    <KpiCard label="غائب" value={studentReport.summary.absent} />
                    <KpiCard label="مستأذن" value={studentReport.summary.excused} />
                    <KpiCard label="إجمالي الأيام" value={studentReport.summary.total} />
                  </div>
                  <div className={`${ds.card} overflow-hidden`}>
                    <Table className={`${ds.tableMin} text-right`} dir="rtl">
                      <TableHeader>
                        <TableRow>
                          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
                            التاريخ
                          </TableHead>
                          <TableHead className={`${ds.table.head} text-right`} style={tajawal}>
                            الحالة
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentReport.items.map((row) => (
                          <TableRow key={row.date}>
                            <TableCell
                              className={`${ds.table.cell} text-right`}
                              style={tajawal}
                            >
                              {row.date}
                            </TableCell>
                            <TableCell
                              className={`${ds.table.cell} text-right`}
                              style={tajawal}
                            >
                              {STATUS_AR[row.status] ?? row.status}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card className={`${ds.card} print:break-inside-avoid`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2" style={tajawal}>
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold" style={tajawal}>
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed" style={tajawal}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
