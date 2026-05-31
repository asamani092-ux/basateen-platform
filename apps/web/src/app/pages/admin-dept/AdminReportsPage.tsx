import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Users, GraduationCap, Search } from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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

type ReportRow = {
  name: string;
  date: string;
  status: string;
  type: "staff" | "student";
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(emptySummary);
  const [items, setItems] = useState<ReportRow[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [studentReport, setStudentReport] = useState<Awaited<
    ReturnType<typeof api.adminDeptStudentAttendanceReport>
  > | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);

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

  const load = useCallback(async () => {
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
      });
      setSummary({ ...emptySummary, ...res.summary });
      setItems(res.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
    window.print();
  }

  const staffAttendanceSub = `حاضر ${summary.staff_present} (${summary.staff_present_pct}%) · غائب/مستأذن ${summary.staff_absent} (${summary.staff_absent_pct}%) — آخر يوم`;
  const studentAttendanceSub = `حاضر ${summary.students_present} (${summary.students_present_pct}%) · غائب/مستأذن ${summary.students_absent} (${summary.students_absent_pct}%) — آخر يوم`;

  return (
    <div className="space-y-6 max-w-[1200px]" dir="rtl">
      <div className="admin-reports-screen-only flex flex-col gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            المؤشرات والتقارير
          </h2>
          <p className={ds.page.description} style={tajawal}>
            ملخص التحضير مع جداول تفصيلية منفصلة — تصدير PDF عبر الطباعة.
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
                onClick={load}
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
                          <TableCell className={`${ds.table.cell} text-right`} style={tajawal}>
                            {row.date}
                          </TableCell>
                          <TableCell className={`${ds.table.cell} text-right`} style={tajawal}>
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
      </div>

      {error && (
        <p className={`${ds.alert.error} admin-reports-screen-only`} style={tajawal}>
          {error}
        </p>
      )}

      <div id="admin-reports-print" className="space-y-6">
        <div className="hidden print:block text-center border-b border-border pb-4 mb-4">
          <h1 className="text-2xl font-bold" style={tajawal}>
            تقرير القسم الإداري — مجمع البساتين
          </h1>
          <p className="text-sm text-muted-foreground mt-1" style={tajawal}>
            من {startDate} إلى {endDate}
            {statusFilter === "absent_only" ? " — الغائبون فقط" : ""}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground admin-reports-screen-only" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-2 print:gap-3">
            <KpiCard
              icon={<Users className="w-5 h-5 text-primary" />}
              label="عدد المنسوبين الإجمالي"
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
              label="عدد الطلاب الإجمالي"
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

        <Card className={`${ds.card} overflow-hidden print:shadow-none print:border`}>
          <CardHeader className="border-b border-border print:border-0">
            <CardTitle className={ds.page.section} style={tajawal}>
              التقرير التفصيلي
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="students" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto flex-wrap print:hidden">
                <TabsTrigger
                  value="students"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3"
                  style={tajawal}
                >
                  تقرير الطلاب ({studentItems.length})
                </TabsTrigger>
                <TabsTrigger
                  value="staff"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3"
                  style={tajawal}
                >
                  تقرير المنسوبين ({staffItems.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="students" className="mt-0 print:block">
                <DetailTable
                  rows={studentItems}
                  emptyLabel="لا توجد سجلات طلاب مطابقة للفلاتر."
                />
              </TabsContent>
              <TabsContent value="staff" className="mt-0 print:block">
                <DetailTable
                  rows={staffItems}
                  emptyLabel="لا توجد سجلات منسوبين مطابقة للفلاتر."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
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
