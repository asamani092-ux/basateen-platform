import { useEffect, useState } from "react";
import { Award, GraduationCap, Percent, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { buildTvLaunchUrl } from "../../lib/tv-launch";
import { ds, tajawal } from "../../lib/design-system";

export function SupervisorDashboardTab() {
  const [kpis, setKpis] = useState<{
    active_students: number;
    present_today: number;
    attendance_rate_today: number;
    graduates_count: number;
    huffadh_count: number;
    pending_applications: number;
    pending_placement: number;
  } | null>(null);
  const [tvKey, setTvKey] = useState<string | null>(null);

  useEffect(() => {
    if (!getApiToken()) return;
    api.gsDashboard().then((r) => setKpis(r.kpis));
    api.gsTvLaunch().then((r) => {
      if (r.session?.tv_launch_key) setTvKey(r.session.tv_launch_key);
    });
  }, []);

  function launchTv() {
    const url = tvKey ? buildTvLaunchUrl(tvKey) : "/tv-live";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Users className="w-5 h-5 text-primary" />}
          label="طلاب نشطون"
          value={kpis?.active_students ?? "—"}
        />
        <Kpi
          icon={<Percent className="w-5 h-5 text-primary" />}
          label="حضور اليوم (لايف)"
          value={
            kpis != null
              ? `${kpis.present_today} (${kpis.attendance_rate_today}%)`
              : "—"
          }
        />
        <Kpi
          icon={<GraduationCap className="w-5 h-5 text-primary" />}
          label="خريجون"
          value={kpis?.graduates_count ?? "—"}
        />
        <Kpi
          icon={<Award className="w-5 h-5 text-primary" />}
          label="حفاظ"
          value={kpis?.huffadh_count ?? "—"}
        />
      </div>

      <p className={ds.alert.info} style={tajawal}>
        طلبات معلّقة: {kpis?.pending_applications ?? 0} — بانتظار التسكين:{" "}
        {kpis?.pending_placement ?? 0}
      </p>

      <Button
        type="button"
        size="lg"
        className={`w-full sm:w-auto text-base px-8 py-6 ${ds.btnRound}`}
        onClick={launchTv}
        style={tajawal}
      >
        إطلاق شاشة التلفاز الحية لليوم القرآني
      </Button>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <Card className={ds.card}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2" style={tajawal}>
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-primary" style={tajawal}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
