import { useCallback, useEffect, useState } from "react";
import { BarChart3, BookOpen, CalendarRange, Printer, Search, TrendingUp } from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import {
  EduStudentReportModal,
  type EduStudentReport,
} from "../../components/edu/EduStudentReportModal";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { EduKpiCard } from "../../components/edu/EduKpiCard";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { defaultDateRange } from "../../lib/local-iso-date";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type ReportData = Awaited<ReturnType<typeof api.eduDeptReportsProgress>>;

function qualityBarClass(pct: number): string {
  if (pct >= 75) return "[&>div]:bg-emerald-500";
  if (pct >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-destructive";
}

export function EduReportsPage() {
  const initial = defaultDateRange(7);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [circleId, setCircleId] = useState("");
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [detailReport, setDetailReport] = useState<EduStudentReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptReportsProgress({
        date_from: startDate,
        date_to: endDate,
        circle_id: circleId ? Number(circleId) : undefined,
      });
      setData(res);
      setApplied(true);
      if (res.circles?.length) setCircles(res.circles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, circleId]);

  useEffect(() => {
    if (!canUseApi()) return;
    void api.circles().then((res) => {
      setCircles(res.items.map((c) => ({ id: c.id, name_ar: c.name_ar })));
    });
  }, []);

  const facesInRange =
    data?.summary.total_faces_in_range ??
    data?.summary.faces_today ??
    0;

  async function openStudentReport() {
    if (studentId == null) {
      setError("اختر طالباً من البحث");
      return;
    }
    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptIndividualReport({
        person_id: studentId,
        start: startDate,
        end: endDate,
      });
      setDetailReport(res);
      setDetailOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير التفصيلي");
    } finally {
      setDetailLoading(false);
    }
  }

  function printGeneralReport() {
    document.body.classList.add("printing-edu-general-report");
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-edu-general-report");
    }, 500);
  }

  return (
    <div className="space-y-6 max-w-[1200px] edu-reports-page" dir="rtl">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <BarChart3 className="w-7 h-7 text-primary" />
          التقارير والمتابعة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إنجاز تراكمي بناءً على أوزان السماع والتكرار والمراجعة والربط.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-4 print:hidden`}>
        <div className="space-y-2">
          <Label style={tajawal}>بحث عن طالب (تقرير تفصيلي)</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <AdminStudentSearchCombobox
                id="edu-report-student"
                value={studentId}
                onChange={setStudentId}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className={ds.btnRound}
              disabled={detailLoading}
              onClick={() => void openStudentReport()}
              style={tajawal}
            >
              <Search className="w-4 h-4" />
              التقرير التفصيلي
            </Button>
          </div>
        </div>
        <div className={ds.filterRow}>
          <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Label style={tajawal}>من تاريخ</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={ds.btnRound}
            />
          </div>
          <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Label style={tajawal}>إلى تاريخ</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={ds.btnRound}
            />
          </div>
          <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Label style={tajawal}>الحلقة</Label>
            <select
              value={circleId}
              onChange={(e) => setCircleId(e.target.value)}
              className={ds.select}
              style={tajawal}
            >
              <option value="">كل الحلقات</option>
              {circles.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:shrink-0">
            <Button
              type="button"
              className={`w-full sm:w-auto ${ds.btnRound}`}
              onClick={() => void load()}
              disabled={loading}
              style={tajawal}
            >
              {loading ? "جاري التحميل…" : "تطبيق الفلتر"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm" style={tajawal}>
          جاري التحميل…
        </p>
      ) : !applied ? (
        <p className={ds.alert.info} style={tajawal}>
          حدّد النطاق الزمني ثم طبّق الفلتر لعرض التقرير.
        </p>
      ) : data ? (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={printGeneralReport}
              style={tajawal}
            >
              <Printer className="w-4 h-4" />
              طباعة التقرير العام
            </Button>
          </div>
          <div
            id="edu-general-report-print"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <EduKpiCard
              icon={<BookOpen className="w-5 h-5 text-primary" />}
              label="إجمالي الأوجه في النطاق"
              value={facesInRange}
              sub={`${data.date_from} — ${data.date_to}`}
            />
            <EduKpiCard
              icon={<CalendarRange className="w-5 h-5 text-primary" />}
              label="سجلات الرصد"
              value={data.summary.total_records}
              sub={`${data.summary.active_students} طالب نشط`}
            />
            <EduKpiCard
              icon={<TrendingUp className="w-5 h-5 text-primary" />}
              label="متوسط إنجاز الجودة"
              value={`${data.summary.avg_quality}%`}
              sub={
                data.summary.top_circle
                  ? `أفضل حلقة: ${data.summary.top_circle.circle_name}`
                  : undefined
              }
            />
          </div>

          <div className={`${ds.card} edu-print-table-wrap`}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                تقدم الطلاب — {data.date_from} إلى {data.date_to}
              </h3>
            </div>
            {data.items.length === 0 ? (
              <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
                لا توجد سجلات رصد في هذه الفترة.
              </p>
            ) : (
              <Table className={`${ds.tableMin} text-right edu-print-table`} dir="rtl">
                <TableHeader className="print:table-header-group">
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[20%]`} style={tajawal}>
                      الطالب
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[32%]`} style={tajawal}>
                      نسبة الجودة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[10%] text-center`} style={tajawal}>
                      أوجه
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[10%] text-center`} style={tajawal}>
                      أخطاء
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.student_id} className="print:break-inside-avoid">
                      <TableTruncatedCell style={tajawal}>{row.full_name_ar}</TableTruncatedCell>
                      <TableTruncatedCell style={tajawal}>{row.circle_name}</TableTruncatedCell>
                      <TableCell className={ds.table.cell}>
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Progress
                            value={row.quality_pct}
                            className={cn("h-2 flex-1", qualityBarClass(row.quality_pct))}
                          />
                          <span
                            className="text-sm font-semibold tabular-nums w-12 text-left"
                            style={tajawal}
                          >
                            {row.quality_pct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={`${ds.table.cell} text-center tabular-nums`}
                        style={tajawal}
                      >
                        {row.face_count ?? 0}
                      </TableCell>
                      <TableCell
                        className={`${ds.table.cell} text-center tabular-nums`}
                        style={tajawal}
                      >
                        {row.error_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      ) : null}

      <EduStudentReportModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        report={detailReport}
      />
    </div>
  );
}
