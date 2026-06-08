import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  BarChart3,
  ClipboardCheck,
  Copy,
  Link2,
  Target,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  TargetPicker,
  type TargetSelection,
} from "../../components/edu/TargetPicker";
import { EduKpiCard } from "../../components/edu/EduKpiCard";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { defaultDateRange } from "../../lib/local-iso-date";
import { ds, tajawal } from "../../lib/design-system";

type TabId = "dashboard" | "targeting" | "live" | "attendance";

type ScoringRules = {
  mistake_penalty?: number;
  alert_penalty?: number;
  lahn_penalty?: number;
  default_task_weight?: number;
};

const emptyTargets = (): TargetSelection => ({
  student_ids: [],
  circle_ids: [],
  track_ids: [],
});

export function CompetitionDetailPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [attendance, setAttendance] = useState<{
    date: string;
    items: Array<{ student_id: number; full_name_ar: string; present: boolean }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [liveLink, setLiveLink] = useState<string | null>(null);

  const [targets, setTargets] = useState<TargetSelection>(emptyTargets());
  const [defaultJuz, setDefaultJuz] = useState(1);
  const [dailyJuz, setDailyJuz] = useState(0.5);
  const [scoring, setScoring] = useState<ScoringRules>({
    mistake_penalty: 1,
    alert_penalty: 0.5,
    lahn_penalty: 0.5,
    default_task_weight: 1,
  });
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dashRange, setDashRange] = useState(defaultDateRange(7));

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsDetail(id);
      setData(res);
      const comp = res.competition as Record<string, unknown>;
      const scope = (comp.scope ?? {}) as TargetSelection;
      setTargets({
        student_ids: scope.student_ids ?? [],
        circle_ids: scope.circle_ids ?? [],
        track_ids: scope.track_ids ?? [],
      });
      const rules = (comp.rules ?? {}) as { scoring?: ScoringRules };
      if (rules.scoring) setScoring((prev) => ({ ...prev, ...rules.scoring }));
      setDashRange({
        start: String(comp.start_date),
        end: String(comp.end_date),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, [id]);

  const loadDashboard = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsDashboard(id, {
        date_from: dashRange.start,
        date_to: dashRange.end,
      });
      setDashboard(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المؤشرات");
    }
  }, [id, dashRange.start, dashRange.end]);

  const loadAttendance = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsAttendanceGet(id, attDate);
      setAttendance({
        date: res.date,
        items: res.items as Array<{
          student_id: number;
          full_name_ar: string;
          present: boolean;
        }>,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التحضير");
    }
  }, [id, attDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
  }, [tab, loadDashboard]);

  useEffect(() => {
    if (tab === "attendance") void loadAttendance();
  }, [tab, loadAttendance]);

  const comp = data?.competition as Record<string, unknown> | undefined;
  const plans = (data?.plans as Array<Record<string, unknown>>) ?? [];
  const logs = (data?.logs as Array<Record<string, unknown>>) ?? [];
  const kpis = (dashboard?.kpis ?? {}) as Record<string, number>;
  const leaders = (dashboard?.leaders ?? []) as Array<{
    student_id: number;
    score: number;
    full_name_ar?: string;
  }>;

  async function saveTargeting() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const plansPayload = targets.student_ids.map((sid) => ({
        student_id: sid,
        total_target_juz: defaultJuz,
        daily_volume_juz: dailyJuz,
      }));
      await api.competitionsPatch(id, {
        scope: targets,
        plans: plansPayload,
        rules: { scoring },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function enableLiveLog() {
    if (!id) return;
    try {
      const res = await api.competitionsLiveLogToken(id);
      const url = `${window.location.origin}/live-log/${res.live_log_token}`;
      setLiveLink(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد الرابط");
    }
  }

  async function saveAttendance() {
    if (!id || !attendance) return;
    setSaving(true);
    try {
      await api.competitionsAttendanceSave(id, {
        date: attDate,
        records: attendance.items.map((i) => ({
          student_id: i.student_id,
          present: i.present,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التحضير");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "مؤشرات المنافسة", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "targeting", label: "الاستهداف والتخطيط", icon: <Target className="w-4 h-4" /> },
    { id: "live", label: "الرصد والروابط", icon: <Link2 className="w-4 h-4" /> },
    { id: "attendance", label: "تحضير المنافسة", icon: <ClipboardCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
        <Link to="/edu-dept/competitions">← المنافسات</Link>
      </Button>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {comp && (
        <>
          <div>
            <h2 className={ds.page.title} style={tajawal}>
              {String(comp.name_ar)}
            </h2>
            {comp.description ? (
              <p className="text-muted-foreground mt-1" style={tajawal}>
                {String(comp.description)}
              </p>
            ) : null}
            <p className={ds.page.description} style={tajawal}>
              {String(comp.start_date)} → {String(comp.end_date)} · {String(comp.status)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant={tab === t.id ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setTab(t.id)}
                style={tajawal}
              >
                {t.icon}
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "dashboard" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label style={tajawal}>من تاريخ</Label>
                  <Input
                    type="date"
                    value={dashRange.start}
                    onChange={(e) =>
                      setDashRange((r) => ({ ...r, start: e.target.value }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-1">
                  <Label style={tajawal}>إلى تاريخ</Label>
                  <Input
                    type="date"
                    value={dashRange.end}
                    onChange={(e) =>
                      setDashRange((r) => ({ ...r, end: e.target.value }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <Button
                  type="button"
                  className={ds.btnRound}
                  onClick={() => void loadDashboard()}
                  style={tajawal}
                >
                  تطبيق
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <EduKpiCard
                  icon={<BarChart3 className="w-4 h-4" />}
                  label="نسبة الانضباط"
                  value={`${kpis.discipline_pct ?? 0}%`}
                  sub="حضور المنافسة فقط"
                />
                <EduKpiCard
                  icon={<Target className="w-4 h-4" />}
                  label="الإنجاز مقابل المستهدف"
                  value={`${kpis.achievement_pct ?? 0}%`}
                  sub={`${kpis.achieved_juz ?? 0} / ${kpis.target_juz ?? 0} جزء`}
                />
                <EduKpiCard
                  label="المشاركون"
                  value={kpis.participants ?? 0}
                  sub="طلاب مستهدفون"
                />
              </div>
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>الأوائل</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm" style={tajawal}>
                  {leaders.length === 0 ? (
                    <p className="text-muted-foreground">لا بيانات إنجاز بعد.</p>
                  ) : (
                    leaders.map((l, i) => (
                      <div
                        key={l.student_id}
                        className="flex justify-between border-b py-2"
                      >
                        <span>
                          {i + 1}. {l.full_name_ar ?? `طالب #${l.student_id}`}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {Math.round(l.score * 100) / 100} جزء
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "targeting" && (
            <div className="space-y-4">
              <TargetPicker value={targets} onChange={setTargets} />
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>خطة الحفظ المستهدفة</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label style={tajawal}>أجزاء مستهدفة (لكل طالب)</Label>
                    <Input
                      type="number"
                      value={defaultJuz}
                      onChange={(e) => setDefaultJuz(Number(e.target.value))}
                      className={ds.btnRound}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={tajawal}>جزء يومي</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={dailyJuz}
                      onChange={(e) => setDailyJuz(Number(e.target.value))}
                      className={ds.btnRound}
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>إعدادات التقييم (خاصة بهذه المنافسة)</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <ScoreField
                    label="خصم الخطأ"
                    value={scoring.mistake_penalty ?? 1}
                    onChange={(v) => setScoring((s) => ({ ...s, mistake_penalty: v }))}
                  />
                  <ScoreField
                    label="خصم التنبيه"
                    value={scoring.alert_penalty ?? 0.5}
                    onChange={(v) => setScoring((s) => ({ ...s, alert_penalty: v }))}
                  />
                  <ScoreField
                    label="خصم اللحن"
                    value={scoring.lahn_penalty ?? 0.5}
                    onChange={(v) => setScoring((s) => ({ ...s, lahn_penalty: v }))}
                  />
                  <ScoreField
                    label="وزن المهمة"
                    value={scoring.default_task_weight ?? 1}
                    onChange={(v) =>
                      setScoring((s) => ({ ...s, default_task_weight: v }))
                    }
                  />
                </CardContent>
              </Card>
              {plans.length > 0 && (
                <Card className={ds.card}>
                  <CardHeader>
                    <CardTitle style={tajawal}>الخطط المحفوظة</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm" style={tajawal}>
                    {plans.map((p) => (
                      <p key={String(p.student_id)}>
                        {String(p.full_name_ar)} — هدف {String(p.total_target_juz)} جزء
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}
              <Button
                type="button"
                className={ds.btnRound}
                disabled={saving}
                onClick={() => void saveTargeting()}
                style={tajawal}
              >
                {saving ? "جاري الحفظ…" : "حفظ الاستهداف والإعدادات"}
              </Button>
            </div>
          )}

          {tab === "live" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>رابط الرصد الميداني</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  رابط مستقل للمُختبِر/المعلم لرصد الإنجاز والأخطاء فوراً — معزول عن الرصد
                  اليومي.
                </p>
                {comp.live_log_token ? (
                  <code className="text-xs break-all block p-3 bg-muted rounded-xl" dir="ltr">
                    {`${window.location.origin}/live-log/${String(comp.live_log_token)}`}
                  </code>
                ) : (
                  <p className="text-sm" style={tajawal}>
                    لم يُولَّد رابط بعد.
                  </p>
                )}
                <Button
                  type="button"
                  className={ds.btnRound}
                  onClick={() => void enableLiveLog()}
                  style={tajawal}
                >
                  <Link2 className="w-4 h-4" />
                  {comp.live_log_token ? "تجديد الرابط" : "توليد الرابط"}
                </Button>
                {liveLink && (
                  <div className={ds.alert.info}>
                    <code className="text-xs break-all block mb-2" dir="ltr">
                      {liveLink}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={ds.btnRound}
                      onClick={() => void navigator.clipboard.writeText(liveLink)}
                      style={tajawal}
                    >
                      <Copy className="w-4 h-4" />
                      نسخ الرابط
                    </Button>
                  </div>
                )}
                {logs.length > 0 && (
                  <div className="pt-4 border-t space-y-2 text-sm" style={tajawal}>
                    <p className="font-semibold">آخر سجلات الرصد</p>
                    {logs.slice(0, 10).map((row) => (
                      <div
                        key={`${row.student_id}-${row.log_date}`}
                        className="flex justify-between border-b py-1"
                      >
                        <span>{String(row.full_name_ar)}</span>
                        <span className="text-muted-foreground">{String(row.log_date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "attendance" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>تحضير المنافسة (مستقل)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  كشف حضور خاص بهذه المنافسة فقط — لا يؤثر على التحضير الإداري اليومي.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <Label style={tajawal}>التاريخ</Label>
                    <Input
                      type="date"
                      value={attDate}
                      onChange={(e) => setAttDate(e.target.value)}
                      className={ds.btnRound}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className={ds.btnRound}
                    onClick={() => void loadAttendance()}
                    style={tajawal}
                  >
                    تحميل
                  </Button>
                </div>
                {attendance && (
                  <div className="space-y-2">
                    {attendance.items.map((item) => (
                      <label
                        key={item.student_id}
                        className="flex items-center gap-3 py-2 border-b cursor-pointer"
                        style={tajawal}
                      >
                        <input
                          type="checkbox"
                          checked={item.present}
                          onChange={(e) => {
                            setAttendance((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((i) =>
                                      i.student_id === item.student_id
                                        ? { ...i, present: e.target.checked }
                                        : i,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                        <span className={item.present ? "" : "text-muted-foreground line-through"}>
                          {item.full_name_ar}
                        </span>
                      </label>
                    ))}
                    <Button
                      type="button"
                      className={ds.btnRound}
                      disabled={saving}
                      onClick={() => void saveAttendance()}
                      style={tajawal}
                    >
                      {saving ? "جاري الحفظ…" : "حفظ التحضير"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label style={tajawal}>{label}</Label>
      <Input
        type="number"
        step="0.1"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={ds.btnRound}
      />
    </div>
  );
}
