import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

export function YomHimmaSummaryCard() {
  const [items, setItems] = useState<
    Array<{
      session: { id: number; name_ar: string; session_date: string; status: string };
      stats: { total: number; present: number; juz_total: number; hizb_total: number };
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getApiToken()) {
      setError("سجّل الدخول بربط API لعرض جلسات يوم الهمة");
      return;
    }
    api
      .adminYomHimmaSummary()
      .then((res) => {
        setItems(res.items);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "تعذّر تحميل يوم الهمة"),
      );
  }, []);

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
          <Sparkles className="w-5 h-5 text-primary" />
          يوم الهمة — ملخص للمدير
        </CardTitle>
        <CardDescription style={tajawal}>
          اطلاع فقط — التشغيل الميداني للمشرف العام والمشرف التعليمي
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm" style={tajawal}>
        {error && <p className="text-destructive">{error}</p>}
        {!error && items.length === 0 && (
          <p className="text-muted-foreground">لا توجد جلسات مسجّلة بعد.</p>
        )}
        {items.map(({ session: s, stats }) => (
          <div
            key={s.id}
            className="rounded-xl border border-border px-3 py-2 space-y-1"
          >
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{s.name_ar}</span>
              <span className="text-muted-foreground text-xs">
                {s.session_date} · {s.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              مستهدفون: {stats.total} · حاضرون: {stats.present} · أجزاء:{" "}
              {stats.juz_total} · أحزاب: {stats.hizb_total}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
