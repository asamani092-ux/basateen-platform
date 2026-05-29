import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function EduSettingsPage() {
  const [weights, setWeights] = useState({
    weight_listening: 1,
    weight_revision: 1,
    weight_repeat: 1,
    rabt_weight: 1,
    penalty_per_error: 0.5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptSettingsGet();
      setWeights({
        weight_listening: Number(res.settings.weight_listening ?? 1),
        weight_revision: Number(res.settings.weight_revision ?? 1),
        weight_repeat: Number(res.settings.weight_repeat ?? 1),
        rabt_weight: Number(res.settings.rabt_weight ?? 1),
        penalty_per_error: Number(res.settings.penalty_per_error ?? 0.5),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptSettingsPatch(weights);
      setSuccess("تم حفظ أوزان التقييم.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <Settings2 className="w-7 h-7 text-primary" />
          إعدادات التعليم
        </h2>
        <p className={ds.page.description} style={tajawal}>
          أوزان تقييم المهام اليومية (السماع، التكرار، المراجعة، الربط، وخصم الأخطاء).
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <form onSubmit={save} className={`${ds.card} p-6 space-y-4`}>
        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <>
            <Field
              label="درجة السماع"
              value={weights.weight_listening}
              onChange={(v) => setWeights((w) => ({ ...w, weight_listening: v }))}
            />
            <Field
              label="درجة التكرار"
              value={weights.weight_repeat}
              onChange={(v) => setWeights((w) => ({ ...w, weight_repeat: v }))}
            />
            <Field
              label="درجة المراجعة"
              value={weights.weight_revision}
              onChange={(v) => setWeights((w) => ({ ...w, weight_revision: v }))}
            />
            <Field
              label="درجة الربط"
              value={weights.rabt_weight}
              onChange={(v) => setWeights((w) => ({ ...w, rabt_weight: v }))}
            />
            <Field
              label="خصم لكل خطأ / لحن"
              value={weights.penalty_per_error}
              onChange={(v) => setWeights((w) => ({ ...w, penalty_per_error: v }))}
            />
            <Button
              type="submit"
              variant="default"
              disabled={saving}
              className={`w-full ${ds.btnRound}`}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}

function Field({
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
        style={tajawal}
      />
    </div>
  );
}
