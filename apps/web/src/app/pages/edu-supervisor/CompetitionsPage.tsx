import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Copy, Link2, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  TargetPicker,
  type TargetSelection,
} from "../../components/edu/TargetPicker";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type CompetitionRow = {
  id: number;
  name_ar: string;
  start_date: string;
  end_date: string;
  status: string;
  telemetry_type: string;
  live_log_token: string | null;
};

const emptyTargets = (): TargetSelection => ({
  student_ids: [],
  circle_ids: [],
  track_ids: [],
});

export function CompetitionsPage() {
  const [items, setItems] = useState<CompetitionRow[]>([]);
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [telemetryType, setTelemetryType] = useState<
    "extended_recitation" | "intensive_routine"
  >("intensive_routine");
  const [targets, setTargets] = useState<TargetSelection>(emptyTargets());
  const [defaultJuz, setDefaultJuz] = useState(1);
  const [dailyJuz, setDailyJuz] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [liveLink, setLiveLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.competitionsList();
      setItems(res.items as CompetitionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCompetition() {
    setError(null);
    const scope = {
      student_ids: targets.student_ids,
      circle_ids: targets.circle_ids,
      track_ids: targets.track_ids,
    };
    const plans =
      telemetryType === "extended_recitation"
        ? targets.student_ids.map((sid) => ({
            student_id: sid,
            total_target_juz: defaultJuz,
            daily_volume_juz: dailyJuz,
          }))
        : undefined;
    try {
      const res = await api.competitionsCreate({
        name_ar: nameAr,
        start_date: startDate,
        end_date: endDate,
        telemetry_type: telemetryType,
        scope,
        plans,
      });
      setNameAr("");
      setTargets(emptyTargets());
      await load();
      if (res.id) {
        window.location.href = `/edu-supervisor/competitions/${res.id}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    }
  }

  async function enableLiveLog(id: number) {
    try {
      const res = await api.competitionsLiveLogToken(id);
      const url = `${window.location.origin}/live-log/${res.live_log_token}`;
      setLiveLink(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد الرابط");
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          المنافسات والبرامج الاستثنائية
        </h2>
        <p className={ds.page.description} style={tajawal}>
          معزولة عن الرصد اليومي للمعلم — تُحفظ في ملف الطالب
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {liveLink && (
        <div className={ds.alert.info}>
          <code className="text-xs break-all block mb-2" dir="ltr">
            {liveLink}
          </code>
          <p className="text-sm font-semibold mb-2" style={tajawal}>
            رمز الدخول (PIN): <span dir="ltr">{accessPin}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ds.btnRound}
            onClick={() =>
              navigator.clipboard.writeText(
                `رابط الرصد: ${liveLink}\nرمز الدخول: ${accessPin}`,
              )
            }
            style={tajawal}
          >
            <Copy className="w-4 h-4" />
            نسخ الرابط + PIN
          </Button>
        </div>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>إنشاء منافسة جديدة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold" style={tajawal}>
                الاسم
              </label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={ds.btnRound} />
            </div>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <div className="sm:col-span-2">
              <select
                value={telemetryType}
                onChange={(e) =>
                  setTelemetryType(
                    e.target.value as "extended_recitation" | "intensive_routine",
                  )
                }
                className="w-full rounded-xl border border-border px-3 py-2"
                style={tajawal}
              >
                <option value="extended_recitation">السرد الممتد</option>
                <option value="intensive_routine">البرنامج المكثف</option>
              </select>
            </div>
          </div>

          <TargetPicker value={targets} onChange={setTargets} />

          {telemetryType === "extended_recitation" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm" style={tajawal}>
                  أجزاء مستهدفة (لكل طالب مختار)
                </label>
                <Input
                  type="number"
                  value={defaultJuz}
                  onChange={(e) => setDefaultJuz(Number(e.target.value))}
                  className={ds.btnRound}
                />
              </div>
              <div>
                <label className="text-sm" style={tajawal}>
                  جزء يومي
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={dailyJuz}
                  onChange={(e) => setDailyJuz(Number(e.target.value))}
                  className={ds.btnRound}
                />
              </div>
            </div>
          )}

          <Button
            type="button"
            className={ds.btnRound}
            onClick={createCompetition}
            disabled={!nameAr.trim()}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            إنشاء وفتح التفاصيل
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className={ds.page.section} style={tajawal}>
          المنافسات
        </h3>
        {items.map((c) => (
          <div key={c.id} className={`${ds.card} p-4 flex flex-wrap gap-3 justify-between`}>
            <div>
              <Link
                to={`/edu-supervisor/competitions/${c.id}`}
                className="font-semibold text-primary hover:underline"
                style={tajawal}
              >
                {c.name_ar}
              </Link>
              <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
                {c.start_date} → {c.end_date}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => enableLiveLog(c.id)}
              style={tajawal}
            >
              <Link2 className="w-4 h-4" />
              رابط ميداني
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
