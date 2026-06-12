import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudentTrackBadge } from "../../components/edu/StudentTrackBadge";
import { CounterField } from "../../components/teacher/CounterField";
import { DatePickerField } from "../../components/teacher/DatePickerField";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type RowState = {
  id: number;
  has_memorized: number;
  has_repeated: number;
  has_reviewed: number;
  has_linked: number;
  memorization_errors: number;
  memorization_warnings: number;
  review_errors: number;
};

type ScorecardRow = {
  id: number;
  name: string;
  academic_grade: string;
  national_id: string;
  track_name?: string | null;
  attendance_status?: string | null;
  log: RowState;
};

function defaultLog(id: number): RowState {
  return {
    id,
    has_memorized: 0,
    has_repeated: 0,
    has_reviewed: 0,
    has_linked: 0,
    memorization_errors: 0,
    memorization_warnings: 0,
    review_errors: 0,
  };
}

function taskScoreBool(
  scores: Record<string, boolean | number> | undefined,
  keys: string[],
): number {
  if (!scores) return 0;
  return keys.some((k) => Boolean(scores[k])) ? 1 : 0;
}

function taskScoreNumber(
  scores: Record<string, boolean | number> | undefined,
  keys: string[],
): number {
  if (!scores) return 0;
  for (const k of keys) {
    const v = scores[k];
    if (typeof v === "number") return Math.max(0, v);
    if (v) return 1;
  }
  return 0;
}

function rowFromBootstrap(item: {
  student_id: number;
  full_name_ar: string;
  track_name?: string | null;
  admin_present?: boolean;
  task_scores?: Record<string, boolean | number>;
}): ScorecardRow {
  const scores = item.task_scores;
  return {
    id: item.student_id,
    name: item.full_name_ar,
    academic_grade: "—",
    national_id: "—",
    track_name: item.track_name ?? null,
    attendance_status: item.admin_present ? "present" : null,
    log: {
      id: item.student_id,
      has_memorized: taskScoreBool(scores, ["listening", "has_memorized", "memorized"]),
      has_repeated: taskScoreBool(scores, ["repeat", "has_repeated", "repeated"]),
      has_reviewed: taskScoreBool(scores, ["revision", "has_reviewed", "reviewed"]),
      has_linked: taskScoreBool(scores, ["linking", "has_linked", "linked"]),
      memorization_errors: taskScoreNumber(scores, ["error", "memorization_errors"]),
      memorization_warnings: taskScoreNumber(scores, ["tune", "memorization_warnings"]),
      review_errors: taskScoreNumber(scores, ["review_errors"]),
    },
  };
}

export function DailyScorecardGrid() {
  const [date, setDate] = useState(todayIso);
  const [loading, setLoading] = useState(true);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [items, setItems] = useState<ScorecardRow[]>([]);
  const [draft, setDraft] = useState<Record<number, RowState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.eduDeptTeacherBootstrap({ date });
      const rows = (data.items ?? []).map(rowFromBootstrap);
      setContextLabel(data.circle_name ?? data.teacher_circle?.name_ar ?? null);
      setItems(rows);
      const next: Record<number, RowState> = {};
      for (const row of rows) {
        next[row.id] = { ...row.log };
      }
      setDraft(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الشبكة");
      setItems([]);
      setContextLabel(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRow(studentId: number) {
    const log = draft[studentId] ?? defaultLog(studentId);
    setSavingId(studentId);
    try {
      await api.eduDeptDailyRecitationSave({
        recitation_date: date,
        rows: [
          {
            student_id: studentId,
            task_scores: {
              listening: log.has_memorized === 1,
              repeat: log.has_repeated === 1,
              revision: log.has_reviewed === 1,
              linking: log.has_linked === 1,
              error: log.memorization_errors,
              tune: log.memorization_warnings,
              review_errors: log.review_errors,
            },
          },
        ],
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
      [studentId]: { ...(prev[studentId] ?? defaultLog(studentId)), ...patch },
    }));
  }

  if (loading && items.length === 0) {
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
          {contextLabel ? `الحلقة: ${contextLabel}` : "—"} — أي رصد = حضور تلقائي
        </p>
        <DatePickerField value={date} onChange={setDate} maxDate={todayIso()} />
      </div>

      {!items.length ? (
        <p className="text-center text-muted-foreground py-8" style={tajawal}>
          لا يوجد طلاب في هذه الشبكة.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const log = draft[row.id] ?? row.log;
            const busy = savingId === row.id;
            return (
              <article
                key={row.id}
                className="border border-border rounded-2xl p-3 space-y-3 bg-card shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm" style={tajawal}>
                      {row.name}
                    </h3>
                    {row.track_name ? (
                      <StudentTrackBadge trackName={row.track_name} className="mt-1" />
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1">
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
