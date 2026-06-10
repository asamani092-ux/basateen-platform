import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { AlertTriangle, Minus, Plus, Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  target_hizb?: number;
  target_juz?: number;
};

type AuditRow = {
  student_id: number;
  attendance?: string;
  juz_done?: number;
  hizb_done?: number;
  alerts_count?: number;
  errors_count?: number;
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
  const [sessionName, setSessionName] = useState("");
  const [kind, setKind] = useState<"yom_himma" | "competition">("yom_himma");
  const [rules, setRules] = useState({
    fail_threshold_errors: 3,
    alerts_per_error: 5,
  });
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [audit, setAudit] = useState<Record<number, AuditRow>>({});
  const [query, setQuery] = useState("");
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
      setSessionName(String(data.session.name_ar ?? ""));
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
        target_juz: Number(s.target_juz ?? 0),
      }));
      setStudents(studs);
      const a: Record<number, AuditRow> = {};
      for (const row of (data.audit ?? []) as AuditRow[]) {
        a[row.student_id] = row;
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
    () => students.filter((s) => matchesArabicName(query, s.full_name_ar)),
    [students, query],
  );

  const active = activeId
    ? students.find((s) => s.student_id === activeId)
    : null;
  const activeAudit = activeId
    ? audit[activeId] ?? {
        attendance: "present",
        juz_done: 0,
        hizb_done: 0,
        alerts_count: 0,
        errors_count: 0,
        current_hizb_failed: 0,
      }
    : null;

  const failed =
    activeAudit &&
    (activeAudit.current_hizb_failed === 1 ||
      Number(activeAudit.errors_count ?? 0) >= rules.fail_threshold_errors);

  async function saveAudit(patch: Record<string, unknown>) {
    if (!token || !activeId) return;
    setSaving(true);
    try {
      const res = await api.liveLogUpsert(
        token,
        {
          student_id: activeId,
          ...patch,
        },
        verifiedPinRef.current,
      );
      setAudit((prev) => ({
        ...prev,
        [activeId]: {
          ...prev[activeId],
          student_id: activeId,
          ...patch,
          current_hizb_failed: res.failed ? 1 : 0,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  function bump(field: "delta_hizb" | "delta_juz" | "delta_alert" | "delta_error", d: number) {
    if (!activeId || !activeAudit) return;
    const next = { ...activeAudit };
    if (field === "delta_hizb") next.hizb_done = Number(next.hizb_done ?? 0) + d;
    if (field === "delta_juz") next.juz_done = Number(next.juz_done ?? 0) + d;
    if (field === "delta_alert") next.alerts_count = Number(next.alerts_count ?? 0) + d;
    if (field === "delta_error") next.errors_count = Number(next.errors_count ?? 0) + d;
    setAudit((p) => ({ ...p, [activeId]: next }));
    void saveAudit({ [field]: d });
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
            أدخل رمز الدخول (PIN) الممنوح لك لفتح بطاقة الرصد الميداني.
          </p>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="أدخل رمز PIN"
            className={ds.btnRound}
            style={tajawal}
          />
          {error && (
            <p className={ds.alert.error} style={tajawal}>
              {error}
            </p>
          )}
          <Button type="button" className={ds.btnRound} onClick={verifyPin} disabled={gateLoading || !pin.trim()} style={tajawal}>
            {gateLoading ? "جارٍ التحقق..." : "دخول الرصد"}
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
      </header>

      {error && (
        <p className={`${ds.alert.error} mb-4`} style={tajawal}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground" style={tajawal}>
          جاري التحميل…
        </p>
      ) : !active ? (
        <div className="space-y-4 max-w-lg mx-auto">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="ابحث باسم الطالب…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${ds.btnRound} h-14 text-lg pr-12`}
              style={tajawal}
              autoFocus
            />
          </div>
          <ul className="space-y-2">
            {filtered.map((s) => (
              <li key={s.student_id}>
                <button
                  type="button"
                  className={`${ds.card} w-full p-4 text-right font-semibold text-lg touch-manipulation hover:ring-2 hover:ring-primary`}
                  style={tajawal}
                  onClick={() => setActiveId(s.student_id)}
                >
                  {s.full_name_ar}
                  {s.target_hizb ? (
                    <span className="block text-xs font-normal text-muted-foreground mt-1">
                      مستهدف اليوم: {s.target_hizb} حزب
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p className={ds.alert.info} style={tajawal}>
              لا يوجد طالب بهذا الاسم في هذه الفعالية.
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

          <div className={`${ds.card} p-4 ${failed ? "ring-2 ring-destructive bg-destructive/5" : ""}`}>
            <h2 className="text-lg font-bold mb-2" style={tajawal}>
              {active.full_name_ar}
            </h2>
            {failed && (
              <p
                className="text-destructive font-bold flex items-center gap-2 mb-3"
                style={tajawal}
              >
                <AlertTriangle className="w-5 h-5" />
                راسب في هذا الحزب
              </p>
            )}

            <p className="text-sm text-muted-foreground mb-4" style={tajawal}>
              المستهدف: {active.target_hizb ?? 0} حزب (1 جزء = 2 أحزاب)
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <MetricBlock
                label="أحزاب منجزة"
                value={Number(activeAudit?.hizb_done ?? 0)}
                onMinus={() => bump("delta_hizb", -1)}
                onPlus={() => bump("delta_hizb", 1)}
                disabled={!!failed || saving}
              />
              <MetricBlock
                label="أجزاء"
                value={Number(activeAudit?.juz_done ?? 0)}
                onMinus={() => bump("delta_juz", -1)}
                onPlus={() => bump("delta_juz", 1)}
                disabled={!!failed || saving}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={`${ds.btnRound} flex-1 min-h-12`}
                disabled={saving || !!failed}
                onClick={() => bump("delta_alert", 1)}
                style={tajawal}
              >
                + تنبيه ({activeAudit?.alerts_count ?? 0})
              </Button>
              <Button
                type="button"
                variant="destructive"
                className={`${ds.btnRound} flex-1 min-h-12`}
                disabled={saving || !!failed}
                onClick={() => bump("delta_error", 1)}
                style={tajawal}
              >
                + خطأ ({activeAudit?.errors_count ?? 0})
              </Button>
            </div>

            <Button
              type="button"
              className={`${ds.btnRound} w-full mt-4 min-h-12`}
              disabled={saving}
              onClick={() => saveAudit({})}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : "تأكيد وحفظ الرصد"}
            </Button>
          </div>

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
