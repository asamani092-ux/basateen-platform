import { useCallback, useState } from "react";
import {
  BarChart3,
  GraduationCap,
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";
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

const emptyKpi: KpiSummary = {
  staff_total: 0,
  students_total: 0,
  staff_present: 0,
  students_present: 0,
  staff_discipline_pct: 0,
  students_discipline_pct: 0,
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
  const [complexName, setComplexName] = useState<string | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>("student");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [drillStart, setDrillStart] = useState(initial.start);
  const [drillEnd, setDrillEnd] = useState(initial.end);
  const [reportLoading, setReportLoading] = useState(false);
  const [individualReport, setIndividualReport] =
    useState<IndividualReportData | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

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

  return (
    <div className="space-y-6 max-w-[1200px]" dir="rtl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          المؤشرات والتقارير
        </h2>
        <p className={ds.page.description} style={tajawal}>
          لوحة قيادة تنفيذية للمجمع مع تقارير انضباط تفصيلية للأفراد.
        </p>
      </div>

      <Card className={ds.card}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={tajawal}>
            <BarChart3 className="w-5 h-5 text-primary" />
            مؤشرات الأداء
          </CardTitle>
          <CardDescription style={tajawal}>
            حدّد الفترة ثم حدّث المؤشرات المجمّعة للمجمع
            {complexName ? ` — ${complexName}` : ""}.
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
            disabled={kpiLoading}
            onClick={() => void loadKpis()}
            style={tajawal}
          >
            {kpiLoading ? "جاري التحديث…" : "تحديث المؤشرات"}
          </Button>
          {kpiError && (
            <p className={ds.alert.error} style={tajawal}>
              {kpiError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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

function KpiCard({
  icon,
  label,
  value,
  sub,
  isText,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  isText?: boolean;
}) {
  return (
    <Card className={ds.card}>
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
          className={isText ? "text-3xl font-bold" : "text-3xl font-bold tabular-nums"}
          style={tajawal}
        >
          {value}
        </p>
        {sub && (
          <p
            className="text-xs text-muted-foreground mt-1 leading-relaxed"
            style={tajawal}
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
