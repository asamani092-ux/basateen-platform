import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CounterField } from "../../components/teacher/CounterField";
import { DatePickerField } from "../../components/teacher/DatePickerField";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { api, type EduMatrixEntryGridResponse } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type RowState = NonNullable<EduMatrixEntryGridResponse["items"][0]["log"]> & {
  has_memorized: number;
  has_repeated: number;
  has_reviewed: number;
  has_linked: number;
};

function defaultLog(): RowState {
  return {
    id: 0,
    has_memorized: 0,
    has_repeated: 0,
    has_reviewed: 0,
    has_linked: 0,
    memorization_errors: 0,
    memorization_warnings: 0,
    review_errors: 0,
  };
}

export function DailyScorecardGrid() {
  const [date, setDate] = useState(todayIso);
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<EduMatrixEntryGridResponse | null>(null);
  const [draft, setDraft] = useState<Record<number, RowState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.eduMatrixEntryGrid({ date });
      setGrid(data);
      const next: Record<number, RowState> = {};
      for (const row of data.items) {
        next[row.id] = row.log ? { ...row.log } : defaultLog();
      }
      setDraft(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الشبكة");
      setGrid(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRow(studentId: number) {
    const log = draft[studentId] ?? defaultLog();
    setSavingId(studentId);
    try {
      await api.eduMatrixUpsertLog({
        student_id: studentId,
        date,
        has_memorized: log.has_memorized,
        has_repeated: log.has_repeated,
        has_reviewed: log.has_reviewed,
        has_linked: log.has_linked,
        memorization_errors: log.memorization_errors,
        memorization_warnings: log.memorization_warnings,
        review_errors: log.review_errors,
      });
      toast.success("تم الحفظ");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSavingId(null);
    }
  }

  function patchRow(studentId: number, patch: Partial<RowState>) {
    setDraft((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? defaultLog()), ...patch },
    }));
  }

  if (loading && !grid) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-2xl p-3 space-y-2">
        <p className="text-xs text-muted-foreground" style={tajawal}>
          {grid?.context.role_label ?? "—"} — أي رصد = حضور تلقائي
        </p>
        <DatePickerField value={date} onChange={setDate} maxDate={todayIso()} />
      </div>

      {!grid?.items.length ? (
        <p className="text-center text-muted-foreground py-8" style={tajawal}>
          لا يوجد طلاب في هذه الشبكة. شغّل ترحيل 022 ثم seed-edu-matrix.
        </p>
      ) : (
        <div className="space-y-3">
          {grid.items.map((row) => {
            const log = draft[row.id] ?? defaultLog();
            const busy = savingId === row.id;
            return (
              <article
                key={row.id}
                className="border border-border rounded-2xl p-3 space-y-3 bg-card shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm" style={tajawal}>
                      {row.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {row.academic_grade} — {row.national_id}
                    </p>
                  </div>
                  {row.attendance_status === "present" && (
                    <span className="text-xs text-emerald-600 font-medium">
                      حاضر
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["has_memorized", "سمع"],
                      ["has_repeated", "تكرار"],
                      ["has_reviewed", "مراجعة"],
                      ["has_linked", "ربط"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-2 text-sm"
                      style={tajawal}
                    >
                      {label}
                      <Switch
                        checked={log[key] === 1}
                        onCheckedChange={(v) => {
                          const next = { ...log, [key]: v ? 1 : 0 };
                          if (
                            key !== "has_linked" &&
                            next.has_memorized &&
                            next.has_repeated &&
                            next.has_reviewed
                          ) {
                            next.has_linked = 1;
                          }
                          patchRow(row.id, next);
                        }}
                      />
                    </label>
                  ))}
                </div>

                <CounterField
                  label="أخطاء الحفظ"
                  value={log.memorization_errors}
                  onChange={(v) => patchRow(row.id, { memorization_errors: v })}
                />
                <CounterField
                  label="تنبيهات الحفظ"
                  value={log.memorization_warnings}
                  onChange={(v) =>
                    patchRow(row.id, { memorization_warnings: v })
                  }
                />
                <CounterField
                  label="أخطاء المراجعة"
                  value={log.review_errors}
                  onChange={(v) => patchRow(row.id, { review_errors: v })}
                />

                <Button
                  type="button"
                  className="w-full"
                  style={tajawal}
                  disabled={busy}
                  onClick={() => void saveRow(row.id)}
                >
                  {busy ? "جاري الحفظ…" : "حفظ الصف"}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
