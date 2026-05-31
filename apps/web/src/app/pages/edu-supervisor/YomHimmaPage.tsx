import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, Copy, Link2, Minus, Plus } from "lucide-react";
import { HubTabs } from "../../components/hub/HubTabs";
import { TvLaunchButton } from "../../components/hub/TvLaunchButton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { TargetPicker, type TargetSelection } from "../../components/edu/TargetPicker";
import { EDUCATIONAL_STAGES } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

const HIMMA_TABS = [
  { id: "setup", label: "إعداد الفعالية" },
  { id: "live", label: "الرصد اللحظي" },
  { id: "reports", label: "التقارير والشهادات" },
];

type Rules = {
  hizb_points: number;
  alert_penalty: number;
  error_penalty: number;
  alerts_per_error: number;
  fail_threshold_errors: number;
  access_pin?: string;
};

type TargetRow = {
  student_id: number;
  full_name_ar: string;
  target_hizb: number;
};

type AuditState = {
  attendance: "present" | "absent";
  juz_done: number;
  hizb_done: number;
  alerts_count: number;
  errors_count: number;
  current_hizb_failed: number;
};

const DEFAULT_RULES: Rules = {
  hizb_points: 1,
  alert_penalty: 1,
  error_penalty: 2,
  alerts_per_error: 5,
  fail_threshold_errors: 3,
  access_pin: "1234",
};

export function YomHimmaPage() {
  const { user } = useAuth();
  const readOnly = user?.role === "general_manager";
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "setup";

  const [sessions, setSessions] = useState<
    Array<{ id: number; name_ar: string; tv_launch_key: string }>
  >([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [launchKey, setLaunchKey] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [sessionDate, setSessionDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [picker, setPicker] = useState<TargetSelection>({
    student_ids: [],
    circle_ids: [],
    track_ids: [],
  });
  const [defaultHizb, setDefaultHizb] = useState(2);
  const [audit, setAudit] = useState<Record<number, AuditState>>({});
  const [error, setError] = useState<string | null>(null);
  const [liveLogUrl, setLiveLogUrl] = useState<string | null>(null);
  const [liveLogPin, setLiveLogPin] = useState<string | null>(null);

  const setTab = (id: string) => setSearchParams({ tab: id });

  const loadSessions = useCallback(async () => {
    if (!getApiToken()) return;
    try {
      const res = await api.yomHimmaList();
      setSessions(res.items);
      if (res.items[0] && !sessionId) {
        setSessionId(res.items[0].id);
        setLaunchKey(res.items[0].tv_launch_key);
      }
    } catch {
      /* mock offline */
    }
  }, [sessionId]);

  const loadDetail = useCallback(async (id: number) => {
    if (!getApiToken()) return;
    try {
      const d = await api.yomHimmaDetail(id);
      const sess = d.session as {
        name_ar: string;
        tv_launch_key: string;
        rules: Rules;
      };
      setNameAr(sess.name_ar);
      setLaunchKey(sess.tv_launch_key);
      setRules(sess.rules ?? DEFAULT_RULES);
      const t = (d.targets as Array<Record<string, unknown>>).map((r) => ({
        student_id: Number(r.student_id),
        full_name_ar: String(r.full_name_ar ?? ""),
        target_hizb: Number(r.target_hizb ?? 0),
      }));
      setTargets(t);
      const a: Record<number, AuditState> = {};
      for (const row of d.audit as Array<Record<string, unknown>>) {
        const sid = Number(row.student_id);
        a[sid] = {
          attendance: (row.attendance as "present" | "absent") ?? "present",
          juz_done: Number(row.juz_done ?? 0),
          hizb_done: Number(row.hizb_done ?? 0),
          alerts_count: Number(row.alerts_count ?? 0),
          errors_count: Number(row.errors_count ?? 0),
          current_hizb_failed: Number(row.current_hizb_failed ?? 0),
        };
      }
      setAudit(a);
    } catch {
      /* keep local */
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!getApiToken()) return;
    api.eduDeptSettingsGet().then((res) => {
      const h = res.settings.himma_defaults;
      if (h) {
        setRules((r) => ({
          ...r,
          hizb_points: h.hizb_points,
          alert_penalty: h.alert_penalty,
          error_penalty: h.error_penalty,
          alerts_per_error: h.alerts_per_error,
          fail_threshold_errors: h.fail_threshold_errors,
        }));
      }
    }).catch(() => {
      /* offline mock */
    });
  }, []);

  useEffect(() => {
    if (sessionId) loadDetail(sessionId);
  }, [sessionId, loadDetail]);

  async function generateLiveLogLink() {
    if (!sessionId || readOnly) return;
    setError(null);
    try {
      const res = await api.yomHimmaLiveLogToken(sessionId);
      const url = `${window.location.origin}/live-log/${res.live_log_token}`;
      setLiveLogUrl(url);
      setLiveLogPin(res.access_pin);
      await navigator.clipboard.writeText(`رابط الرصد: ${url}\nرمز الدخول: ${res.access_pin}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد الرابط");
    }
  }

  useEffect(() => {
    if (readOnly || !getApiToken()) return;
    api.eduTargetOptions().then((res) => {
      const studs = res.students as Array<Record<string, unknown>>;
      if (picker.student_ids.length === 0 && studs.length) {
        setPicker((p) => ({
          ...p,
          student_ids: studs.slice(0, 5).map((s) => Number(s.id)),
        }));
      }
    });
  }, [readOnly, picker.student_ids.length]);

  async function createSession() {
    if (readOnly) return;
    setError(null);
    const targetPayload =
      picker.student_ids.length > 0
        ? picker.student_ids.map((sid) => ({
            student_id: sid,
            target_hizb: defaultHizb,
          }))
        : targets.map((t) => ({
            student_id: t.student_id,
            target_hizb: t.target_hizb,
          }));
    try {
      const res = await api.yomHimmaCreate({
        name_ar: nameAr,
        session_date: sessionDate,
        rules,
        scope: {
          circle_ids: picker.circle_ids,
          track_ids: picker.track_ids,
        },
        targets: targetPayload,
      });
      setSessionId(res.id);
      setLaunchKey(res.tv_launch_key);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    }
  }

  function ensureAudit(studentId: number): AuditState {
    return (
      audit[studentId] ?? {
        attendance: "present",
        juz_done: 0,
        hizb_done: 0,
        alerts_count: 0,
        errors_count: 0,
        current_hizb_failed: 0,
      }
    );
  }

  async function patchAudit(
    studentId: number,
    patch: Partial<AuditState> & {
      delta_alert?: number;
      delta_error?: number;
      delta_hizb?: number;
    },
  ) {
    const next = { ...ensureAudit(studentId), ...patch };
    setAudit((prev) => ({ ...prev, [studentId]: next }));
    if (!sessionId || readOnly) return;
    try {
      const res = await api.yomHimmaAudit(sessionId, {
        student_id: studentId,
        ...patch,
      });
      if (res.failed) {
        setAudit((prev) => ({
          ...prev,
          [studentId]: { ...next, current_hizb_failed: 1 },
        }));
      }
    } catch {
      /* local only */
    }
  }

  const demoTargets = useMemo<TargetRow[]>(() => {
    if (targets.length) return targets;
    return [
      { student_id: 1, full_name_ar: "طالب تجريبي ١", target_hizb: 3 },
      { student_id: 2, full_name_ar: "طالب تجريبي ٢", target_hizb: 2 },
    ];
  }, [targets]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            يوم الهمة القرآني
          </h2>
          <p className={ds.page.description} style={tajawal}>
            {readOnly
              ? "وضع مراقب أعلى — اطلاع فقط"
              : "المشرف التعليمي — تشغيل ميداني"}
          </p>
        </div>
        {launchKey && user?.role !== "general_manager" && (
          <TvLaunchButton launchKey={launchKey} sessionId={sessionId ?? undefined} />
        )}
        {launchKey && user?.role === "general_manager" && (
          <p className="text-xs text-muted-foreground" style={tajawal}>
            مفتاح البث يظهر للمشرف العام الميداني
          </p>
        )}
      </div>

      {sessions.length > 0 && (
        <select
          className="rounded-xl border border-border bg-background px-3 py-2 max-w-md"
          value={sessionId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            setSessionId(id);
            const s = sessions.find((x) => x.id === id);
            if (s) setLaunchKey(s.tv_launch_key);
          }}
          style={tajawal}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ar}
            </option>
          ))}
        </select>
      )}

      <HubTabs tabs={HIMMA_TABS} active={tab} onChange={setTab} />

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {tab === "setup" && (
        <div className="space-y-4">
          <Card className={ds.card}>
            <CardHeader>
              <CardTitle style={tajawal}>بيانات الفعالية</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold" style={tajawal}>
                  اسم اليوم
                </label>
                <Input
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  disabled={readOnly}
                  className={ds.btnRound}
                />
              </div>
              <div>
                <label className="text-sm font-semibold" style={tajawal}>
                  التاريخ
                </label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  disabled={readOnly}
                  className={ds.btnRound}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold" style={tajawal}>
                  المرحلة (اختياري)
                </label>
                <select
                  className="w-full rounded-xl border border-border px-3 py-2"
                  style={tajawal}
                  disabled={readOnly}
                >
                  {EDUCATIONAL_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className={ds.card}>
            <CardHeader>
              <CardTitle style={tajawal}>قوانين الحساب والخصم</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["hizb_points", "درجة الحزب"],
                  ["alert_penalty", "خصم تنبيه"],
                  ["error_penalty", "خصم خطأ/لحن"],
                  ["alerts_per_error", "تنبيهات = خطأ"],
                  ["fail_threshold_errors", "حد الرسوب"],
                  ["access_pin", "رمز دخول المقرئ (PIN)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-semibold" style={tajawal}>
                    {label}
                  </label>
                  <Input
                    type={key === "access_pin" ? "text" : "number"}
                    value={rules[key]}
                    disabled={readOnly}
                    onChange={(e) =>
                      setRules((r) => ({
                        ...r,
                        [key]:
                          key === "access_pin"
                            ? e.target.value
                            : Number(e.target.value),
                      }))
                    }
                    className={ds.btnRound}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {!readOnly && (
            <>
              <TargetPicker value={picker} onChange={setPicker} />
              <div>
                <label className="text-sm font-semibold" style={tajawal}>
                  أحزاب مستهدفة افتراضية للمختارين
                </label>
                <Input
                  type="number"
                  value={defaultHizb}
                  onChange={(e) => setDefaultHizb(Number(e.target.value))}
                  className={`${ds.btnRound} max-w-xs mt-1`}
                />
              </div>
            </>
          )}

          <Card className={ds.card}>
            <CardHeader>
              <CardTitle style={tajawal}>مستهدفات الطلاب</CardTitle>
              <CardDescription style={tajawal}>
                عدد الأحزاب/الأجزاء لكل طالب — بطاقات مرنة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {demoTargets.map((t) => (
                  <div key={t.student_id} className={`${ds.card} p-4 space-y-2 text-right`}>
                    <p className="font-semibold" style={tajawal}>
                      {t.full_name_ar}
                    </p>
                    <label className="text-xs text-muted-foreground block" style={tajawal}>
                      أحزاب مستهدفة
                    </label>
                    <Input
                      type="number"
                      min={0}
                      disabled={readOnly}
                      value={t.target_hizb}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTargets((rows) =>
                          rows.map((r) =>
                            r.student_id === t.student_id ? { ...r, target_hizb: v } : r,
                          ),
                        );
                      }}
                      className="w-full max-w-[120px]"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {!readOnly && (
            <Button className={ds.btnRound} onClick={createSession} style={tajawal}>
              حفظ وإنشاء الجلسة
            </Button>
          )}

          {sessionId && !readOnly && (
            <Card className={`${ds.card} border-primary/30`}>
              <CardHeader>
                <CardTitle style={tajawal}>الرصد التشاركي الميداني</CardTitle>
                <CardDescription style={tajawal}>
                  شارك الرابط مع المقرئين، مع رمز PIN لحماية بوابة الرصد الخارجية
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  className={ds.btnRound}
                  onClick={generateLiveLogLink}
                  style={tajawal}
                >
                  <Link2 className="w-4 h-4" />
                  توليد وتفعيل رابط الرصد التشاركي
                </Button>
                {liveLogUrl && (
                  <div className={ds.alert.info}>
                    <code className="text-xs break-all block mb-2" dir="ltr">
                      {liveLogUrl}
                    </code>
                    {liveLogPin && (
                      <p className="text-sm font-semibold mb-2" style={tajawal}>
                        رمز الدخول (PIN): <span dir="ltr">{liveLogPin}</span>
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={ds.btnRound}
                      onClick={() =>
                        navigator.clipboard.writeText(
                          liveLogPin
                            ? `رابط الرصد: ${liveLogUrl}
رمز الدخول: ${liveLogPin}`
                            : liveLogUrl,
                        )
                      }
                      style={tajawal}
                    >
                      <Copy className="w-4 h-4" />
                      نسخ الرابط + PIN
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "live" && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>الرصد اللحظي</CardTitle>
            <CardDescription style={tajawal}>
              حاضر / غائب فقط — +/- للأحزاب — تنبيه وخطأ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {demoTargets.map((t) => {
              const a = ensureAudit(t.student_id);
              const eff =
                a.errors_count +
                Math.floor(a.alerts_count / Math.max(rules.alerts_per_error, 1));
              const failed =
                a.current_hizb_failed === 1 ||
                eff >= rules.fail_threshold_errors;
              return (
                <div
                  key={t.student_id}
                  className={`rounded-2xl border p-4 ${failed ? "border-destructive bg-destructive/10" : "border-border"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="font-bold text-foreground" style={tajawal}>
                      {t.full_name_ar}
                    </span>
                    {failed && (
                      <span className="flex items-center gap-1 text-destructive text-sm font-bold" style={tajawal}>
                        <AlertTriangle className="w-4 h-4" />
                        راسب في هذا الحزب
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Button
                      size="sm"
                      variant={a.attendance === "present" ? "default" : "outline"}
                      disabled={readOnly || failed}
                      onClick={() => patchAudit(t.student_id, { attendance: "present" })}
                      style={tajawal}
                    >
                      حاضر
                    </Button>
                    <Button
                      size="sm"
                      variant={a.attendance === "absent" ? "destructive" : "outline"}
                      disabled={readOnly}
                      onClick={() => patchAudit(t.student_id, { attendance: "absent" })}
                      style={tajawal}
                    >
                      غائب
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={readOnly || failed}
                      onClick={() => patchAudit(t.student_id, { delta_hizb: -1 })}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span style={tajawal}>أحزاب: {a.hizb_done}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={readOnly || failed}
                      onClick={() => patchAudit(t.student_id, { delta_hizb: 1 })}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={readOnly || failed}
                      onClick={() => patchAudit(t.student_id, { delta_alert: 1 })}
                      style={tajawal}
                    >
                      تنبيه ({a.alerts_count})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={readOnly || failed}
                      onClick={() => patchAudit(t.student_id, { delta_error: 1 })}
                      style={tajawal}
                    >
                      خطأ ({a.errors_count})
                    </Button>
                  </div>
                </div>
              );
            })}
            {!readOnly && launchKey && (
              <TvLaunchButton launchKey={launchKey} sessionId={sessionId ?? undefined} />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "reports" && (
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>التقارير والشهادات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {demoTargets.map((t) => {
                const a = ensureAudit(t.student_id);
                const done = a.hizb_done;
                const target = t.target_hizb || 1;
                const penalties =
                  a.alerts_count * rules.alert_penalty +
                  a.errors_count * rules.error_penalty;
                const pct = Math.max(
                  0,
                  Math.min(
                    100,
                    ((done * rules.hizb_points - penalties) / target) * 100,
                  ),
                );
                return (
                  <div key={t.student_id} className={`${ds.card} p-4 space-y-2 text-right`}>
                    <p className="font-semibold" style={tajawal}>
                      {t.full_name_ar}
                    </p>
                    <p className="text-sm text-muted-foreground" style={tajawal}>
                      أحزاب: {done} / {target}
                    </p>
                    <p className="text-2xl font-bold text-primary tabular-nums" style={tajawal}>
                      {pct.toFixed(0)}%
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={ds.btnRound}
                onClick={() => window.print()}
                style={tajawal}
              >
                إصدار شهادة (طباعة)
              </Button>
              {!readOnly &&
                sessionId &&
                demoTargets.map((t) => (
                  <Button
                    key={t.student_id}
                    variant="outline"
                    size="sm"
                    className={ds.btnRound}
                    onClick={() =>
                      api.eduApplyHimmaPlan(t.student_id, { session_id: sessionId })
                    }
                    style={tajawal}
                  >
                    تحديث خطة {t.full_name_ar.split(" ")[0]}
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
