import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayRiyadhIso } from "../../lib/today-riyadh-iso";
import { useParams } from "react-router";
import { AlertTriangle, BookOpen, Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import {
  computeSirdPeriodScore,
  DEFAULT_SIRD_SETTINGS,
  isMemorizationTrackingCategory,
  targetHizbCount,
  type MemorizationUnit,
  type SirdPeriodData,
  type SirdSettings,
} from "../../lib/competition-engine";
import { CompetitionLiveGrid } from "../../components/edu/CompetitionLiveGrid";
import { HizbSessionGrid } from "../../components/edu/HizbSessionGrid";
import { SirdPeriodGrid } from "../../components/edu/SirdPeriodGrid";
import { TaskInputCell, type TaskInputCol } from "../../components/edu/TaskInputCell";
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
  daily_faces?: number;
  memorization_unit?: MemorizationUnit;
};

type TaskRow = TaskInputCol;

type AuditRow = ReciterDraftAudit & {
  student_id?: number;
  current_hizb_failed?: number;
  active_hizb?: number;
  hizb_sessions?: Record<
    string,
    {
      task_points?: Record<number, number>;
      done?: boolean;
      notes?: string;
    }
  >;
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
  const [memorizationUnit, setMemorizationUnit] = useState<MemorizationUnit>("juz");
  const [competitionDays, setCompetitionDays] = useState(1);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [gradedDates, setGradedDates] = useState<string[]>([]);
  const [logDate, setLogDate] = useState(() => todayRiyadhIso());
  const [sirdSettings, setSirdSettings] = useState<SirdSettings>({
    ...DEFAULT_SIRD_SETTINGS,
  });
  const [sirdPeriods, setSirdPeriods] = useState<
    Record<number, Record<number, SirdPeriodData>>
  >({});
  const [activePeriod, setActivePeriod] = useState<number | null>(null);
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
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);

  useEffect(() => {
    sessionLoadedRef.current = false;
    verifiedPinRef.current = "";
    setPinVerified(false);
    setStudents([]);
    setAudit({});
    setActiveId(null);
    setError(null);
  }, [token]);

  const loadSession = useCallback(async (dateOverride?: string) => {
    if (!token || !pinVerified || !verifiedPinRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.liveLogSession(
        token,
        verifiedPinRef.current,
        dateOverride,
      );
      setKind(data.kind);
      setSessionId(Number(data.session.id ?? 0));
      setSessionName(String(data.session.name_ar ?? ""));
      setCategory(String(data.session.category ?? "recitation"));
      setMemorizationUnit(
        data.session.memorization_unit === "hizb" ? "hizb" : "juz",
      );
      setCompetitionDays(Number(data.session.competition_days ?? 1));
      const sessDates = data.session.active_dates;
      if (Array.isArray(sessDates)) {
        setActiveDates(sessDates as string[]);
      }
      const sessGraded = data.session.graded_dates;
      if (Array.isArray(sessGraded)) {
        setGradedDates(sessGraded as string[]);
      }
      if (data.session.log_date) {
        setLogDate(String(data.session.log_date));
      }
      const sess = data.session as {
        sird_settings?: SirdSettings;
        rules?: Record<string, unknown>;
      };
      if (sess.sird_settings) {
        setSirdSettings({
          base_hizb_score: Number(
            sess.sird_settings.base_hizb_score ?? DEFAULT_SIRD_SETTINGS.base_hizb_score,
          ),
          mistake_deduction: Number(
            sess.sird_settings.mistake_deduction ?? DEFAULT_SIRD_SETTINGS.mistake_deduction,
          ),
          warning_deduction: Number(
            sess.sird_settings.warning_deduction ?? DEFAULT_SIRD_SETTINGS.warning_deduction,
          ),
          pass_threshold: Number(
            sess.sird_settings.pass_threshold ?? DEFAULT_SIRD_SETTINGS.pass_threshold,
          ),
        });
      } else if (sess.rules?.sird) {
        const s = sess.rules.sird as Record<string, number>;
        setSirdSettings({
          base_hizb_score: Number(s.base_hizb_score ?? DEFAULT_SIRD_SETTINGS.base_hizb_score),
          mistake_deduction: Number(s.mistake_deduction ?? DEFAULT_SIRD_SETTINGS.mistake_deduction),
          warning_deduction: Number(s.warning_deduction ?? DEFAULT_SIRD_SETTINGS.warning_deduction),
          pass_threshold: Number(s.pass_threshold ?? DEFAULT_SIRD_SETTINGS.pass_threshold),
        });
      }
      if (data.session.rules) {
        const r = data.session.rules as Record<string, number>;
        setRules({
          fail_threshold_errors: Number(r.fail_threshold_errors ?? 3),
          alerts_per_error: Number(r.alerts_per_error ?? 5),
        });
      }
      const studs = (data.students as StudentRow[]).map((s) => {
        const targetAmount = Number(s.target_amount ?? 0);
        const targetHizb =
          s.target_hizb != null && Number(s.target_hizb) > 0
            ? Number(s.target_hizb)
            : targetHizbCount(targetAmount);
        return {
          student_id: Number(s.student_id),
          full_name_ar: String(s.full_name_ar),
          target_hizb: targetHizb,
          target_juz: Number(s.target_juz ?? targetAmount),
          target_amount: targetAmount,
          current_memorization: Number(s.current_memorization ?? 0),
          achieved_amount: Number(s.achieved_amount ?? 0),
          daily_faces:
            s.daily_faces != null ? Number(s.daily_faces) : undefined,
          memorization_unit:
            s.memorization_unit === "hizb" ? ("hizb" as const) : ("juz" as const),
        };
      });
      setStudents(studs);
      setTasks(
        ((data.tasks ?? []) as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
          weight: Number(t.weight ?? 1),
          type: (t.type === "deduction" ? "deduction" : "addition") as TaskRow["type"],
          input_type: t.input_type != null ? String(t.input_type) : undefined,
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
            if (row.notes) {
              try {
                const parsed = JSON.parse(String(row.notes)) as AuditRow;
                Object.assign(metrics, parsed);
              } catch {
                /* keep defaults */
              }
            }
          }
          if (!metrics.task_points && row.task_id) {
            metrics.task_points = {
              [Number(row.task_id)]: Number(row.points ?? 0),
            };
          }
          a[sid] = { student_id: sid, ...metrics };
        }
      }
      setAudit(a);

      const rawSird = (data as { sird_periods?: Record<string, Array<Record<string, unknown>>> })
        .sird_periods;
      if (rawSird) {
        const map: Record<number, Record<number, SirdPeriodData>> = {};
        for (const [sid, list] of Object.entries(rawSird)) {
          const studentId = Number(sid);
          map[studentId] = {};
          for (const p of list) {
            const idx = Number(p.period_index);
            if (!idx) continue;
            map[studentId][idx] = {
              period_index: idx,
              hizb_number: Number(p.hizb_number ?? 0),
              mistakes_count: Number(p.mistakes_count ?? 0),
              warnings_count: Number(p.warnings_count ?? 0),
              is_passed: Boolean(p.is_passed),
              score: p.score != null ? Number(p.score) : null,
            };
          }
        }
        setSirdPeriods(map);
      }
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
    setActivePeriod(null);
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

  function patchSirdPeriod(
    studentId: number,
    periodIndex: number,
    patch: Partial<SirdPeriodData>,
  ) {
    setSirdPeriods((prev) => {
      const cur = prev[studentId]?.[periodIndex] ?? {
        period_index: periodIndex,
        hizb_number: 0,
        mistakes_count: 0,
        warnings_count: 0,
        is_passed: false,
        score: null,
      };
      const next = { ...cur, ...patch };
      const { score, is_passed } = computeSirdPeriodScore(
        next.mistakes_count,
        next.warnings_count,
        sirdSettings,
      );
      return {
        ...prev,
        [studentId]: {
          ...(prev[studentId] ?? {}),
          [periodIndex]: { ...next, score, is_passed },
        },
      };
    });
  }

  async function saveSirdPeriod(studentId: number, periodIndex: number) {
    if (!token || !studentId || !periodIndex) return;
    const period = sirdPeriods[studentId]?.[periodIndex];
    if (!period) return;
    setSaving(true);
    try {
      await api.liveLogUpsert(
        token,
        {
          student_id: studentId,
          metrics: {
            category,
            sird_period: {
              period_index: periodIndex,
              hizb_number: period.hizb_number,
              mistakes_count: period.mistakes_count,
              warnings_count: period.warnings_count,
            },
          },
        },
        verifiedPinRef.current,
      );
      toast.success("تم حفظ فترة السرد");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function saveAuditForStudent(studentId: number, patch: Record<string, unknown> = {}) {
    if (!token || !studentId) return;
    const rowAudit = audit[studentId] ?? {};
    setSavingStudentId(studentId);
    try {
      const res = await api.liveLogUpsert(
        token,
        {
          student_id: studentId,
          log_date: logDate,
          ...patch,
          metrics: {
            category,
            juz_done: rowAudit.juz_done,
            hizb_done: rowAudit.hizb_done,
            alerts: rowAudit.alerts_count,
            errors: rowAudit.errors_count,
            task_points: rowAudit.task_points,
            notes: rowAudit.notes,
            active_hizb: rowAudit.active_hizb,
            hizb_sessions: rowAudit.hizb_sessions,
            ...patch,
          },
        },
        verifiedPinRef.current,
      );
      if (sessionId) clearReciterDraft(sessionId, studentId, token);
      setAudit((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          student_id: studentId,
          ...patch,
          current_hizb_failed: res.failed ? 1 : 0,
        },
      }));
      if (kind === "competition" && logDate) {
        setGradedDates((prev) =>
          prev.includes(logDate) ? prev : [...prev, logDate].sort(),
        );
      }
      toast.success("تم حفظ الرصد بنجاح");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSavingStudentId(null);
    }
  }

  async function saveAudit(patch: Record<string, unknown> = {}) {
    if (!activeId) return;
    await saveAuditForStudent(activeId, patch);
  }

  function patchStudentAudit(
    studentId: number,
    patch: Partial<AuditRow>,
  ) {
    if (!token || !sessionId) return;
    setAudit((prev) => {
      const next = { ...prev[studentId], ...patch };
      writeReciterDraft(sessionId, studentId, token, {
        juz_done: next.juz_done,
        hizb_done: next.hizb_done,
        alerts_count: next.alerts_count,
        errors_count: next.errors_count,
        task_points: next.task_points,
        notes: next.notes,
      });
      return { ...prev, [studentId]: next };
    });
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
      ) : kind === "competition" && isMemorizationTrackingCategory(category) ? (
        <CompetitionLiveGrid
          category={category}
          memorizationUnit={memorizationUnit}
          students={students}
          tasks={tasks}
          audit={audit}
          activeDates={activeDates}
          gradedDates={gradedDates}
          logDate={logDate}
          onLogDateChange={(d) => {
            setLogDate(d);
            setAudit({});
            void loadSession(d);
          }}
          saving={saving}
          savingStudentId={savingStudentId}
          onPatchStudent={patchStudentAudit}
          onSaveStudent={(studentId) => saveAuditForStudent(studentId)}
          onSaveAll={async () => {
            setSaving(true);
            try {
              for (const s of students) {
                await saveAuditForStudent(s.student_id);
              }
            } finally {
              setSaving(false);
            }
          }}
        />
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
                      {(s.target_amount ?? 0) > 0 || (s.target_hizb ?? 0) > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          {category === "new_memorization" && s.daily_faces
                            ? `مستهدف: ${s.target_amount} ${s.memorization_unit === "hizb" ? "حزب" : "جزء"} · ${s.daily_faces} وجه/يوم`
                            : category === "recitation"
                              ? `مستهدف: ${s.target_amount ?? 0} جزء (${s.target_hizb ?? targetHizbCount(s.target_amount ?? 0)} حزب)`
                              : `مستهدف: ${s.target_amount ?? 0} جزء`}
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

          {kind === "competition" && category === "recitation" ? (
            <div className={`${ds.card} p-4`}>
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={tajawal}>
                <BookOpen className="w-5 h-5 text-primary" />
                بطاقة السرد — {active.full_name_ar}
              </h2>
              <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
                {competitionDays} فترة · درجة أساس {sirdSettings.base_hizb_score}
              </p>
              <SirdPeriodGrid
                totalPeriods={competitionDays}
                activePeriod={activePeriod}
                periods={activeId ? (sirdPeriods[activeId] ?? {}) : {}}
                settings={sirdSettings}
                disabled={saving}
                onSelectPeriod={setActivePeriod}
                onPatchPeriod={(period, patch) => {
                  if (!activeId) return;
                  patchSirdPeriod(activeId, period, patch);
                }}
              />
              {activePeriod != null && (
                <Button
                  type="button"
                  className={`${ds.btnRound} w-full mt-4 min-h-12`}
                  disabled={saving}
                  onClick={() => void saveSirdPeriod(activeId!, activePeriod)}
                  style={tajawal}
                >
                  {saving ? "جاري الحفظ…" : "تأكيد وحفظ الفترة"}
                </Button>
              )}
            </div>
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
  rules,
  competitionMode,
  tasks,
  onBump,
  onSelectHizb,
  onPatchHizbSession,
  onNextHizb,
  onSave,
}: {
  student: StudentRow;
  audit: AuditRow;
  failed?: boolean;
  saving: boolean;
  rules?: { fail_threshold_errors: number; alerts_per_error: number };
  competitionMode?: boolean;
  tasks?: TaskRow[];
  onBump?: (field: "delta_hizb" | "delta_juz" | "delta_alert" | "delta_error", d: number) => void;
  onSelectHizb?: (hizb: number) => void;
  onPatchHizbSession?: (
    hizb: number,
    patch: {
      task_points?: Record<number, number>;
      done?: boolean;
      notes?: string;
    },
  ) => void;
  onNextHizb?: () => void;
  onSave: () => void;
}) {
  const totalHizbs =
    student.target_hizb ?? targetHizbCount(student.target_amount ?? student.target_juz ?? 0);
  const activeHizb = audit.active_hizb ?? null;
  const session =
    activeHizb != null ? audit.hizb_sessions?.[String(activeHizb)] : undefined;

  if (competitionMode) {
    return (
      <div className={`${ds.card} p-4`}>
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={tajawal}>
          <BookOpen className="w-5 h-5 text-primary" />
          بطاقة السرد — {student.full_name_ar}
        </h2>
        <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
          مستهدف {student.target_amount ?? 0} جزء · {totalHizbs} حزب
        </p>
        <HizbSessionGrid
          totalHizbs={totalHizbs}
          activeHizb={activeHizb}
          completedHizbs={
            new Set(
              Object.entries(audit.hizb_sessions ?? {})
                .filter(([, v]) => v.done)
                .map(([k]) => Number(k)),
            )
          }
          onSelect={(hizb) => onSelectHizb?.(hizb)}
        />
        {activeHizb != null && (
          <div className="mt-4 space-y-3 rounded-xl border p-3">
            <p className="font-semibold text-sm" style={tajawal}>
              تقييم الحزب {activeHizb}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(tasks ?? []).map((task) => {
                const value = Number(session?.task_points?.[task.id] ?? 0);
                return (
                  <div key={task.id} className="rounded-xl border p-2 text-center">
                    <p className="text-xs text-muted-foreground mb-2" style={tajawal}>
                      {task.name_ar}
                    </p>
                    <TaskInputCell
                      task={task}
                      value={value}
                      disabled={saving}
                      onChange={(next) =>
                        onPatchHizbSession?.(activeHizb, {
                          task_points: {
                            ...(session?.task_points ?? {}),
                            [task.id]: next,
                          },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <Input
              placeholder="ملاحظات (اختياري)"
              value={String(session?.notes ?? audit.notes ?? "")}
              disabled={saving}
              onChange={(e) =>
                onPatchHizbSession?.(activeHizb, { notes: e.target.value })
              }
              className={ds.btnRound}
              style={tajawal}
            />
            <div className="flex flex-wrap gap-2">
              <SaveButton saving={saving} onSave={onSave} />
              {activeHizb < totalHizbs && (
                <Button
                  type="button"
                  variant="outline"
                  className={`${ds.btnRound} flex-1 min-h-12`}
                  disabled={saving}
                  onClick={() => {
                    onPatchHizbSession?.(activeHizb, { done: true });
                    onNextHizb?.();
                  }}
                  style={tajawal}
                >
                  حفظ والحزب التالي
                </Button>
              )}
            </div>
          </div>
        )}
        {activeHizb == null && <SaveButton saving={saving} onSave={onSave} />}
      </div>
    );
  }

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
          onMinus={() => onBump?.("delta_hizb", -1)}
          onPlus={() => onBump?.("delta_hizb", 1)}
          disabled={!!failed || saving}
        />
        <MetricBlock
          label="أجزاء"
          value={Number(audit.juz_done ?? 0)}
          onMinus={() => onBump?.("delta_juz", -1)}
          onPlus={() => onBump?.("delta_juz", 1)}
          disabled={!!failed || saving}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className={`${ds.btnRound} flex-1 min-h-12`}
          disabled={saving || !!failed}
          onClick={() => onBump?.("delta_alert", 1)}
          style={tajawal}
        >
          + تنبيه ({audit.alerts_count ?? 0})
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={`${ds.btnRound} flex-1 min-h-12`}
          disabled={saving || !!failed}
          onClick={() => onBump?.("delta_error", 1)}
          style={tajawal}
        >
          + خطأ ({audit.errors_count ?? 0})
        </Button>
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
