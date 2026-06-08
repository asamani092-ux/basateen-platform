import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function CompetitionDetailPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsDetail(id);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const comp = data?.competition as Record<string, unknown> | undefined;
  const plans = (data?.plans as Array<Record<string, unknown>>) ?? [];
  const logs = (data?.logs as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
        <Link to="/edu-dept/competitions">← المنافسات</Link>
      </Button>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {comp && (
        <>
          <div>
            <h2 className={ds.page.title} style={tajawal}>
              {String(comp.name_ar)}
            </h2>
            <p className={ds.page.description} style={tajawal}>
              {String(comp.start_date)} → {String(comp.end_date)} ·{" "}
              {String(comp.telemetry_type) === "extended_recitation"
                ? "سرد ممتد"
                : "برنامج مكثف"}{" "}
              · {String(comp.status)}
            </p>
          </div>

          {String(comp.telemetry_type) === "extended_recitation" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>توزيع السرد اليومي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm" style={tajawal}>
                {plans.length === 0 ? (
                  <p className="text-muted-foreground">لا خطط طلاب بعد.</p>
                ) : (
                  plans.map((p) => {
                    let dist: Record<string, number> = {};
                    try {
                      dist = JSON.parse(String(p.distributed_json ?? "{}"));
                    } catch {
                      dist = {};
                    }
                    return (
                      <div key={String(p.student_id)} className="border-b py-2">
                        <p className="font-semibold">{String(p.full_name_ar)}</p>
                        <p className="text-xs text-muted-foreground">
                          هدف: {String(p.total_target_juz)} جزء · يومي:{" "}
                          {String(p.daily_volume_juz)} جزء
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.entries(dist).map(([d, v]) => (
                            <span
                              key={d}
                              className="text-xs bg-muted px-2 py-0.5 rounded"
                            >
                              {d}: {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}

          {String(comp.telemetry_type) === "intensive_routine" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>رصد البرنامج المكثف (معزول عن رصد المعلم)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm" style={tajawal}>
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">لا سجلات رصد بعد.</p>
                ) : (
                  logs.map((row) => {
                    let metrics: Record<string, unknown> = {};
                    try {
                      metrics = JSON.parse(String(row.metrics_json ?? "{}"));
                    } catch {
                      metrics = {};
                    }
                    return (
                      <div
                        key={`${row.student_id}-${row.log_date}`}
                        className="flex flex-wrap justify-between gap-2 border-b py-2"
                      >
                        <span className="font-semibold">{String(row.full_name_ar)}</span>
                        <span className="text-muted-foreground">
                          {String(row.log_date)} · {String(row.source)}
                        </span>
                        <span className="w-full text-xs">
                          حفظ: {String(metrics.hifz_pages ?? "—")} · مراجعة:{" "}
                          {String(metrics.muraja_pages ?? "—")} · سماع:{" "}
                          {metrics.sama_done ? "نعم" : "لا"}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
