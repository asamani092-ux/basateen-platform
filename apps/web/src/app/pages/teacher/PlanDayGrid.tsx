import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

type DayRow = { day_date: string; completed: number };

type CalendarCell = {
  day_date: string;
  isRest: boolean;
  dayLabel: string;
};

type Props = {
  planId: number;
  startsAt?: string | null;
  endsAt?: string | null;
  restDays?: string | null;
  onSaved: () => void;
};

function restWeekdays(restDays: string): Set<number> {
  if (restDays === "friday") return new Set([5]);
  if (restDays === "saturday") return new Set([6]);
  return new Set([5, 6]);
}

function buildCalendarCells(
  startsAt: string,
  endsAt: string,
  restDays: string,
): CalendarCell[] {
  const rest = restWeekdays(restDays);
  const out: CalendarCell[] = [];
  let cursor = startsAt;
  while (cursor <= endsAt) {
    const wd = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    const [, , d] = cursor.split("-");
    out.push({
      day_date: cursor,
      isRest: rest.has(wd),
      dayLabel: d,
    });
    if (cursor === endsAt) break;
    const [y, m, day] = cursor.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day));
    dt.setUTCDate(dt.getUTCDate() + 1);
    cursor = dt.toISOString().slice(0, 10);
  }
  return out;
}

/** O(D) — D=أيام المدى؛ شبكة يومية مضمّنة */
export function PlanDayGrid({
  planId,
  startsAt,
  endsAt,
  restDays = "friday_saturday",
  onSaved,
}: Props) {
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = String(startsAt ?? "").slice(0, 10);
  const end = String(endsAt ?? "").slice(0, 10);
  const rest = String(restDays ?? "friday_saturday");

  const completedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of days) m.set(d.day_date, Number(d.completed) === 1);
    return m;
  }, [days]);

  const cells = useMemo(() => {
    if (!start || !end) return [];
    return buildCalendarCells(start, end, rest);
  }, [start, end, rest]);

  const workingCells = useMemo(() => cells.filter((c) => !c.isRest), [cells]);
  const doneCount = useMemo(
    () => workingCells.filter((c) => completedMap.get(c.day_date) === true).length,
    [workingCells, completedMap],
  );
  const totalWorking = workingCells.length;
  const pct = totalWorking > 0 ? Math.round((doneCount / totalWorking) * 100) : 0;

  const load = useCallback(async () => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.teacherPlanDaysGet(planId);
      setDays(res.days as DayRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الأيام");
    } finally {
      setLoading(false);
    }
  }, [planId, start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDay(dayDate: string) {
    const wasDone = completedMap.get(dayDate) === true;
    const next = !wasDone;
    setSaving(true);
    setError(null);
    try {
      await api.teacherPlanDaysUpsert(planId, {
        days: [{ day_date: dayDate, completed: next }],
      });
      setDays((prev) => {
        const idx = prev.findIndex((d) => d.day_date === dayDate);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], completed: next ? 1 : 0 };
          return copy;
        }
        return [...prev, { day_date: dayDate, completed: next ? 1 : 0 }];
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (!start || !end) return null;

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground" style={tajawal}>
          <span>
            {doneCount} من {totalWorking} يوماً
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
        <p className="text-xs text-muted-foreground" style={tajawal}>
          جاري تحميل الأيام…
        </p>
      ) : (
        <div
          className="grid grid-cols-7 gap-1.5"
          role="group"
          aria-label="متابعة يومية"
        >
          {cells.map((cell) => {
            if (cell.isRest) {
              return (
                <div
                  key={cell.day_date}
                  title={`${cell.day_date} — عطلة`}
                  className={`${ds.btnRound} flex min-h-11 min-w-0 items-center justify-center border border-dashed border-border/70 bg-muted/50 text-xs text-muted-foreground`}
                  style={tajawal}
                >
                  {cell.dayLabel}
                </div>
              );
            }
            const done = completedMap.get(cell.day_date) === true;
            return (
              <button
                key={cell.day_date}
                type="button"
                title={`${cell.day_date} — ${done ? "منجَز" : "غير منجَز"}`}
                disabled={saving}
                onClick={() => void toggleDay(cell.day_date)}
                className={`${ds.btnRound} flex min-h-11 min-w-0 touch-manipulation items-center justify-center border text-xs font-semibold transition-colors ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
                style={tajawal}
              >
                {cell.dayLabel}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground" style={tajawal}>
        اضغط يوماً لتحويله بين منجَز وغير منجَز. اليوم بلا سجل = غير منجَز.
      </p>

      {error && (
        <p className="text-xs text-destructive" style={tajawal}>
          {error}
        </p>
      )}
    </div>
  );
}
