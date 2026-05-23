import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { api } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

export function SemesterSettingsCard() {
  const [weeks, setWeeks] = useState(16);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [graduates, setGraduates] = useState(0);
  const [huffadh, setHuffadh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!getApiToken()) return;
    api
      .adminComplexSettings()
      .then((r) => {
        setWeeks(r.semester_weeks);
        setDays(r.school_days);
        setGraduates(r.graduates_count);
        setHuffadh(r.huffadh_count);
      })
      .catch(() => {});
  }, []);

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  async function save() {
    if (!getApiToken()) {
      setMsg("أعد تسجيل الدخول بربط API");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.adminPatchComplexSettings({
        semester_weeks: weeks,
        school_days: days,
        graduates_count: graduates,
        huffadh_count: huffadh,
      });
      setMsg("تم حفظ إعدادات المجمع");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base" style={tajawal}>
          <CalendarDays className="w-5 h-5 text-primary" />
          إعدادات الفصل والمجمع
        </CardTitle>
        <CardDescription style={tajawal}>
          حصري للمدير العام — أسابيع الفصل والأيام الفعلية
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1" style={tajawal}>
              أسابيع الفصل
            </label>
            <Input
              type="number"
              min={1}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" style={tajawal}>
              الخريجون
            </label>
            <Input
              type="number"
              min={0}
              value={graduates}
              onChange={(e) => setGraduates(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" style={tajawal}>
              الحفاظ
            </label>
            <Input
              type="number"
              min={0}
              value={huffadh}
              onChange={(e) => setHuffadh(Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2" style={tajawal}>
            أيام الدراسة الفعلية
          </p>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, idx) => (
              <Button
                key={idx}
                type="button"
                size="sm"
                variant={days.includes(idx) ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => toggleDay(idx)}
                style={tajawal}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          className={ds.btnRound}
          disabled={saving}
          onClick={save}
          style={tajawal}
        >
          {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
        </Button>
        {msg && (
          <p className="text-sm text-muted-foreground" style={tajawal}>
            {msg}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
