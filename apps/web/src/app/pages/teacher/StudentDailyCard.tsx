import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CloudOff, Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { CounterField } from "../../components/teacher/CounterField";
import { YesNoToggle } from "../../components/teacher/YesNoToggle";
import type { StudentRow } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";
import {
  applyRabtFromPlan,
  emptyDailyMetrics,
  hasAnyActivity,
  scoreFromMetrics,
  type DailyMetrics,
} from "../../lib/teacher/daily-metrics";

export type StudentPlanBrief = {
  id: number;
  daily_rabt_faces: number;
} | null;

export type SavedMark = {
  metrics: DailyMetrics | null;
  score: number | null;
  updated_at?: string;
};

type Props = {
  student: StudentRow;
  plan: StudentPlanBrief;
  saved?: SavedMark;
  saving: boolean;
  onSave: (metrics: DailyMetrics) => void;
};

export function StudentDailyCard({
  student,
  plan,
  saved,
  saving,
  onSave,
}: Props) {
  const rabtFaces = plan?.daily_rabt_faces ?? 0;
  const [metrics, setMetrics] = useState<DailyMetrics>(
    () => saved?.metrics ?? emptyDailyMetrics(),
  );

  useEffect(() => {
    setMetrics(saved?.metrics ?? emptyDailyMetrics());
  }, [saved, student.id]);

  const displayMetrics = useMemo(
    () => applyRabtFromPlan(metrics, rabtFaces),
    [metrics, rabtFaces],
  );

  const score = scoreFromMetrics(displayMetrics);
  const done = Boolean(saved?.metrics && hasAnyActivity(saved.metrics));

  function patch(partial: Partial<DailyMetrics>) {
    setMetrics((prev) => {
      const next = { ...prev, ...partial };
      if (partial.rabt) {
        next.rabt = applyRabtFromPlan(
          { ...prev, rabt: { ...prev.rabt, ...partial.rabt } },
          rabtFaces,
        ).rabt;
      }
      return next;
    });
  }

  return (
    <Card className={ds.card}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base" style={tajawal}>
              {student.full_name_ar}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
              {student.circle_name ?? "—"}
              {done && (
                <span className="inline-flex items-center gap-1 text-success-foreground mr-2">
                  <CheckCircle2 className="size-3.5" />
                  حاضر + مرصود
                </span>
              )}
            </p>
          </div>
          <span className="text-xs font-semibold text-primary tabular-nums">
            {score}/10
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-semibold text-muted-foreground" style={tajawal}>
            الحفظ الجديد
          </p>
          <YesNoToggle
            label="هل سمع؟"
            value={metrics.hifz.heard}
            onChange={(v) => patch({ hifz: { ...metrics.hifz, heard: v } })}
          />
          <YesNoToggle
            label="هل كرّر؟"
            value={metrics.hifz.repeated}
            onChange={(v) => patch({ hifz: { ...metrics.hifz, repeated: v } })}
          />
          <CounterField
            label="أخطاء / لحون"
            value={metrics.hifz.errors}
            onChange={(v) => patch({ hifz: { ...metrics.hifz, errors: v } })}
          />
          <CounterField
            label="تنبيهات"
            value={metrics.hifz.alerts}
            onChange={(v) => patch({ hifz: { ...metrics.hifz, alerts: v } })}
          />
        </div>

        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-semibold text-muted-foreground" style={tajawal}>
            مراجعة المحفوظ
          </p>
          <YesNoToggle
            label="هل قرأ المراجعة؟"
            value={metrics.muraja.read}
            onChange={(v) => patch({ muraja: { ...metrics.muraja, read: v } })}
          />
          <CounterField
            label="أخطاء (مراجعة)"
            value={metrics.muraja.errors}
            onChange={(v) => patch({ muraja: { ...metrics.muraja, errors: v } })}
          />
          <CounterField
            label="تنبيهات (مراجعة)"
            value={metrics.muraja.alerts}
            onChange={(v) => patch({ muraja: { ...metrics.muraja, alerts: v } })}
          />
        </div>

        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-semibold text-muted-foreground" style={tajawal}>
            الربط
          </p>
          <YesNoToggle
            label="هل قرأ الربط؟"
            value={metrics.rabt.read}
            onChange={(v) =>
              patch({
                rabt: {
                  read: v,
                  faces_done: v ? rabtFaces : 0,
                },
              })
            }
          />
          {metrics.rabt.read && rabtFaces > 0 && (
            <p className="text-xs text-success-foreground" style={tajawal}>
              يُحتسب تلقائياً: {rabtFaces} وجه من الخطة
            </p>
          )}
        </div>

        <Button
          type="button"
          className={`w-full ${ds.btnRound}`}
          disabled={saving || !hasAnyActivity(displayMetrics)}
          onClick={() => onSave(displayMetrics)}
          style={tajawal}
        >
          <Save className="size-4" />
          {saving ? "جاري الحفظ…" : done ? "تحديث الرصد" : "حفظ الرصد + حضور"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function OfflineBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      style={tajawal}
    >
      <CloudOff className="size-4 shrink-0" />
      <span>
        {count} رصد محفوظ محلياً — سيتم المزامنة عند عودة الاتصال
      </span>
    </div>
  );
}
