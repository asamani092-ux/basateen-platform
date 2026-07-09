import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

type DayRow = { day_date: string; completed: number };

type Props = {
  planId: number;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  totalWorkingDays?: number;
  completedDays?: number;
};

/** O(D) — D=أيام العمل في الخطة */
export function PlanDaysDialog({
  planId,
  studentName,
  open,
  onOpenChange,
  onSaved,
  totalWorkingDays = 0,
  completedDays = 0,
}: Props) {
  const [days, setDays] = useState<DayRow[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [restDays, setRestDays] = useState<"friday" | "saturday" | "friday_saturday">(
    "friday_saturday",
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of days) m.set(d.day_date, Number(d.completed) === 1);
    return m;
  }, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.teacherPlanDaysGet(planId);
      setDays(res.days as DayRow[]);
      setStartsAt(String(res.starts_at ?? ""));
      setEndsAt(String(res.ends_at ?? ""));
      setRestDays(
        (res.rest_days as "friday" | "saturday" | "friday_saturday") ??
          "friday_saturday",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الأيام");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function toggleDay(dayDate: string, completed: boolean) {
    setSaving(true);
    setError(null);
    try {
      await api.teacherPlanDaysUpsert(planId, {
        days: [{ day_date: dayDate, completed }],
      });
      setDays((prev) => {
        const idx = prev.findIndex((d) => d.day_date === dayDate);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], completed: completed ? 1 : 0 };
          return next;
        }
        return [...prev, { day_date: dayDate, completed: completed ? 1 : 0 }];
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const workingDates = useMemo(() => {
    if (!startsAt || !endsAt) return [];
    const rest = new Set<number>(
      restDays === "friday"
        ? [5]
        : restDays === "saturday"
          ? [6]
          : [5, 6],
    );
    const out: string[] = [];
    let cursor = startsAt;
    while (cursor <= endsAt) {
      const wd = new Date(`${cursor}T12:00:00Z`).getUTCDay();
      if (!rest.has(wd)) out.push(cursor);
      if (cursor === endsAt) break;
      const [y, m, d] = cursor.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + 1);
      cursor = dt.toISOString().slice(0, 10);
    }
    return out;
  }, [startsAt, endsAt, restDays]);

  const total = totalWorkingDays || workingDates.length;
  const done = completedDays || days.filter((d) => Number(d.completed) === 1).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={tajawal}>متابعة يومية — {studentName}</DialogTitle>
          <DialogDescription style={tajawal}>
            سجّل لكل يوم عمل: هل أنجز الطالب المقدار اليومي؟ اليوم بلا سجل = غير منجَز.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs" style={tajawal}>
              <span>
                {done} من {total} يوماً
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {workingDates.map((dayDate) => {
                const ok = completedMap.get(dayDate) === true;
                return (
                  <li
                    key={dayDate}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs"
                  >
                    <span style={tajawal}>{dayDate}</span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={ok ? "default" : "outline"}
                        className={`${ds.btnRound} h-7 px-2 text-xs`}
                        disabled={saving}
                        onClick={() => void toggleDay(dayDate, true)}
                        style={tajawal}
                      >
                        منجَز
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!ok ? "default" : "outline"}
                        className={`${ds.btnRound} h-7 px-2 text-xs`}
                        disabled={saving}
                        onClick={() => void toggleDay(dayDate, false)}
                        style={tajawal}
                      >
                        غير منجَز
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="text-sm text-destructive" style={tajawal}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => onOpenChange(false)}
            style={tajawal}
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
