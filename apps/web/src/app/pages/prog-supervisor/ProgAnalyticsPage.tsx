import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function ProgAnalyticsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.progAnalytics>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.progAnalytics();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <p className="text-sm text-muted-foreground" style={tajawal}>
        {data?.scope_label} — إحصائيات معزولة عن الرصد القرآني اليومي
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "اختبارات منشورة", value: kpis?.published_quizzes },
          { label: "محاولات مُسلّمة", value: kpis?.quiz_attempts_submitted },
          { label: "متوسط الدرجات %", value: kpis?.average_quiz_score },
        ].map((k) => (
          <Card key={k.label} className={ds.card}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{k.value ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
                {k.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>أكثر الطلاب تفاعلاً (اختبارات)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.top_students ?? []).length === 0 ? (
              <p className="text-muted-foreground">لا بيانات بعد.</p>
            ) : (
              (data?.top_students ?? []).map((row) => (
                <div
                  key={String(row.id)}
                  className="flex justify-between border-b py-1"
                  style={tajawal}
                >
                  <span>{String(row.full_name_ar)}</span>
                  <span className="text-muted-foreground">
                    {Math.round(Number(row.avg_score ?? 0) * 10) / 10}% ·{" "}
                    {String(row.quiz_count)} اختبار
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>متوسط درجات الحلقات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.circle_quiz_averages ?? []).map((row) => (
              <div
                key={String(row.id)}
                className="flex justify-between border-b py-1"
                style={tajawal}
              >
                <span>{String(row.name_ar)}</span>
                <span className="text-muted-foreground">
                  {Math.round(Number(row.avg_score ?? 0) * 10) / 10}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={`${ds.card} lg:col-span-2`}>
          <CardHeader>
            <CardTitle style={tajawal}>أكثر الحلقات مشاركة في الأنشطة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.top_circles_participation ?? []).map((row) => (
              <div
                key={String(row.id)}
                className="flex justify-between border-b py-1"
                style={tajawal}
              >
                <span>{String(row.name_ar)}</span>
                <span className="text-muted-foreground">
                  {String(row.participants)} طالب · {String(row.participation_events)}{" "}
                  تسجيل
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
