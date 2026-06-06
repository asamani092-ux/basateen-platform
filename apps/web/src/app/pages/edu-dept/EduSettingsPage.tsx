import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
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
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function EduSettingsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [weights, setWeights] = useState({
    weight_listening: 1,
    weight_revision: 1,
    weight_repeat: 1,
    rabt_weight: 1,
    penalty_per_error: 0.5,
    competition_attendance_weight: 1,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
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
        competition_attendance_weight: Number(
          res.settings.competition_attendance_weight ?? 1,
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dialogOpen) void load();
  }, [dialogOpen, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptSettingsPatch({
        weight_listening: weights.weight_listening,
        weight_revision: weights.weight_revision,
        weight_repeat: weights.weight_repeat,
        rabt_weight: weights.rabt_weight,
        penalty_per_error: weights.penalty_per_error,
        competition_attendance_weight: weights.competition_attendance_weight,
      });
      setSuccess("تم حفظ أوزان التقييم.");
      setDialogOpen(false);
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
          ضبط أوزان تقييم المهام اليومية وحضور المنافسات — منفصل عن التحضير الإداري.
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

      <div className={`${ds.card} p-12 flex flex-col items-center justify-center text-center gap-4 min-h-[280px]`}>
        <Settings2 className="w-12 h-12 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground max-w-sm" style={tajawal}>
          أوزان السماع والتكرار والمراجعة والربط وخصم الأخطاء — وحضور المنافسات بشكل مستقل.
        </p>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
          onClick={() => setDialogOpen(true)}
          style={tajawal}
        >
          تعديل أوزان التقييم
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl max-h-[90vh] overflow-y-auto`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>أوزان التقييم</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground text-sm" style={tajawal}>
                جاري التحميل…
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold" style={tajawal}>
                  الرصد اليومي للمعلم
                </p>
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
                <p className="text-sm font-semibold pt-2 border-t border-border" style={tajawal}>
                  حضور المنافسات (مستقل)
                </p>
                <Field
                  label="وزن حضور المنافسات"
                  value={weights.competition_attendance_weight}
                  onChange={(v) =>
                    setWeights((w) => ({ ...w, competition_attendance_weight: v }))
                  }
                />
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  يُحسب في نقاط المنافسات فقط ولا يؤثر على إحصائيات الغياب الإدارية.
                </p>
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
        </DialogContent>
      </Dialog>
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
