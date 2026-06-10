import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { AlertTriangle, BookOpen, Loader2, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";
import {
  clearReciterDraft,
  readReciterDraft,
  writeReciterDraft,
  type ReciterDraftAudit,
} from "../../lib/reciter-draft-storage";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  target_hizb?: number;
  target_juz?: number;
  target_amount?: number;
  current_memorization?: number;
  achieved_amount?: number;
};

type TaskRow = {
  id: number;
  name_ar: string;
  weight: number;
  type: "addition" | "deduction";
};

type AuditRow = ReciterDraftAudit & {
  student_id?: number;
  current_hizb_failed?: number;
};

export function LiveLogPage() {
  const { token } = useParams<{ token: string }>();
  const [pin, setPin] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const verifiedPinRef = useRef("");
  const sessionLoadedRef = useRef(false);
  const [gateLoading, setGateLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(0);
  const [sessionName, setSessionName] = useState("");
  const [category, setCategory] = useState("recitation");
  const [kind, setKind] = useState<"yom_himma" | "competition">("yom_himma");
  const [rules, setRules] = useState({
    fail_threshold_errors: 3,
    alerts_per_error: 5,
  });
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [audit, setAudit] = useState<Record<number, AuditRow>>({});
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sessionLoadedRef.current = false;
    verifiedPinRef.current = "";
    setPinVerified(false);
    setStudents([]);
    setAudit({});
    setActiveId(null);
    setError(null);
  }, [token]);

  const loadSession = useCallback(async () => {
    if (!token || !pinVerified || !verifiedPinRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.liveLogSession(token, verifiedPinRef.current);
      setKind(data.kind);
      setSessionId(Number(data.session.id ?? 0));
      setSessionName(String(data.session.name_ar ?? ""));
      setCategory(String(data.session.category ?? "recitation"));
      if (data.session.rules) {
        const r = data.session.rules as Record<string, number>;
        setRules({
          fail_threshold_errors: Number(r.fail_threshold_errors ?? 3),
          alerts_per_error: Number(r.alerts_per_error ?? 5),
        });
      }
      const studs = (data.students as StudentRow[]).map((s) => ({
        student_id: Number(s.student_id),
        full_name_ar: String(s.full_name_ar),
        target_hizb: Number(s.target_hizb ?? 0),
        target_juz: Number(s.target_juz ?? s.target_amount ?? 0),
        target_amount: Number(s.target_amount ?? 0),
        current_memorization: Number(s.current_memorization ?? 0),
        achieved_amount: Number(s.achieved_amount ?? 0),
      }));
      setStudents(studs);
      setTasks(
        ((data.tasks ?? []) as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
          weight: Number(t.weight ?? 1),
          type: (t.type === "deduction" ? "deduction" : "addition") as TaskRow["type"],
        })),
      );

      const a: Record<number, AuditRow> = {};
      if (data.kind === "yom_himma") {
        for (const row of (data.audit ?? []) as AuditRow[]) {
          a[row.student_id!] = row;
        }
      } else {
        for (const row of (data.logs ?? []) as Array<Record<string, unknown>>) {
          const sid = Number(row.student_id);
          let metrics: ReciterDraftAudit = {};
          if (row.metrics_json) {
            try {
              metrics = JSON.parse(String(row.metrics_json)) as ReciterDraftAudit;
            } catch {
              metrics = {};
            }
          } else {
            metrics = {
              juz_done: Number(row.points ?? 0),
              notes: String(row.notes ?? ""),
            };
          }
          a[sid] = { student_id: sid, ...metrics };
        }
      }
      setAudit(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "رابط غير صالح أو منتهي");
    } finally {
      setLoading(false);
    }
  }, [token, pinVerified]);

  useEffect(() => {
    if (!token || !pinVerified || sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    void loadSession();
  }, [token, pinVerified, loadSession]);

  const filtered = useMemo(
    () =>
      query.trim()
        ? students.filter((s) => matchesArabicName(query, s.full_name_ar))
        : [],
    [students, query],
  );

  const showSuggestions = searchOpen && query.trim().length > 0 && !loading;

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (searchRootRef.current?.contains(e.target as Node)) return;
      setSearchOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  function pickStudent(studentId: number) {
    setActiveId(studentId);
    setSearchOpen(false);
  }

  const active = activeId ? students.find((s) => s.student_id === activeId) : null;

  const activeAudit: AuditRow = useMemo(() => {
    if (!activeId) {
      return {
        juz_done: 0,
        hizb_done: 0,
        alerts_count: 0,
        errors_count: 0,
        task_points: {},
      };
    }
    return (
      audit[activeId] ?? {
        juz_done: 0,
        hizb_done: 0,
        alerts_count: 0,
        errors_count: 0,
        task_points: {},
      }
    );
  }, [activeId, audit]);

  useEffect(() => {
    if (!token || !sessionId || !activeId) return;
    const draft = readReciterDraft(sessionId, activeId, token);
    if (draft) {
      setAudit((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], ...draft },
      }));
    }
  }, [activeId, sessionId, token]);

  const failed =
    kind === "yom_himma" &&
    (activeAudit.current_hizb_failed === 1 ||
      Number(activeAudit.errors_count ?? 0) >= rules.fail_threshold_errors);

  function patchAudit(patch: Partial<AuditRow>) {
    if (!activeId || !token || !sessionId) return;
    setAudit((prev) => {
      const next = { ...prev[activeId], ...patch };
      writeReciterDraft(sessionId, activeId, token, {
        juz_done: next.juz_done,
        hizb_done: next.hizb_done,
        alerts_count: next.alerts_count,
        errors_count: next.errors_count,
        task_points: next.task_points,
        notes: next.notes,
      });
      return { ...prev, [activeId]: next };
    });
  }

  async function saveAudit(patch: Record<string, unknown>) {
    if (!token || !activeId) return;
    setSaving(true);
    try {
      const res = await api.liveLogUpsert(
        token,
        {
          student_id: activeId,
          ...patch,
          metrics: {
            category,
            juz_done: activeAudit.juz_done,
            hizb_done: activeAudit.hizb_done,
            alerts: activeAudit.alerts_count,
            errors: activeAudit.errors_count,
            task_points: activeAudit.task_points,
            notes: activeAudit.notes,
            ...patch,
          },
        },
        verifiedPinRef.current,
      );
      if (sessionId) clearReciterDraft(sessionId, activeId, token);
      setAudit((prev) => ({
        ...prev,
        [activeId]: {
          ...prev[activeId],
          student_id: activeId,
          ...patch,
          current_hizb_failed: res.failed ? 1 : 0,
        },
      }));
      toast.success("تم حفظ الرصد بنجاح");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  function bump(field: "delta_hizb" | "delta_juz" | "delta_alert" | "delta_error", d: number) {
    if (!activeId) return;
    const next = { ...activeAudit };
    if (field === "delta_hizb") next.hizb_done = Number(next.hizb_done ?? 0) + d;
    if (field === "delta_juz") next.juz_done = Number(next.juz_done ?? 0) + d;
    if (field === "delta_alert") next.alerts_count = Number(next.alerts_count ?? 0) + d;
    if (field === "delta_error") next.errors_count = Number(next.errors_count ?? 0) + d;
    patchAudit(next);
  }

  function bumpTaskPoints(taskId: number, delta: number) {
    if (!activeId) return;
    const pts = { ...(activeAudit.task_points ?? {}) };
    pts[taskId] = Math.max(0, Number(pts[taskId] ?? 0) + delta);
    patchAudit({ task_points: pts });
  }

  async function verifyPin() {
    if (!token) return;
    const trimmed = pin.trim();
    if (!trimmed) return;
    setGateLoading(true);
    setError(null);
    try {
      await api.liveLogSession(token, trimmed);
      verifiedPinRef.current = trimmed;
      sessionLoadedRef.current = false;
      setPinVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "رمز الدخول غير صحيح");
    } finally {
      setGateLoading(false);
    }
  }

  if (!pinVerified) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center" dir="rtl">
        <div className={`${ds.card} w-full max-w-md p-6 space-y-4`}>
          <h1 className="text-xl font-bold text-primary" style={tajawal}>
            بطاقة التحقق للمقرئ
          </h1>
          <p className="text-sm text-muted-foreground" style={tajawal}>
            أدخل رمز التحقق (Access Token) الممنوح لك لفتح بطاقة الرصد الميداني.
          </p>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="أدخل رمز التحقق"
            className={ds.btnRound}
            style={tajawal}
          />
          {error && (
            <p className={ds.alert.error} style={tajawal}>
              {error}
            </p>
          )}
          <Button
            type="button"
            className={ds.btnRound}
            onClick={verifyPin}
            disabled={gateLoading || !pin.trim()}
            style={tajawal}
          >
            {gateLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جارٍ التحقق...
              </>
            ) : (
              "دخول الرصد"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-background text-foreground p-4 pb-24"
      dir="rtl"
    >
      <header className="mb-4 text-center">
        <p className="text-xs text-muted-foreground" style={tajawal}>
          رصد ميداني تشاركي
        </p>
        <h1 className="text-xl font-bold text-primary" style={tajawal}>
          {sessionName || "…"}
        </h1>
        {kind === "competition" && (
          <p className="text-xs text-primary/70 mt-1" style={tajawal}>
            {category === "new_memorization"
              ? "حفظ جديد"
              : category === "review"
                ? "مراجعة"
                : "سرد"}
          </p>
        )}
      </header>

      {error && (
        <p className={`${ds.alert.error} mb-4`} style={tajawal}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p style={tajawal}>جاري التحميل…</p>
        </div>
      ) : !active ? (
        <div className="space-y-4 max-w-lg mx-auto">
          <div ref={searchRootRef} className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none z-10" />
            <Input
              type="search"
              placeholder="ابحث باسم الطالب…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  return;
                }
                if (e.key === "Enter" && filtered.length === 1) {
                  e.preventDefault();
                  pickStudent(filtered[0].student_id);
                }
              }}
              className={`${ds.btnRound} h-14 text-lg pr-12`}
              style={tajawal}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {showSuggestions && (
              <div
                className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg max-h-[min(60vh,320px)] overflow-y-auto overscroll-contain"
                role="listbox"
                onPointerDown={(e) => e.preventDefault()}
              >
                {filtered.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground" style={tajawal}>
                    لا يوجد طالب مطابق في هذه الفعالية.
                  </p>
                ) : (
                  filtered.map((s) => (
                    <button
                      key={s.student_id}
                      type="button"
                      role="option"
                      className="w-full text-right px-4 py-3 text-base font-semibold hover:bg-muted transition-colors border-b border-border last:border-0 touch-manipulation"
                      style={tajawal}
                      onClick={() => pickStudent(s.student_id)}
                    >
                      {s.full_name_ar}
                      {s.target_amount || s.target_hizb ? (
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          مستهدف: {s.target_amount || s.target_juz || s.target_hizb}{" "}
                          {s.target_hizb ? "حزب" : "جزء"}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {!searchOpen && query.trim().length === 0 && students.length > 0 && (
            <p className="text-sm text-muted-foreground text-center" style={tajawal}>
              ابدأ بكتابة اسم الطالب لعرض الاقتراحات ({students.length} مشارك)
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-lg mx-auto space-y-4">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => setActiveId(null)}
            style={tajawal}
          >
            ← العودة للبحث
          </Button>

          {kind === "competition" && category === "new_memorization" ? (
            <NewMemorizationCard
              student={active}
              tasks={tasks}
              audit={activeAudit}
              saving={saving}
              onTaskBump={bumpTaskPoints}
              onJuzBump={(d) => bump("delta_juz", d)}
              onSave={() => void saveAudit({})}
            />
          ) : kind === "competition" && category === "review" ? (
            <ReviewCard
              student={active}
              audit={activeAudit}
              saving={saving}
              onBump={bump}
              onSave={() => void saveAudit({})}
            />
          ) : (
            <RecitationCard
              student={active}
              audit={activeAudit}
              failed={!!failed}
              saving={saving}
              rules={rules}
              onBump={bump}
              onSave={() => void saveAudit({})}
            />
          )}

          {kind === "yom_himma" && (
            <p className="text-xs text-center text-muted-foreground" style={tajawal}>
              يُحدَّث البث على الشاشة الكبيرة تلقائياً بعد الحفظ
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RecitationCard({
  student,
  audit,
  failed,
  saving,
  onBump,
  onSave,
}: {
  student: StudentRow;
  audit: AuditRow;
  failed: boolean;
  saving: boolean;
  rules: { fail_threshold_errors: number; alerts_per_error: number };
  onBump: (field: "delta_hizb" | "delta_juz" | "delta_alert" | "delta_error", d: number) => void;
  onSave: () => void;
}) {
  return (
    <div className={`${ds.card} p-4 ${failed ? "ring-2 ring-destructive bg-destructive/5" : ""}`}>
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={tajawal}>
        <BookOpen className="w-5 h-5 text-primary" />
        بطاقة السرد — {student.full_name_ar}
      </h2>
      {failed && (
        <p className="text-destructive font-bold flex items-center gap-2 mb-3" style={tajawal}>
          <AlertTriangle className="w-5 h-5" />
          راسب في هذا الحزب
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
        المحفوظ المكتمل · المستهدف: {student.target_juz ?? student.target_amount ?? 0} جزء
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricBlock
          label="أحزاب منجزة"
          value={Number(audit.hizb_done ?? 0)}
          onMinus={() => onBump("delta_hizb", -1)}
          onPlus={() => onBump("delta_hizb", 1)}
          disabled={!!failed || saving}
        />
        <MetricBlock
          label="أجزاء"
          value={Number(audit.juz_done ?? 0)}
          onMinus={() => onBump("delta_juz", -1)}
          onPlus={() => onBump("delta_juz", 1)}
          disabled={!!failed || saving}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={`${ds.btnRound} flex-1 min-h-12`}
          disabled={saving || !!failed}
          onClick={() => onBump("delta_alert", 1)}
          style={tajawal}
        >
          + تنبيه ({audit.alerts_count ?? 0})
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={`${ds.btnRound} flex-1 min-h-12`}
          disabled={saving || !!failed}
          onClick={() => onBump("delta_error", 1)}
          style={tajawal}
        >
          + خطأ ({audit.errors_count ?? 0})
        </Button>
      </div>
      <SaveButton saving={saving} onSave={onSave} />
    </div>
  );
}

function NewMemorizationCard({
  student,
  tasks,
  audit,
  saving,
  onTaskBump,
  onJuzBump,
  onSave,
}: {
  student: StudentRow;
  tasks: TaskRow[];
  audit: AuditRow;
  saving: boolean;
  onTaskBump: (taskId: number, delta: number) => void;
  onJuzBump: (delta: number) => void;
  onSave: () => void;
}) {
  return (
    <div className={`${ds.card} p-4 ring-2 ring-emerald-500/30`}>
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={tajawal}>
        <Plus className="w-5 h-5 text-emerald-600" />
        تسميع الحفظ الجديد — {student.full_name_ar}
      </h2>
      <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
        الحفظ الحالي: {student.current_memorization ?? 0} · المستهدف:{" "}
        {student.target_amount ?? 0} جزء
      </p>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
          لا مهام محددة — استخدم العداد العام.
        </p>
      ) : (
        <div className="space-y-3 mb-4">
          {tasks.map((task) => (
            <MetricBlock
              key={task.id}
              label={`${task.name_ar} (×${task.weight})`}
              value={Number(audit.task_points?.[task.id] ?? 0)}
              onMinus={() => onTaskBump(task.id, -1)}
              onPlus={() => onTaskBump(task.id, 1)}
              disabled={saving}
            />
          ))}
        </div>
      )}
      <MetricBlock
        label="أجزاء محفوظة اليوم"
        value={Number(audit.juz_done ?? 0)}
        onMinus={() => onJuzBump(-1)}
        onPlus={() => onJuzBump(1)}
        disabled={saving}
      />
      <SaveButton saving={saving} onSave={onSave} />
    </div>
  );
}

function ReviewCard({
  student,
  audit,
  saving,
  onBump,
  onSave,
}: {
  student: StudentRow;
  audit: AuditRow;
  saving: boolean;
  onBump: (field: "delta_hizb" | "delta_juz" | "delta_alert" | "delta_error", d: number) => void;
  onSave: () => void;
}) {
  return (
    <div className={`${ds.card} p-4 ring-2 ring-amber-500/30`}>
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={tajawal}>
        <RefreshCw className="w-5 h-5 text-amber-600" />
        رصد المراجعة — {student.full_name_ar}
      </h2>
      <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
        ضبط المحفوظ السابق · المنجَز: {student.achieved_amount ?? 0} /{" "}
        {student.target_amount ?? 0}
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricBlock
          label="صفحات/أجزاء مراجَعة"
          value={Number(audit.juz_done ?? 0)}
          onMinus={() => onBump("delta_juz", -1)}
          onPlus={() => onBump("delta_juz", 1)}
          disabled={saving}
        />
        <MetricBlock
          label="تنبيهات"
          value={Number(audit.alerts_count ?? 0)}
          onMinus={() => onBump("delta_alert", -1)}
          onPlus={() => onBump("delta_alert", 1)}
          disabled={saving}
        />
      </div>
      <SaveButton saving={saving} onSave={onSave} />
    </div>
  );
}

function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <Button
      type="button"
      className={`${ds.btnRound} w-full mt-4 min-h-12`}
      disabled={saving}
      onClick={onSave}
      style={tajawal}
    >
      {saving ? "جاري الحفظ…" : "تأكيد وحفظ الرصد"}
    </Button>
  );
}

function MetricBlock({
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
    <div className="rounded-2xl border border-border p-3 text-center">
      <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full"
          disabled={disabled}
          onClick={onMinus}
        >
          <Minus className="w-6 h-6" />
        </Button>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full"
          disabled={disabled}
          onClick={onPlus}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
