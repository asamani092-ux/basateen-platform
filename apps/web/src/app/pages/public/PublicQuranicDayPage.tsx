import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Minus,
  Music2,
  Plus,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type DayConfig = {
  name_ar: string;
  event_date: string;
  fail_threshold: number;
  hizb_time_limit: number;
};

type StudentState = {
  student_id: number;
  full_name_ar: string;
  target_hizbs: number[];
  completed_hizbs: number[];
};

type PersistedSession = {
  student_id: number;
  full_name_ar: string;
  target_hizbs: number[];
  completed_hizbs: number[];
  activeHizb: number | null;
  ratingOpen: boolean;
  mistakes: number;
  alerts: number;
  lahn: number;
  elapsedSec: number;
  timerRunning: boolean;
  timerSavedAt: number | null;
};

type SessionSummary = Awaited<ReturnType<typeof api.publicQuranicDayStudentSummary>>;

function storageKey(token: string) {
  return `basateen-quranic-session-${token}`;
}

function readSession(token: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

function writeSession(token: string, data: PersistedSession | null) {
  if (!data) {
    localStorage.removeItem(storageKey(token));
    return;
  }
  localStorage.setItem(storageKey(token), JSON.stringify(data));
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function nextAvailableHizb(student: StudentState): number | null {
  return student.target_hizbs.find((h) => !student.completed_hizbs.includes(h)) ?? null;
}

export function PublicQuranicDayPage() {
  const { token = "" } = useParams<{ token: string }>();

  const [day, setDay] = useState<DayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<
    Array<{ student_id: number; full_name_ar: string; target_hizbs: number[] }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [student, setStudent] = useState<StudentState | null>(null);

  const [activeHizb, setActiveHizb] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);

  const [mistakes, setMistakes] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [lahn, setLahn] = useState(0);

  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const persistSnapshot = useCallback((): PersistedSession | null => {
    if (!student) return null;
    return {
      student_id: student.student_id,
      full_name_ar: student.full_name_ar,
      target_hizbs: student.target_hizbs,
      completed_hizbs: student.completed_hizbs,
      activeHizb,
      ratingOpen,
      mistakes,
      alerts,
      lahn,
      elapsedSec,
      timerRunning,
      timerSavedAt: timerRunning ? Date.now() : null,
    };
  }, [
    student,
    activeHizb,
    ratingOpen,
    mistakes,
    alerts,
    lahn,
    elapsedSec,
    timerRunning,
  ]);

  useEffect(() => {
    if (!token || !student) {
      writeSession(token, null);
      return;
    }
    writeSession(token, persistSnapshot());
  }, [token, student, persistSnapshot]);

  const loadDay = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicQuranicDayGet(token);
      setDay({
        name_ar: res.day.name_ar,
        event_date: res.day.event_date,
        fail_threshold: res.day.fail_threshold,
        hizb_time_limit: res.day.hizb_time_limit,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "الرابط غير صالح");
      setDay(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshStudent = useCallback(
    async (studentId: number) => {
      const res = await api.publicQuranicDayGetStudent(token, studentId);
      setStudent({
        student_id: res.student.student_id,
        full_name_ar: res.student.full_name_ar,
        target_hizbs: res.student.target_hizbs,
        completed_hizbs: res.student.completed_hizbs ?? [],
      });
      setDay({
        name_ar: res.day.name_ar,
        event_date: res.day.event_date,
        fail_threshold: res.day.fail_threshold,
        hizb_time_limit: res.day.hizb_time_limit,
      });
      return res;
    },
    [token],
  );

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    if (!token || loading || restoredRef.current) return;
    restoredRef.current = true;
    const saved = readSession(token);
    if (!saved?.student_id) return;

    void (async () => {
      try {
        await refreshStudent(saved.student_id);
        setQuery(saved.full_name_ar);
        if (saved.ratingOpen && saved.activeHizb != null) {
          setActiveHizb(saved.activeHizb);
          setRatingOpen(true);
          setMistakes(saved.mistakes);
          setAlerts(saved.alerts);
          setLahn(saved.lahn);
          let elapsed = saved.elapsedSec;
          if (saved.timerRunning && saved.timerSavedAt) {
            elapsed += Math.floor((Date.now() - saved.timerSavedAt) / 1000);
            startedAtRef.current = Date.now() - elapsed * 1000;
            setTimerRunning(true);
          }
          setElapsedSec(elapsed);
          setInfoMsg("تم استرجاع جلسة الرصد من الجلسة السابقة.");
        }
      } catch {
        writeSession(token, null);
      }
    })();
  }, [token, loading, refreshStudent]);

  useEffect(() => {
    if (!token || query.trim().length < 1) {
      setSearchItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.publicQuranicDaySearchStudents(token, query.trim());
        setSearchItems(res.items);
      } catch {
        setSearchItems([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [token, query]);

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const limitSec = (day?.hizb_time_limit ?? 10) * 60;
  const overTime = timerRunning && elapsedSec > limitSec;
  const failWarn = mistakes >= (day?.fail_threshold ?? 3);

  function stopTimer(): number {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    const sec =
      startedAtRef.current != null
        ? Math.floor((Date.now() - startedAtRef.current) / 1000)
        : elapsedSec;
    return sec;
  }

  function startTimer() {
    startedAtRef.current = Date.now() - elapsedSec * 1000;
    setTimerRunning(true);
  }

  function openHizb(h: number, st: StudentState) {
    if (st.completed_hizbs.includes(h)) return;
    setActiveHizb(h);
    setRatingOpen(true);
    setMistakes(0);
    setAlerts(0);
    setLahn(0);
    setTimerRunning(false);
    setElapsedSec(0);
    startedAtRef.current = null;
    setInfoMsg(null);
  }

  function closeRating() {
    stopTimer();
    setRatingOpen(false);
    setActiveHizb(null);
  }

  async function pickStudent(s: { student_id: number; full_name_ar: string }) {
    setQuery(s.full_name_ar);
    setSearchItems([]);
    setError(null);
    setInfoMsg(null);
    try {
      await refreshStudent(s.student_id);
      closeRating();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الطالب");
    }
  }

  function clearStudentSession() {
    closeRating();
    setStudent(null);
    setQuery("");
    setSearchItems([]);
    writeSession(token, null);
  }

  async function saveAndClose() {
    if (!student || activeHizb == null) return;
    const timeSec = stopTimer();
    setSaving(true);
    setError(null);
    try {
      const res = await api.publicQuranicDaySaveRecord(token, {
        student_id: student.student_id,
        hizb_number: activeHizb,
        mistakes,
        alerts,
        lahn_count: lahn,
        time_taken_seconds: timeSec,
      });
      if (res.fail_threshold_exceeded) {
        setError("تنبيه: تجاوز حد الرسوب في هذا الحزب — تم الحفظ.");
      }

      const updated: StudentState = {
        ...student,
        completed_hizbs: res.completed_hizbs,
      };
      setStudent(updated);

      const next = nextAvailableHizb(updated);
      if (next != null) {
        openHizb(next, updated);
        setInfoMsg(`تم الحفظ — الحزب ${next} جاهز للقراءة.`);
      } else {
        closeRating();
        setInfoMsg("اكتملت جميع أحزاب هذا الطالب لهذا اليوم.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function endStudentSession() {
    if (!student) return;
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await api.publicQuranicDayStudentSummary(token, student.student_id);
      setSummary(res);
      setSummaryOpen(true);
      clearStudentSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إنهاء الجلسة");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="max-w-md mx-auto px-4 py-6 space-y-5 pb-24">
        <header className="text-center space-y-1 border-b border-border pb-4">
          <h1 className="text-xl font-bold text-primary" style={tajawal}>
            {day?.name_ar ?? "اليوم القرآني"}
          </h1>
          {day?.event_date && (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              {day.event_date}
            </p>
          )}
          <p className="text-xs text-muted-foreground" style={tajawal}>
            رصد المقرئ — بحث مباشر
          </p>
        </header>

        {loading && (
          <p
            className="text-center text-muted-foreground text-sm flex justify-center gap-2"
            style={tajawal}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري التحميل…
          </p>
        )}

        {error && (
          <p className={cn(ds.alert.error, "text-center text-sm")} style={tajawal}>
            {error}
          </p>
        )}
        {infoMsg && !error && (
          <p className={cn(ds.alert.info, "text-center text-sm")} style={tajawal}>
            {infoMsg}
          </p>
        )}

        {!loading && day && !ratingOpen && (
          <>
            {!student && (
              <div className="space-y-2">
                <Label style={tajawal}>بحث عن الطالب</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="اكتب اسم الطالب…"
                  className={ds.btnRound}
                  autoComplete="off"
                  autoFocus
                />
                {searchLoading && (
                  <p
                    className="text-xs text-muted-foreground flex items-center gap-1"
                    style={tajawal}
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جاري البحث…
                  </p>
                )}
                {searchItems.length > 0 && (
                  <ul className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
                    {searchItems.map((s) => (
                      <li key={s.student_id}>
                        <button
                          type="button"
                          className="w-full text-right px-4 py-3 text-sm hover:bg-muted border-b border-border last:border-0"
                          onClick={() => pickStudent(s)}
                          style={tajawal}
                        >
                          {s.full_name_ar}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {student && (
              <div className="space-y-4">
                <div className={`${ds.card} p-4 space-y-3`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-bold" style={tajawal}>
                        {student.full_name_ar}
                      </p>
                      <p className="text-xs text-muted-foreground" style={tajawal}>
                        {student.completed_hizbs.length} / {student.target_hizbs.length} حزب
                        مكتمل
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={ds.btnRound}
                      onClick={clearStudentSession}
                      style={tajawal}
                    >
                      تغيير
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    className={`w-full ${ds.btnRound}`}
                    disabled={summaryLoading}
                    onClick={() => endStudentSession()}
                    style={tajawal}
                  >
                    {summaryLoading ? "جاري الإنهاء…" : "إنهاء جلسة الطالب بالكامل"}
                  </Button>
                </div>

                <Label style={tajawal}>اختر الحزب المقروء</Label>
                <div className="grid grid-cols-6 gap-2">
                  {student.target_hizbs.map((n) => {
                    const done = student.completed_hizbs.includes(n);
                    return (
                      <Button
                        key={n}
                        type="button"
                        variant={done ? "default" : "outline"}
                        disabled={done}
                        className={cn(
                          `${ds.btnRound} h-11 font-semibold relative`,
                          done &&
                            "bg-emerald-600 hover:bg-emerald-600 text-white border-emerald-600 opacity-100",
                        )}
                        onClick={() => openHizb(n, student)}
                      >
                        {done ? (
                          <span className="flex items-center justify-center gap-0.5">
                            <Check className="w-3.5 h-3.5" />
                            {n}
                          </span>
                        ) : (
                          n
                        )}
                        {done && (
                          <Lock className="w-2.5 h-2.5 absolute top-1 left-1 opacity-70" />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {ratingOpen && student && activeHizb != null && day && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className={`${ds.card} p-4 text-center border-2`}>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                {student.full_name_ar}
              </p>
              <p className="text-2xl font-bold text-primary mt-1">الحزب {activeHizb}</p>
            </div>

            <div
              className={cn(
                `${ds.card} p-4 space-y-3 border-2`,
                overTime && "border-destructive bg-destructive/5",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock
                  className={cn("w-6 h-6", overTime ? "text-destructive" : "text-primary")}
                />
                <span
                  className={cn(
                    "text-3xl font-mono font-bold tabular-nums",
                    overTime && "text-destructive",
                  )}
                >
                  {formatTimer(elapsedSec)}
                </span>
              </div>
              <p className="text-center text-xs text-muted-foreground" style={tajawal}>
                الحد: {day.hizb_time_limit} دقيقة
                {overTime && " — تجاوز الوقت!"}
              </p>
              {!timerRunning ? (
                <Button
                  type="button"
                  variant="default"
                  className={`w-full h-12 text-lg ${ds.btnRound}`}
                  onClick={startTimer}
                  style={tajawal}
                >
                  بدء القراءة
                </Button>
              ) : (
                <p className="text-center text-sm text-primary font-medium" style={tajawal}>
                  العداد يعمل…
                </p>
              )}
            </div>

            {failWarn && (
              <p
                className="flex items-center justify-center gap-2 text-destructive font-bold text-sm bg-destructive/10 rounded-xl py-3 px-4"
                style={tajawal}
              >
                <AlertTriangle className="w-5 h-5" />
                تجاوز حد الرسوب ({day.fail_threshold} أخطاء)
              </p>
            )}

            <CounterBlock
              label="أخطاء"
              value={mistakes}
              onDec={() => setMistakes((m) => Math.max(0, m - 1))}
              onInc={() => setMistakes((m) => m + 1)}
              variant="error"
            />
            <CounterBlock
              label="لحون"
              value={lahn}
              onDec={() => setLahn((v) => Math.max(0, v - 1))}
              onInc={() => setLahn((v) => v + 1)}
              icon={<Music2 className="w-5 h-5" />}
            />
            <CounterBlock
              label="تنبيهات"
              value={alerts}
              onDec={() => setAlerts((a) => Math.max(0, a - 1))}
              onInc={() => setAlerts((a) => a + 1)}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className={`flex-1 h-12 ${ds.btnRound}`}
                onClick={closeRating}
                style={tajawal}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                variant="default"
                className={`flex-[2] h-14 text-lg ${ds.btnRound}`}
                disabled={saving}
                onClick={() => saveAndClose()}
                style={tajawal}
              >
                {saving ? "جاري الحفظ…" : "حفظ وإغلاق"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className={`${ds.card} max-w-sm rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تقرير لحظي — فحص النتيجة</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-4 text-sm" style={tajawal}>
              <p className="font-bold text-base">{summary.student_name}</p>
              <div className="grid grid-cols-2 gap-2">
                <StatPill label="الأحزاب المقروءة" value={String(summary.hizbs_read)} />
                <StatPill label="إجمالي الأخطاء" value={String(summary.total_mistakes)} />
                <StatPill label="اللحون" value={String(summary.total_lahn)} />
                <StatPill label="التنبيهات" value={String(summary.total_alerts)} />
              </div>
              <div
                className={cn(
                  "rounded-xl py-4 px-3 text-center font-bold text-base",
                  summary.status === "passed" &&
                    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  summary.status === "failed" &&
                    "bg-destructive/15 text-destructive",
                  summary.status === "none" && "bg-muted text-muted-foreground",
                )}
              >
                {summary.status === "passed" && (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    ناجح
                  </span>
                )}
                {summary.status === "failed" && (
                  <span className="flex items-center justify-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    راسب / تحذير (حد {summary.fail_threshold} أخطاء)
                  </span>
                )}
                {summary.status === "none" && "لا توجد قراءات مسجّلة"}
              </div>
              <Button
                type="button"
                className={`w-full ${ds.btnRound}`}
                onClick={() => setSummaryOpen(false)}
              >
                إغلاق
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CounterBlock({
  label,
  value,
  onDec,
  onInc,
  variant,
  icon,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  variant?: "error";
  icon?: React.ReactNode;
}) {
  return (
    <div className={`${ds.card} p-4 border-2`}>
      <p
        className={cn(
          "text-center font-bold mb-2 flex items-center justify-center gap-2",
          variant === "error" && "text-destructive",
        )}
        style={tajawal}
      >
        {icon}
        {label}
      </p>
      <p className="text-4xl font-bold text-center mb-3 tabular-nums">{value}</p>
      <div className="flex gap-3 justify-center">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`${ds.btnRound} h-14 w-14`}
          onClick={onDec}
        >
          <Minus className="w-6 h-6" />
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          className={`${ds.btnRound} h-14 w-14`}
          onClick={onInc}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
