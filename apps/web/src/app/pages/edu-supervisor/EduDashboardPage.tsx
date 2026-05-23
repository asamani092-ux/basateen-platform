import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type Dashboard = {
  scope_label: string;
  kpis: {
    pending_placement: number;
    active_students: number;
    active_competitions: number;
    teacher_marks_today: number;
  };
  active_himma: { id: number; name_ar: string } | null;
};

export function EduDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.eduDashboard();
      setData(res as Dashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="انتظار التسكين" value={k?.pending_placement ?? "—"} />
        <KpiCard label="طلاب نشطون" value={k?.active_students ?? "—"} />
        <KpiCard label="منافسات نشطة" value={k?.active_competitions ?? "—"} />
        <KpiCard label="رصد معلم اليوم" value={k?.teacher_marks_today ?? "—"} />
      </div>

      {data?.active_himma && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>يوم الهمة النشط</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <p style={tajawal}>{data.active_himma.name_ar}</p>
            <Button asChild className={ds.btnRound} style={tajawal}>
              <Link to="/edu-supervisor/yom-himma">فتح الجلسة</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
          <Link to="/edu-supervisor/placement">التسكين</Link>
        </Button>
        <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
          <Link to="/edu-supervisor/students">الطلاب</Link>
        </Button>
        <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
          <Link to="/edu-supervisor/competitions">المنافسات</Link>
        </Button>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className={ds.card}>
      <CardContent className="pt-6">
        <p className="text-2xl font-bold text-primary" style={tajawal}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
          {label}
        </p>
      </CardContent>
    </Card>
  );
}
