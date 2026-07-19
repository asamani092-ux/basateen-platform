import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { api } from "../../lib/api-client";
import { todayRiyadhIso } from "../../lib/today-riyadh-iso";
import { ds, tajawal } from "../../lib/design-system";
import { cn } from "../../components/ui/utils";

type DayRow = { day_date: string; completed: number };

type Props = {
  planId: number;
  startsAt?: string | null;
  endsAt?: string | null;
  restDays?: string | null;
  onSaved: () => void;
};

type RestDaysSetting = "friday" | "saturday" | "friday_saturday";

type WeekGroup = {
  weekIndex: number;
  dates: string[];
};

function parseRestDays(raw: unknown): RestDaysSetting {
  const v = String(raw ?? "").trim();
  if (v === "friday" || v === "saturday" || v === "friday_saturday") return v;
  return "friday_saturday";
}

function isRestDay(iso: string, restDays: RestDaysSetting): boolean {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (restDays === "friday") return wd === 5;
  if (restDays === "saturday") return wd === 6;
  return wd === 5 || wd === 6;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffCalendarDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

function weekIndexFromStart(startsAt: string, dayDate: string): number {
  return Math.floor(diffCalendarDays(startsAt, dayDate) / 7) + 1;
}

/** O(D) — D=أيام العمل؛ متابعة أسبوعية داخل حوار */
function listWorkingDayDates(
  startsAt: string,
  endsAt: string,
  restDays: RestDaysSetting,
): string[] {
  const out: string[] = [];
  let cursor = startsAt;
  while (cursor <= endsAt) {
    if (!isRestDay(cursor, restDays)) out.push(cursor);
    if (cursor === endsAt) break;
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

function groupByWeek(startsAt: string, dates: string[]): WeekGroup[] {
  const map = new Map<number, string[]>();
  for (const d of dates) {
    const w = weekIndexFromStart(startsAt, d);
    const list = map.get(w) ?? [];
    list.push(d);
    map.set(w, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekIndex, weekDates]) => ({ weekIndex, dates: weekDates }));
}

function formatArNumber(n: number): string {
  return new Intl.NumberFormat("ar-SA").format(n);
}

function dayLabel(iso: string): string {
  return iso.slice(8, 10);
}

/** O(D) — شبكة متابعة يومية مجمّعة بالأسبوع (أيام العمل فقط) */
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
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);

  const start = String(startsAt ?? "").slice(0, 10);
  const end = String(endsAt ?? "").slice(0, 10);
  const rest = parseRestDays(restDays);
  const today = todayRiyadhIso();

  const completedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of days) m.set(d.day_date, Number(d.completed) === 1);
    return m;
  }, [days]);

  const weekGroups = useMemo(() => {
    if (!start || !end) return [];
    const working = listWorkingDayDates(start, end, rest);
    return groupByWeek(start, working);
  }, [start, end, rest]);

  const currentWeekIndex = useMemo(() => {
    if (!start || !today || today < start) return 1;
    if (today > end) return weekGroups[weekGroups.length - 1]?.weekIndex ?? 1;
    return weekIndexFromStart(start, today);
  }, [start, today, end, weekGroups]);

  useEffect(() => {
    if (weekGroups.length === 0) return;
    setOpenWeeks([String(currentWeekIndex)]);
  }, [currentWeekIndex, weekGroups.length, planId]);

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
    <div className="space-y-3 overflow-x-hidden">
      {loading ? (
        <p className="text-xs text-muted-foreground" style={tajawal}>
          جاري تحميل الأيام…
        </p>
      ) : (
        <Accordion
          type="multiple"
          value={openWeeks}
          onValueChange={setOpenWeeks}
          className="space-y-2"
        >
          {weekGroups.map((group) => {
            const doneInWeek = group.dates.filter(
              (d) => completedMap.get(d) === true,
            ).length;
            const totalInWeek = group.dates.length;
            const isCurrent = group.weekIndex === currentWeekIndex;
            return (
              <AccordionItem
                key={group.weekIndex}
                value={String(group.weekIndex)}
                className={cn(
                  ds.card,
                  "overflow-hidden border",
                  isCurrent ? "border-primary/30" : "border-border/70",
                )}
              >
                <AccordionTrigger
                  className="px-3 py-2.5 hover:no-underline text-right [&>svg]:mr-auto [&>svg]:ml-0 min-h-11"
                  style={tajawal}
                >
                  <span className="flex-1 text-sm font-semibold">
                    {isCurrent ? (
                      <>
                        الأسبوع {formatArNumber(group.weekIndex)} (الحالي) —{" "}
                        {formatArNumber(doneInWeek)} من {formatArNumber(totalInWeek)}
                      </>
                    ) : (
                      <>
                        الأسبوع {formatArNumber(group.weekIndex)} —{" "}
                        {formatArNumber(doneInWeek)} من {formatArNumber(totalInWeek)}
                      </>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3 pt-0 overflow-x-hidden">
                  <div
                    className="grid grid-cols-5 gap-2 max-w-full"
                    role="group"
                    aria-label={`أسبوع ${group.weekIndex}`}
                  >
                    {group.dates.map((dayDate) => {
                      const done = completedMap.get(dayDate) === true;
                      return (
                        <button
                          key={dayDate}
                          type="button"
                          title={`${dayDate} — ${done ? "منجَز" : "غير منجَز"}`}
                          disabled={saving}
                          onClick={() => void toggleDay(dayDate)}
                          className={cn(
                            ds.btnRound,
                            "flex min-h-11 w-full min-w-0 touch-manipulation flex-col items-center justify-center border text-xs font-semibold transition-colors",
                            done
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:border-primary/40",
                          )}
                          style={tajawal}
                        >
                          <span>{dayLabel(dayDate)}</span>
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <p className="text-xs text-muted-foreground" style={tajawal}>
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
