import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Users, GraduationCap } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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

export function AdminReportsPage() {
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [customStart, setCustomStart] = useState(() => isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => isoDate(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    staff_total: 0,
    staff_present: 0,
    staff_present_pct: 0,
    students_total: 0,
    students_present: 0,
    students_present_pct: 0,
  });
  const [items, setItems] = useState<
    Array<{ name: string; date: string; status: string; type: "staff" | "student" }>
  >([]);

  const { startDate, endDate } = useMemo(() => {
    if (preset === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    return rangeForPreset(preset);
  }, [preset, customStart, customEnd]);

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
      setSummary(res.summary);
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

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="print:hidden flex flex-col gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            المؤشرات والتقارير
          </h2>
          <p className={ds.page.description} style={tajawal}>
            ملخص التحضير مع جدول تفصيلي — تصدير PDF عبر الطباعة.
          </p>
        </div>

        <div className={`${ds.card} p-4 space-y-4`}>
          <div>
            <p className="text-sm font-semibold mb-2" style={tajawal}>
              الفترة
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["last3", "آخر 3 أيام"],
                  ["last7", "آخر أسبوع"],
                  ["month", "هذا الشهر"],
                  ["custom", "مخصص"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={preset === id ? "default" : "outline"}
                  className={ds.btnRound}
                  onClick={() => setPreset(id)}
                  style={tajawal}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground block mb-1" style={tajawal}>
                  من
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className={`border border-border px-3 py-2 ${ds.btnRound}`}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1" style={tajawal}>
                  إلى
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className={`border border-border px-3 py-2 ${ds.btnRound}`}
                />
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold mb-2" style={tajawal}>
              الحالة
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setStatusFilter("all")}
                style={tajawal}
              >
                الجميع
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "absent_only" ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setStatusFilter("absent_only")}
                style={tajawal}
              >
                الغائبون فقط
              </Button>
            </div>
          </div>

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
        </div>
      </div>

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
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
          <p className="text-muted-foreground print:hidden" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<Users className="w-5 h-5 text-primary" />}
              label="عدد المنسوبين الكلي"
              value={summary.staff_total}
            />
            <KpiCard
              icon={<Users className="w-5 h-5 text-primary" />}
              label="تحضير المنسوبين"
              value={summary.staff_present}
              sub={`${summary.staff_present_pct}% من المسجلين`}
            />
            <KpiCard
              icon={<GraduationCap className="w-5 h-5 text-primary" />}
              label="عدد الطلاب الكلي"
              value={summary.students_total}
            />
            <KpiCard
              icon={<GraduationCap className="w-5 h-5 text-primary" />}
              label="تحضير الطلاب"
              value={summary.students_present}
              sub={`${summary.students_present_pct}% من المسجلين (آخر يوم)`}
            />
          </div>
        )}

        <div className={`${ds.card} overflow-hidden`}>
          <div className="p-4 border-b border-border print:border-0">
            <h3 className={ds.page.section} style={tajawal}>
              التقرير التفصيلي
            </h3>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground" style={tajawal}>
              لا توجد سجلات مطابقة للفلاتر.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الاسم</TableHead>
                  <TableHead style={tajawal}>التاريخ</TableHead>
                  <TableHead style={tajawal}>الحالة</TableHead>
                  <TableHead style={tajawal}>النوع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row, i) => (
                  <TableRow key={`${row.type}-${row.date}-${row.name}-${i}`}>
                    <TableCell className="font-medium" style={tajawal}>
                      {row.name}
                    </TableCell>
                    <TableCell style={tajawal}>{row.date}</TableCell>
                    <TableCell style={tajawal}>
                      {STATUS_AR[row.status] ?? row.status}
                    </TableCell>
                    <TableCell style={tajawal}>
                      {row.type === "staff" ? "منسوب" : "طالب"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #admin-reports-print, #admin-reports-print * { visibility: visible; }
          #admin-reports-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card className={ds.card}>
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
          <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
