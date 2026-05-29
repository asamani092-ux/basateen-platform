import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Users, UserX, UserCheck } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function AdminReportsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffTotal, setStaffTotal] = useState(0);
  const [staffPresent, setStaffPresent] = useState(0);
  const [absentStudents, setAbsentStudents] = useState(0);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [staffRes, absentRes] = await Promise.all([
        api.adminDeptStaff(date),
        api.adminDeptAbsentToday({ date }),
      ]);
      const staff = staffRes.items ?? [];
      setStaffTotal(staff.length);
      setStaffPresent(
        staff.filter((s) => (s.status ?? "present") === "present").length,
      );
      setAbsentStudents(absentRes.items?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المؤشرات");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const staffAbsent = useMemo(
    () => Math.max(0, staffTotal - staffPresent),
    [staffTotal, staffPresent],
  );

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4 max-w-[1000px]">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            المؤشرات والتقارير
          </h2>
          <p className={ds.page.description} style={tajawal}>
            ملخص يومي للقسم الإداري — تصدير PDF عبر الطباعة.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`border border-border px-3 py-2 ${ds.btnRound}`}
          />
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
            تصدير PDF
          </Button>
        </div>
      </div>

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {error}
        </p>
      )}

      <div id="admin-reports-print" className="space-y-4">
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold" style={tajawal}>
            تقرير القسم الإداري — مجمع البساتين
          </h1>
          <p className="text-muted-foreground" style={tajawal}>
            تاريخ: {date}
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground print:hidden" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              icon={<Users className="w-5 h-5 text-primary" />}
              label="منسوبون (مسجلون)"
              value={staffTotal}
            />
            <KpiCard
              icon={<UserCheck className="w-5 h-5 text-primary" />}
              label="منسوبون حاضرون"
              value={staffPresent}
              sub={`غائب/معتذر: ${staffAbsent}`}
            />
            <KpiCard
              icon={<UserX className="w-5 h-5 text-destructive" />}
              label="طلاب غائبون / مستأذنون"
              value={absentStudents}
            />
          </div>
        )}

        <p className={`text-sm ${ds.alert.info} print:mt-8`} style={tajawal}>
          يُحسب الحضور من سجلات التحضير المحفوظة لذلك اليوم. للتفاصيل استخدم صفحات
          تحضير المنسوبين والطلاب وواتساب الغياب.
        </p>
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
