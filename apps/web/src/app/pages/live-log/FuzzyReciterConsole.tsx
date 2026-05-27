import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  api,
  type ReciterGateResponse,
  type ReciterSnapshot,
} from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import { tajawal } from "../../lib/design-system";

type StudentOption = {
  id: number;
  full_name_ar: string;
  school_grade: string | null;
};

type Props = {
  sessionToken: string;
  gate: ReciterGateResponse;
};

export function FuzzyReciterConsole({ sessionToken, gate }: Props) {
  const [students] = useState<StudentOption[]>(
    (gate.students ?? []).map((s) => ({
      id: Number(s.id),
      full_name_ar: String(s.full_name_ar),
      school_grade: s.school_grade != null ? String(s.school_grade) : null,
    })),
  );
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<ReciterSnapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashOk, setFlashOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = gate.session.rules as {
    fail_threshold_errors?: number;
  };

  const filtered = useMemo(
    () => students.filter((s) => matchesArabicName(query, s.full_name_ar)),
    [students, query],
  );

  const loadSnapshot = useCallback(
    async (studentId: number) => {
      setLoadingSnap(true);
      setError(null);
      try {
        const data = await api.reciterStudentSnapshot(studentId, sessionToken);
        setSnapshot(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الطالب");
        setSnapshot(null);
      } finally {
        setLoadingSnap(false);
      }
    },
    [sessionToken],
  );

  useEffect(() => {
    if (activeId) void loadSnapshot(activeId);
    else setSnapshot(null);
  }, [activeId, loadSnapshot]);

  const today = snapshot?.session_today;
  const failed =
    today &&
    (today.current_hizb_failed === 1 ||
      Number(today.memorization_errors ?? 0) >=
        (rules.fail_threshold_errors ?? 3));

  function patchLocal(
    patch: Partial<ReciterSnapshot["session_today"]>,
  ) {
    if (!snapshot) return;
    setSnapshot({
      ...snapshot,
      session_today: { ...snapshot.session_today, ...patch },
    });
  }

  async function submitFinal(hasMemorized?: number) {
    if (!activeId || !snapshot) return;
    setSaving(true);
    setError(null);
    try {
      await api.reciterSubmitLog(
        {
          student_id: activeId,
          has_memorized: hasMemorized ?? snapshot.session_today.has_memorized,
          memorization_errors: snapshot.session_today.memorization_errors,
          memorization_warnings: snapshot.session_today.memorization_warnings,
          juz_done: snapshot.session_today.juz_done,
          hizb_done: snapshot.session_today.hizb_done,
          current_hizb_failed: snapshot.session_today.current_hizb_failed,
        },
        sessionToken,
      );
      setFlashOk(true);
      setTimeout(() => setFlashOk(false), 1200);
      await loadSnapshot(activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الرصد");
    } finally {
      setSaving(false);
    }
  }

  async function saveField(
    field: "delta_error" | "delta_warning" | "juz_done" | "hizb_done",
    delta: number,
  ) {
    if (!activeId || !snapshot || failed) return;
    const t = snapshot.session_today;
    const body: Record<string, number> = { student_id: activeId };
    if (field === "delta_error") {
      const next = Number(t.memorization_errors ?? 0) + delta;
      patchLocal({ memorization_errors: next });
      body.memorization_errors = next;
      body.delta_error = delta;
    } else if (field === "delta_warning") {
      const next = Number(t.memorization_warnings ?? 0) + delta;
      patchLocal({ memorization_warnings: next });
      body.memorization_warnings = next;
      body.delta_warning = delta;
    } else if (field === "juz_done") {
      const next = Number(t.juz_done ?? 0) + delta;
      patchLocal({ juz_done: next });
      body.juz_done = next;
    } else {
      const next = Number(t.hizb_done ?? 0) + delta;
      patchLocal({ hizb_done: next });
      body.hizb_done = next;
    }
    setSaving(true);
    try {
      await api.reciterSubmitLog(body, sessionToken);
    } catch {
      await loadSnapshot(activeId);
    } finally {
      setSaving(false);
    }
  }

  if (!activeId) {
    return (
      <div
        className="min-h-screen min-h-[100dvh] bg-zinc-950 text-zinc-50 p-4 pb-24"
        dir="rtl"
      >
        <header className="mb-6 text-center">
          <p className="text-xs text-zinc-500" style={tajawal}>
            رصد ميداني — {gate.session.name_ar}
          </p>
          <h1 className="text-xl font-bold text-emerald-400" style={tajawal}>
            اختر الطالب
          </h1>
        </header>
        <div className="max-w-lg mx-auto space-y-4">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <Input
              type="search"
              placeholder="ابحث باسم الطالب…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-14 text-lg pr-12 bg-zinc-900 border-zinc-700 rounded-2xl"
              style={tajawal}
              autoFocus
            />
          </div>
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full p-4 text-right rounded-2xl border border-zinc-800 bg-zinc-900 font-semibold text-lg touch-manipulation"
                  style={tajawal}
                  onClick={() => setActiveId(s.id)}
                >
                  {s.full_name_ar}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen min-h-[100dvh] bg-zinc-950 text-zinc-50 p-4 pb-28 ${
        flashOk ? "ring-4 ring-emerald-500/50 animate-pulse" : ""
      }`}
      dir="rtl"
    >
      <header className="mb-4 max-w-lg mx-auto">
        <button
          type="button"
          className="text-sm text-zinc-400 flex items-center gap-1"
          onClick={() => setActiveId(null)}
          style={tajawal}
        >
          <X className="w-4 h-4" />
          العودة للبحث
        </button>
      </header>

      <div className="max-w-lg mx-auto space-y-4">
        {snapshot && !loadingSnap && (
          <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/40 p-4">
            <p className="text-lg font-bold" style={tajawal}>
              {snapshot.student.full_name_ar}
            </p>
            <p className="text-sm text-emerald-300/90 mt-2" style={tajawal}>
              أيام حفظ: {snapshot.cumulative.total_memorized_days} — أخطاء:{" "}
              {snapshot.cumulative.aggregate_errors}
            </p>
            <p className="text-sm text-zinc-300 mt-1" style={tajawal}>
              مستهدف: {snapshot.target.target_hizb} حزب
            </p>
          </div>
        )}

        {failed && (
          <p className="text-red-400 font-bold flex items-center gap-2" style={tajawal}>
            <AlertTriangle className="w-5 h-5" />
            راسب في هذا الحزب
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400" style={tajawal}>
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <BigMetric
            label="أحزاب"
            value={Number(today?.hizb_done ?? 0)}
            onMinus={() => void saveField("hizb_done", -1)}
            onPlus={() => void saveField("hizb_done", 1)}
            disabled={!!failed || saving}
          />
          <BigMetric
            label="أجزاء"
            value={Number(today?.juz_done ?? 0)}
            onMinus={() => void saveField("juz_done", -1)}
            onPlus={() => void saveField("juz_done", 1)}
            disabled={!!failed || saving}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button
            type="button"
            variant="outline"
            className="min-h-16 rounded-2xl border-zinc-600"
            disabled={!!failed || saving}
            onClick={() => void saveField("delta_warning", 1)}
            style={tajawal}
          >
            + تنبيه ({today?.memorization_warnings ?? 0})
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-16 rounded-2xl"
            disabled={!!failed || saving}
            onClick={() => void saveField("delta_error", 1)}
            style={tajawal}
          >
            + خطأ ({today?.memorization_errors ?? 0})
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            className="min-h-14 rounded-2xl bg-zinc-800"
            disabled={saving || !!failed}
            onClick={() => void submitFinal(0)}
            style={tajawal}
          >
            لم يحفظ
          </Button>
          <Button
            type="button"
            className="min-h-14 rounded-2xl bg-emerald-600"
            disabled={saving || !!failed}
            onClick={() => void submitFinal(1)}
            style={tajawal}
          >
            <Check className="w-5 h-5 ml-1 inline" />
            نعم — حفظ
          </Button>
        </div>

        <Button
          type="button"
          className="w-full min-h-16 rounded-2xl text-lg bg-emerald-700"
          disabled={saving}
          onClick={() => void submitFinal()}
          style={tajawal}
        >
          {saving ? "جاري الإرسال…" : "إرسال واعتماد الرصد الميداني"}
        </Button>
      </div>
    </div>
  );
}

function BigMetric({
  label,
  value,
  onMinus,
  onPlus,
  disabled,
}: {
  label: string;
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-center">
      <p className="text-xs text-zinc-500 mb-3" style={tajawal}>
        {label}
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          className="min-h-16 min-w-16 rounded-full border border-zinc-600 flex items-center justify-center disabled:opacity-40"
          disabled={disabled}
          onClick={onMinus}
        >
          <Minus className="w-7 h-7" />
        </button>
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <button
          type="button"
          className="min-h-16 min-w-16 rounded-full bg-emerald-600 flex items-center justify-center disabled:opacity-40"
          disabled={disabled}
          onClick={onPlus}
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
