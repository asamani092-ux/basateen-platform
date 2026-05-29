import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  Music2,
  Plus,
} from "lucide-react";
import { Button } from "../../components/ui/button";
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

type StudentPick = {
  student_id: number;
  full_name_ar: string;
  target_hizbs: number[];
};

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PublicQuranicDayPage() {
  const { token = "" } = useParams<{ token: string }>();

  const [day, setDay] = useState<DayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<StudentPick[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [student, setStudent] = useState<StudentPick | null>(null);

  const [activeHizb, setActiveHizb] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);

  const [mistakes, setMistakes] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [lahn, setLahn] = useState(0);

  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    loadDay();
  }, [loadDay]);

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
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setTimerRunning(true);
  }

  function openHizb(h: number) {
    setActiveHizb(h);
    setRatingOpen(true);
    setMistakes(0);
    setAlerts(0);
    setLahn(0);
    setTimerRunning(false);
    setElapsedSec(0);
    startedAtRef.current = null;
  }

  function closeRating() {
    stopTimer();
    setRatingOpen(false);
    setActiveHizb(null);
  }

  async function pickStudent(s: StudentPick) {
    setQuery(s.full_name_ar);
    setSearchItems([]);
    setError(null);
    try {
      const res = await api.publicQuranicDayGetStudent(token, s.student_id);
      setStudent({
        student_id: res.student.student_id,
        full_name_ar: res.student.full_name_ar,
        target_hizbs: res.student.target_hizbs,
      });
      setDay({
        name_ar: res.day.name_ar,
        event_date: res.day.event_date,
        fail_threshold: res.day.fail_threshold,
        hizb_time_limit: res.day.hizb_time_limit,
      });
      closeRating();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الطالب");
    }
  }

  function resetSession() {
    closeRating();
    setStudent(null);
    setQuery("");
    setSearchItems([]);
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
        setError("تنبيه: تجاوز حد الرسوب — تم الحفظ.");
      }
      setSavedFlash(true);
      closeRating();
      setStudent(null);
      setQuery("");
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
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
          <p className="text-center text-muted-foreground text-sm flex justify-center gap-2" style={tajawal}>
            <Loader2 className="w-4 h-4 animate-spin" />
            جاري التحميل…
          </p>
        )}

        {error && (
          <p className={cn(ds.alert.error, "text-center text-sm")} style={tajawal}>
            {error}
          </p>
        )}

        {savedFlash && (
          <p className="flex items-center justify-center gap-2 text-primary font-medium text-sm" style={tajawal}>
            <CheckCircle2 className="w-5 h-5" />
            تم الحفظ — جاهز للطالب التالي
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1" style={tajawal}>
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
                <div className={`${ds.card} p-4 flex justify-between items-center gap-2`}>
                  <div>
                    <p className="font-bold" style={tajawal}>
                      {student.full_name_ar}
                    </p>
                    <p className="text-xs text-muted-foreground" style={tajawal}>
                      {student.target_hizbs.length} حزب في النطاق
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ds.btnRound}
                    onClick={resetSession}
                    style={tajawal}
                  >
                    تغيير
                  </Button>
                </div>

                <Label style={tajawal}>اختر الحزب المقروء</Label>
                <div className="grid grid-cols-6 gap-2">
                  {student.target_hizbs.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant="outline"
                      className={`${ds.btnRound} h-11 font-semibold`}
                      onClick={() => openHizb(n)}
                    >
                      {n}
                    </Button>
                  ))}
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
                <Clock className={cn("w-6 h-6", overTime ? "text-destructive" : "text-primary")} />
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
