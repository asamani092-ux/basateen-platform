import { useCallback, useEffect, useState } from "react";
import { todayRiyadhIso } from "../../lib/today-riyadh-iso";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Printer,
  Search,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import {
  EduEducationalProfileReport,
  type EduEducationalProfile,
} from "../../components/edu/EduStudentReportModal";
import { EduKpiCard } from "../../components/edu/EduKpiCard";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import {
  MemorizationProfileCard,
  type MemorizationProfileData,
} from "../../components/edu/MemorizationProfileCard";
import { formatFacesToText } from "../../lib/quran-memorization";
import { defaultDateRange } from "../../lib/local-iso-date";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type CircleReport = Awaited<ReturnType<typeof api.eduDeptReportsProgress>>;

function qualityBarClass(pct: number): string {
  if (pct >= 75) return "[&>div]:bg-success";
  if (pct >= 50) return "[&>div]:bg-warning";
  return "[&>div]:bg-destructive";
}

function printWithClass(className: string) {
  document.body.classList.add(className);
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove(className);
  }, 500);
}

export function EduReportsPage() {
  const initial = defaultDateRange(7);

  const [studentId, setStudentId] = useState<number | null>(null);
  const [profile, setProfile] = useState<EduEducationalProfile | null>(null);
  const [profileMemorization, setProfileMemorization] =
    useState<MemorizationProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [scopeValue, setScopeValue] = useState("");
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [tracks, setTracks] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [circleData, setCircleData] = useState<CircleReport | null>(null);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleApplied, setCircleApplied] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<Awaited<
    ReturnType<typeof api.eduDashboard>
  > | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!canUseApi()) {
      setDashboardLoading(false);
      return;
    }
    setDashboardLoading(true);
    try {
      const res = await api.eduDashboard();
      setDashboard(res);
    } catch {
      /* KPI strip optional — page still usable */
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadScopes = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.eduDeptFilterScopes();
      setCircles(res.circles.map((c) => ({ id: c.id, name_ar: c.name_ar })));
      setTracks(res.tracks);
    } catch {
      try {
        const circlesRes = await api.circles();
        setCircles(circlesRes.items.map((c) => ({ id: c.id, name_ar: c.name_ar })));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    void loadScopes();
    void loadDashboard();
  }, [loadScopes, loadDashboard]);

  async function loadStudentProfile() {
    if (studentId == null) {
      setError("اختر طالباً من البحث");
      return;
    }
    setProfileLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptEducationalProfile({ person_id: studentId });
      setProfile(res);
      const person = res.person as EduEducationalProfile["person"];
      const faces =
        person.memorization_faces != null ? Number(person.memorization_faces) : null;
      const text =
        person.memorization_display?.trim() ||
        person.memorization_amount?.trim() ||
        (faces != null && faces > 0 ? formatFacesToText(faces) : null);
      setProfileMemorization({
        faces: faces != null && faces > 0 ? faces : null,
        text: text || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الكشف التعليمي");
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  const loadCircleReport = useCallback(async () => {
    if (!canUseApi()) return;
    if (!scopeValue) {
      setError("اختر حلقة أو مساراً");
      return;
    }
    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    const [kind, idStr] = scopeValue.split(":");
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) {
      setError("اختيار غير صالح");
      return;
    }
    setCircleLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptReportsProgress({
        date_from: startDate,
        date_to: endDate,
        ...(kind === "circle" ? { circle_id: id } : { track_id: id }),
      });
      setCircleData(res);
      setCircleApplied(true);
      if (res.tracks?.length) setTracks(res.tracks);
      if (res.circles?.length) setCircles(res.circles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل تقرير الحلقة");
      setCircleData(null);
    } finally {
      setCircleLoading(false);
    }
  }, [startDate, endDate, scopeValue]);

  const scopeLabel =
    scopeValue.startsWith("circle:")
      ? circles.find((c) => c.id === Number(scopeValue.split(":")[1]))?.name_ar
      : tracks.find((t) => t.id === Number(scopeValue.split(":")[1]))?.name_ar;

  return (
    <div className="space-y-6 max-w-[1200px] edu-reports-page" dir="rtl">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <BarChart3 className="w-7 h-7 text-primary" />
          التقارير والمتابعة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          كشوف تعليمية قرآنية فقط — رصد الحفظ والسماع والمراجعة والربط عبر كل الحلقات والمسارات.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {!dashboardLoading && dashboard && (
        <div className="space-y-2 print:hidden">
          <p className="text-xs text-muted-foreground" style={tajawal}>
            ملخص {dashboard.scope_label} — {todayRiyadhIso()}
          </p>
          <div className={ds.kpiStrip}>
            <EduKpiCard
              icon={<Users className="w-4 h-4 text-primary" />}
              label="طلاب نشطون"
              value={dashboard.kpis.active_students}
            />
            <EduKpiCard
              icon={<ClipboardList className="w-4 h-4 text-primary" />}
              label="رصد اليوم"
              value={dashboard.kpis.teacher_marks_today}
              sub="سجل معلم اليوم"
            />
            <EduKpiCard
              icon={<Trophy className="w-4 h-4 text-primary" />}
              label="منافسات نشطة"
              value={dashboard.kpis.active_competitions}
            />
            <EduKpiCard
              icon={<UserPlus className="w-4 h-4 text-primary" />}
              label="بانتظار التسكين"
              value={dashboard.kpis.pending_placement}
              highlight={dashboard.kpis.pending_placement > 0}
              sub={
                dashboard.active_himma
                  ? `يوم همّة: ${dashboard.active_himma.name_ar}`
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <Search className="w-5 h-5 text-primary" />
            البحث التفصيلي عن طالب
          </CardTitle>
          <CardDescription style={tajawal}>
            كشف تاريخي تراكمي يجمع درجات الحفظ والسماع والمراجعة والربط من أول يوم سجل فيه الطالب.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 print:hidden">
            <div className="flex-1">
              <AdminStudentSearchCombobox
                id="edu-report-student"
                value={studentId}
                onChange={(id) => {
                  setStudentId(id);
                  setProfile(null);
                  setProfileMemorization(null);
                }}
              />
            </div>
            <Button
              type="button"
              className={ds.btnRound}
              disabled={profileLoading}
              onClick={() => void loadStudentProfile()}
              style={tajawal}
            >
              {profileLoading ? "جاري التحميل…" : "عرض الكشف التعليمي"}
            </Button>
          </div>

          {profileLoading ? (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري تحميل السجل التراكمي…
            </p>
          ) : profile ? (
            <div className="space-y-4">
              <MemorizationProfileCard data={profileMemorization} />
              <EduEducationalProfileReport
                report={profile}
                onPrint={() => printWithClass("printing-edu-detail-report")}
              />
            </div>
          ) : (
            <p className={`${ds.alert.info} print:hidden`} style={tajawal}>
              ابحث عن طالب ثم اعرض كشفه التعليمي الكامل.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className={ds.card} id="edu-circle-report-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <Users className="w-5 h-5 text-primary" />
            التقارير العامة للحلقات
          </CardTitle>
          <CardDescription style={tajawal}>
            ملخص أداء طلاب حلقة أو مسار خلال النطاق الزمني المختار.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`${ds.filterRow} print:hidden`}>
            <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
              <Label style={tajawal}>الحلقة / المسار</Label>
              <select
                value={scopeValue}
                onChange={(e) => setScopeValue(e.target.value)}
                className={ds.select}
                style={tajawal}
              >
                <option value="">— اختر —</option>
                {circles.length > 0 && (
                  <optgroup label="حلقات">
                    {circles.map((c) => (
                      <option key={`c-${c.id}`} value={`circle:${c.id}`}>
                        {c.name_ar}
                      </option>
                    ))}
                  </optgroup>
                )}
                {tracks.length > 0 && (
                  <optgroup label="مسارات">
                    {tracks.map((t) => (
                      <option key={`t-${t.id}`} value={`track:${t.id}`}>
                        {t.name_ar}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="space-y-1 w-full sm:flex-1 sm:min-w-[160px] sm:max-w-xs">
              <Label style={tajawal}>من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1 w-full sm:flex-1 sm:min-w-[160px] sm:max-w-xs">
              <Label style={tajawal}>إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="w-full sm:w-auto sm:shrink-0">
              <Button
                type="button"
                className={`w-full sm:w-auto ${ds.btnRound}`}
                onClick={() => void loadCircleReport()}
                disabled={circleLoading}
                style={tajawal}
              >
                {circleLoading ? "جاري التحميل…" : "تطبيق الفلتر"}
              </Button>
            </div>
          </div>

          {circleLoading ? (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : !circleApplied ? (
            <p className={`${ds.alert.info} print:hidden`} style={tajawal}>
              اختر حلقة أو مساراً وحدّد النطاق الزمني.
            </p>
          ) : circleData ? (
            <>
              <div className="hidden print:block text-center border-b border-black pb-3 mb-4">
                <h1 className="text-xl font-bold" style={tajawal}>
                  تقرير حلقة / مسار — {scopeLabel ?? "—"}
                </h1>
                <p className="text-sm" style={tajawal}>
                  {circleData.date_from} — {circleData.date_to}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:break-inside-avoid">
                <div className={`${ds.card} p-4 flex items-center gap-3`}>
                  <BookOpen className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground" style={tajawal}>
                      متوسط الجودة
                    </p>
                    <p className="text-2xl font-bold">{circleData.summary.avg_quality}%</p>
                  </div>
                </div>
                <div className={`${ds.card} p-4`}>
                  <p className="text-sm text-muted-foreground" style={tajawal}>
                    سجلات الرصد
                  </p>
                  <p className="text-2xl font-bold">{circleData.summary.total_records}</p>
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    {circleData.summary.active_students} طالب نشط
                  </p>
                </div>
                <div className={`${ds.card} p-4`}>
                  <p className="text-sm text-muted-foreground" style={tajawal}>
                    إجمالي الأوجه
                  </p>
                  <p className="text-2xl font-bold">
                    {circleData.summary.total_faces_in_range ?? 0}
                  </p>
                </div>
              </div>

              <div className="flex print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  onClick={() => printWithClass("printing-edu-circle-report")}
                  style={tajawal}
                >
                  <Printer className="w-4 h-4" />
                  طباعة تقرير الحلقة
                </Button>
              </div>

              <div className={`${ds.card} edu-print-table-wrap`}>
                {circleData.items.length === 0 ? (
                  <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
                    لا توجد سجلات رصد في هذه الفترة.
                  </p>
                ) : (
                  <Table className={`${ds.tableMin} text-right edu-print-table`} dir="rtl">
                    <TableHeader className="print:table-header-group">
                      <TableRow>
                        <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                          الطالب
                        </TableHead>
                        <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                          الحلقة
                        </TableHead>
                        <TableHead className={`${ds.table.head} w-[34%]`} style={tajawal}>
                          نسبة الجودة
                        </TableHead>
                        <TableHead
                          className={`${ds.table.head} w-[10%] text-center`}
                          style={tajawal}
                        >
                          أوجه
                        </TableHead>
                        <TableHead
                          className={`${ds.table.head} w-[10%] text-center`}
                          style={tajawal}
                        >
                          أخطاء
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {circleData.items.map((row) => (
                        <TableRow key={row.student_id} className="print:break-inside-avoid">
                          <TableTruncatedCell style={tajawal}>
                            {row.full_name_ar}
                          </TableTruncatedCell>
                          <TableTruncatedCell style={tajawal}>
                            {row.circle_name}
                          </TableTruncatedCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
