import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { YomHimmaSummaryCard } from "../../components/admin/YomHimmaSummaryCard";
import { SemesterSettingsCard } from "../../components/admin/SemesterSettingsCard";
import { StaffAttendancePanel } from "../../components/admin/StaffAttendancePanel";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type PeriodFilter =
  | "semester"
  | "today"
  | "week"
  | "month"
  | "custom";

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  semester: "الفصل الدراسي (تراكمي)",
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  custom: "نطاق مخصص",
};

export function StatisticsPage() {
  const [period, setPeriod] = useState<PeriodFilter>("semester");
  const [reportTab, setReportTab] = useState<
    "overview" | "students" | "staff" | "programs"
  >("overview");
  const [stats, setStats] = useState<Awaited<
    ReturnType<typeof api.adminStats>
  > | null>(null);
  const [staffList, setStaffList] = useState<
    Array<{ id: number; full_name_ar: string; role: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getApiToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, teachers, supervisors] = await Promise.all([
        api.adminStats(period === "custom" ? "semester" : period),
        api.adminTeachers(),
        api.adminSupervisors(),
      ]);
      setStats(s);
      setStaffList([
        ...teachers.items.map((t) => ({
          id: t.id,
          full_name_ar: t.full_name_ar,
          role: "teacher",
        })),
        ...supervisors.items.map((s) => ({
          id: s.id,
          full_name_ar: s.full_name_ar,
          role: s.role,
        })),
      ]);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = stats?.kpis;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            الإحصائيات
          </h2>
          <p className={ds.page.description} style={tajawal}>
            رقابة المدير العام — حضور الطلاب من الرصد الذكي + تقارير الطاقم
          </p>
        </div>
        <Button
          variant="outline"
          className={ds.btnRound}
          style={tajawal}
          type="button"
          onClick={() => window.print()}
        >
          طباعة / PDF
        </Button>
      </div>

      <SemesterSettingsCard />
      <YomHimmaSummaryCard />

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="text-base" style={tajawal}>
            الفترة الزمنية
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={period === key ? "default" : "outline"}
              className={ds.btnRound}
              onClick={() => setPeriod(key)}
              style={tajawal}
            >
              {PERIOD_LABELS[key]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          {
            label: "الطلاب النشطون",
            value: kpis?.active_students ?? "—",
            icon: Users,
          },
          {
            label: "حضور اليوم (رصد ذكي)",
            value: kpis?.present_today ?? "—",
            icon: ClipboardCheck,
          },
          {
            label: "نسبة الحضور اليوم",
            value: kpis ? `${kpis.attendance_rate_today}%` : "—",
            icon: ClipboardCheck,
          },
          {
            label: "المعلمون النشطون",
            value: kpis?.active_teachers ?? "—",
            icon: GraduationCap,
          },
          {
            label: "المشرفون النشطون",
            value: kpis?.active_supervisors ?? "—",
            icon: Users,
          },
          {
            label: "موظفون حاضرون اليوم",
            value: kpis?.staff_present_today ?? "—",
            icon: BookOpen,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className={ds.card}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2" style={tajawal}>
                  <Icon className="w-4 h-4 text-primary" />
                  {kpi.label}
                </CardDescription>
                <CardTitle className="text-3xl text-foreground" style={tajawal}>
                  {loading ? "…" : kpi.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground" style={tajawal}>
                {PERIOD_LABELS[period]}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "ملخص"],
            ["students", "الطلاب والحضور"],
            ["staff", "الطاقم"],
            ["programs", "البرامج والاختبارات"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={reportTab === key ? "default" : "outline"}
            className={ds.btnRound}
            onClick={() => setReportTab(key)}
            style={tajawal}
          >
            {label}
          </Button>
        ))}
      </div>

      {reportTab === "overview" && stats && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>التحضير الذكي — اليوم</CardTitle>
            <CardDescription style={tajawal}>
              آخر الطلاب الذين سُجّل لهم رصد = حضور تلقائي
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الطالب</TableHead>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>وقت الرصد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.auto_attendance_today.map((r, i) => (
                  <TableRow key={i}>
                    <TableTruncatedCell style={tajawal}>{r.full_name_ar}</TableTruncatedCell>
                    <TableTruncatedCell style={tajawal}>{r.circle_name ?? "—"}</TableTruncatedCell>
                    <TableCell style={tajawal}>{r.logged_at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {reportTab === "students" && stats && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>الحضور حسب الحلقة — اليوم</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>مسجّلون</TableHead>
                  <TableHead style={tajawal}>حاضرون اليوم</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.by_circle.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell style={tajawal}>{c.name_ar}</TableCell>
                    <TableCell style={tajawal}>{c.enrolled}</TableCell>
                    <TableCell style={tajawal}>{c.present_today}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {reportTab === "staff" && <StaffAttendancePanel staff={staffList} />}

      {reportTab === "programs" && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle className="text-base" style={tajawal}>
              البرامج والاختبارات
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground" style={tajawal}>
            <p className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              التفاصيل التشغيلية في hub إدارة البرامج — ملخص المدير يعرض KPIs
              عامة أعلاه.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
