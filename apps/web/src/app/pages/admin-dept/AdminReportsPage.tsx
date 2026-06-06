import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  GraduationCap,
  Layers,
  Printer,
  UserCheck,
  Users,
} from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import { AdminStaffSearchCombobox } from "../../components/admin/AdminStaffSearchCombobox";
import {
  IndividualDisciplineReportModal,
  type IndividualReportData,
} from "../../components/admin/IndividualDisciplineReportModal";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { useAdminDataSync } from "../../context/AdminDataSyncContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";
import { roleLabelAr } from "../../lib/role-labels";
import { toast } from "sonner";

type KpiSummary = {
  staff_total: number;
  students_total: number;
  staff_present: number;
  students_present: number;
  staff_discipline_pct: number;
  students_discipline_pct: number;
  staff_present_pct?: number;
  students_present_pct?: number;
};

type DashboardStats = {
  students: {
    total: number;
    circle_only: number;
    track_only: number;
    circle_and_track: number;
    unassigned: number;
  };
  groups: { circles_active: number; tracks_active: number };
  staff: { total: number; by_role: Record<string, number> };
  pledges: {
    total: number;
    this_month: number;
    students_with_pledges: number;
  } | null;
  attendance: {
    date: string;
    students_marked_today: number;
    students_present_today: number;
    staff_marked_today: number;
    staff_present_today: number;
  };
};

const emptyKpi: KpiSummary = {
  staff_total: 0,
  students_total: 0,
  staff_present: 0,
  students_present: 0,
  staff_discipline_pct: 0,
  students_discipline_pct: 0,
};

const emptyDashboard: DashboardStats = {
  students: {
    total: 0,
    circle_only: 0,
    track_only: 0,
    circle_and_track: 0,
    unassigned: 0,
  },
  groups: { circles_active: 0, tracks_active: 0 },
  staff: { total: 0, by_role: {} },
  pledges: null,
  attendance: {
    date: "",
    students_marked_today: 0,
    students_present_today: 0,
    staff_marked_today: 0,
    staff_present_today: 0,
  },
};

type BeneficiaryType = "student" | "staff";

function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: isoFromDate(start), end: isoFromDate(end) };
}

export function AdminReportsPage() {
  const initial = defaultRange();
  const [kpiStart, setKpiStart] = useState(initial.start);
  const [kpiEnd, setKpiEnd] = useState(initial.end);
  const [kpi, setKpi] = useState<KpiSummary>(emptyKpi);
  const [dashboard, setDashboard] = useState<DashboardStats>(emptyDashboard);
  const [complexName, setComplexName] = useState<string | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>("student");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [drillStart, setDrillStart] = useState(initial.start);
  const [drillEnd, setDrillEnd] = useState(initial.end);
  const [reportLoading, setReportLoading] = useState(false);
  const [individualReport, setIndividualReport] =
    useState<IndividualReportData | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!canUseApi()) {
      setDashboardError("أعد تسجيل الدخول");
      setDashboard(emptyDashboard);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const res = await api.adminDashboardStats();
      if (res.complex_name) setComplexName(res.complex_name);
      setDashboard({
        students: res.students,
        groups: res.groups,
        staff: res.staff,
        pledges: res.pledges,
        attendance: res.attendance,
      });
    } catch (e) {
      setDashboardError(
        e instanceof Error ? e.message : "فشل تحميل إحصائيات النظام",
      );
      setDashboard(emptyDashboard);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadKpis = useCallback(async () => {
    if (!canUseApi()) {
      setKpiError("أعد تسجيل الدخول");
      return;
    }
    if (kpiStart > kpiEnd) {
      setKpiError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setKpiLoading(true);
    setKpiError(null);
    try {
      const res = await api.adminDeptReports({
        startDate: kpiStart,
        endDate: kpiEnd,
        include_items: false,
      });
      setComplexName(res.complex_name ?? null);
      setKpi({
        staff_total: res.summary.staff_total,
        students_total: res.summary.students_total,
        staff_present: res.summary.staff_present,
        students_present: res.summary.students_present,
        staff_discipline_pct: res.summary.staff_discipline_pct ?? 0,
        students_discipline_pct: res.summary.students_discipline_pct ?? 0,
        staff_present_pct: res.summary.staff_present_pct,
        students_present_pct: res.summary.students_present_pct,
      });
    } catch (e) {
      setKpiError(e instanceof Error ? e.message : "فشل تحميل المؤشرات");
      setKpi(emptyKpi);
    } finally {
      setKpiLoading(false);
    }
  }, [kpiStart, kpiEnd]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadDashboard(), loadKpis()]);
  }, [loadDashboard, loadKpis]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAll]);

  useAdminDataSync(["students", "groups", "staff", "dashboard"], refreshAll);

  async function loadIndividualReport() {
    const personId = beneficiaryType === "student" ? studentId : staffId;
    if (!canUseApi()) {
      toast.error("أعد تسجيل الدخول");
      return;
    }
    if (personId == null) {
      toast.error(
        beneficiaryType === "student" ? "اختر الطالب" : "اختر المنسوب",
      );
      return;
    }
    if (drillStart > drillEnd) {
      toast.error("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setReportLoading(true);
    try {
      const res = await api.adminDeptIndividualReport({
        type: beneficiaryType,
        person_id: personId,
        start: drillStart,
        end: drillEnd,
      });
      setIndividualReport(res);
      setReportModalOpen(true);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "فشل تحميل التقرير التفصيلي",
      );
    } finally {
      setReportLoading(false);
    }
  }

  const staffRoles = Object.entries(dashboard.staff.by_role).sort(
    (a, b) => b[1] - a[1],
  );
  const isLoading = kpiLoading || dashboardLoading;

  return (
    <div className="space-y-6 max-w-[1200px]" dir="rtl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          المؤشرات والتقارير
        </h2>
        <p className={ds.page.description} style={tajawal}>
          لوحة قيادة تنفيذية للمجمع مع تقارير انضباط تفصيلية للأفراد.
          {complexName ? ` — ${complexName}` : ""}
        </p>
      </div>

      <Card className={ds.card}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={tajawal}>
            <Layers className="w-5 h-5 text-primary" />
            ملخص النظام الحي
          </CardTitle>
          <CardDescription style={tajawal}>
            أرقام مجمّعة مباشرة من قاعدة البيانات — تُحدَّث عند فتح التبويب.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboardError && (
            <p className={ds.alert.error} style={tajawal}>
              {dashboardError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {dashboardLoading ? (
              Array.from({ length: 9 }).map((_, i) => (
                <KpiSkeleton key={i} />
              ))
            ) : (
              <>
                <KpiCard
                  icon={<GraduationCap className="w-5 h-5 text-primary" />}
                  label="إجمالي الطلاب"
                  value={dashboard.students.total}
                />
                <KpiCard
                  icon={<Layers className="w-5 h-5 text-primary" />}
                  label="الحلقات النشطة"
                  value={dashboard.groups.circles_active}
                />
                <KpiCard
                  icon={<Layers className="w-5 h-5 text-primary" />}
                  label="المسارات النشطة"
                  value={dashboard.groups.tracks_active}
                />
                <KpiCard
                  icon={<BookOpen className="w-5 h-5 text-primary" />}
                  label="إجمالي التعهدات"
                  value={dashboard.pledges?.total ?? 0}
                  sub={
                    dashboard.pledges
                      ? `${dashboard.pledges.this_month} هذا الشهر — ${dashboard.pledges.students_with_pledges} طالب`
                      : undefined
                  }
                />
                <KpiCard
                  icon={<BarChart3 className="w-5 h-5 text-primary" />}
                  label="تحضير اليوم (مسجّل)"
                  value={dashboard.attendance.students_marked_today}
                  sub={`${dashboard.attendance.students_present_today} حاضر — ${dashboard.attendance.staff_marked_today} منسوب مُحضَّر`}
                />
                <KpiCard
                  icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
                  label="طلاب الحلقات"
                  value={dashboard.students.circle_only}
                  sub="حلقة فقط — بدون مسار"
                />
                <KpiCard
                  icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
                  label="طلاب المسارات"
                  value={dashboard.students.track_only}
                  sub="مسار فقط — بدون حلقة"
                />
                <KpiCard
                  icon={<UserCheck className="w-5 h-5 text-violet-600" />}
                  label="طلاب الحلق والمسارات"
                  value={dashboard.students.circle_and_track}
                  sub="مشتركون في حلقة ومسار"
                />
                <KpiCard
                  icon={<Users className="w-5 h-5 text-primary" />}
                  label="إجمالي المنسوبين"
                  value={dashboard.staff.total}
                />
              </>
            )}
          </div>

          {!dashboardLoading && staffRoles.length > 0 && (
            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-medium" style={tajawal}>
                المنسوبون حسب الدور
              </p>
              <div className="flex flex-wrap gap-2">
                {staffRoles.map(([role, count]) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                    style={tajawal}
                  >
                    <span className="font-medium">{roleLabelAr(role)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!dashboardLoading && dashboard.students.unassigned > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p style={tajawal}>
                يوجد{" "}
                <strong className="tabular-nums">
                  {dashboard.students.unassigned}
                </strong>{" "}
                طالب غير مسند لحلقة أو مسار — راجع تبويب الطلاب لإسنادهم.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={ds.card}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={tajawal}>
            <BarChart3 className="w-5 h-5 text-primary" />
            مؤشرات الأداء
          </CardTitle>
          <CardDescription style={tajawal}>
            حدّد الفترة ثم حدّث مؤشرات الحضور والانضباط للمجمع.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                من تاريخ
              </Label>
              <input
                type="date"
                value={kpiStart}
                onChange={(e) => setKpiStart(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                إلى تاريخ
              </Label>
              <input
                type="date"
                value={kpiEnd}
                onChange={(e) => setKpiEnd(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
          </div>
          <Button
            type="button"
            className={ds.btnRound}
            disabled={isLoading}
            onClick={() => void refreshAll()}
            style={tajawal}
          >
            {isLoading ? "جاري التحديث…" : "تحديث المؤشرات"}
          </Button>
          {kpiError && (
            <p className={ds.alert.error} style={tajawal}>
              {kpiError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpiLoading ? (
          Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={<Users className="w-5 h-5 text-primary" />}
              label="إجمالي المنسوبين"
              value={kpi.staff_total}
            />
            <KpiCard
              icon={<GraduationCap className="w-5 h-5 text-primary" />}
              label="إجمالي الطلاب"
              value={kpi.students_total}
            />
            <KpiCard
              icon={<UserCheck className="w-5 h-5 text-primary" />}
              label="حضور المنسوبين"
              value={kpi.staff_present}
              sub={
                kpi.staff_present_pct != null
                  ? `${kpi.staff_present_pct}% من المنسوبين (آخر يوم في الفترة)`
                  : undefined
              }
            />
            <KpiCard
              icon={<UserCheck className="w-5 h-5 text-primary" />}
              label="حضور الطلاب"
              value={kpi.students_present}
              sub={
                kpi.students_present_pct != null
                  ? `${kpi.students_present_pct}% من الطلاب (آخر يوم في الفترة)`
                  : undefined
              }
            />
            <KpiCard
              icon={<BarChart3 className="w-5 h-5 text-primary" />}
              label="نسبة انضباط المنسوبين"
              value={`${kpi.staff_discipline_pct}%`}
              isText
            />
            <KpiCard
              icon={<BarChart3 className="w-5 h-5 text-primary" />}
              label="نسبة انضباط الطلاب"
              value={`${kpi.students_discipline_pct}%`}
              isText
            />
          </>
        )}
      </div>

      <Card className={`${ds.card} border-primary/20 shadow-sm`}>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-base" style={tajawal}>
            التقارير التفصيلية للأفراد
          </CardTitle>
          <CardDescription style={tajawal}>
            ابحث عن طالب أو منسوب واعرض سجل حضوره في الفترة المحددة مع إمكانية
            الطباعة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label style={tajawal}>نوع المستفيد</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={beneficiaryType === "student" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => {
                  setBeneficiaryType("student");
                  setStaffId(null);
                }}
                style={tajawal}
              >
                طالب
              </Button>
              <Button
                type="button"
                variant={beneficiaryType === "staff" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => {
                  setBeneficiaryType("staff");
                  setStudentId(null);
                }}
                style={tajawal}
              >
                منسوب
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label style={tajawal}>
              {beneficiaryType === "student" ? "بحث الطالب" : "بحث المنسوب"}
            </Label>
            {beneficiaryType === "student" ? (
              <AdminStudentSearchCombobox
                id="executive-report-student-search"
                value={studentId}
                onChange={(id) => setStudentId(id)}
                disabled={reportLoading}
              />
            ) : (
              <AdminStaffSearchCombobox
                id="executive-report-staff-search"
                value={staffId}
                onChange={(id) => setStaffId(id)}
                disabled={reportLoading}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                من تاريخ
              </Label>
              <input
                type="date"
                value={drillStart}
                onChange={(e) => setDrillStart(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                إلى تاريخ
              </Label>
              <input
                type="date"
                value={drillEnd}
                onChange={(e) => setDrillEnd(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
          </div>

          <Button
            type="button"
            className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
            disabled={reportLoading}
            onClick={() => void loadIndividualReport()}
            style={tajawal}
          >
            <Printer className="w-4 h-4" />
            {reportLoading ? "جاري التحميل…" : "عرض وطباعة التقرير 🖨️"}
          </Button>
        </CardContent>
      </Card>

      <IndividualDisciplineReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        report={individualReport}
      />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card className={ds.card}>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-3 w-24 mt-2" />
      </CardContent>
    </Card>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  isText,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  isText?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`${ds.card}${highlight ? " border-amber-500/50 bg-amber-500/5" : ""}`}
    >
      <CardHeader className="pb-2">
        <CardTitle
          className="text-sm font-medium flex items-center gap-2"
          style={tajawal}
        >
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            isText ? "text-3xl font-bold" : "text-3xl font-bold tabular-nums"
          }
          style={tajawal}
        >
          {value}
        </p>
        {sub && (
          <p
            className={`text-xs mt-1 leading-relaxed ${
              highlight ? "text-amber-700 font-medium" : "text-muted-foreground"
            }`}
            style={tajawal}
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
