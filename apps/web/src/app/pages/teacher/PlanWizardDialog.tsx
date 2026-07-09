import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { api, type StudentRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";
import {
  estimatePlan,
  type PlanEstimate,
  type SemesterCalendar,
} from "../../lib/teacher/plan-estimator";

const PLAN_KINDS = [
  { value: "combined", label: "خطة شاملة (حفظ + مراجعة + ربط)" },
  { value: "hifz_new", label: "حفظ جديد" },
  { value: "muraja", label: "مراجعة محفوظ" },
  { value: "tilawa", label: "تلوة وتجويد" },
] as const;

export type PlanWizardSeed = {
  id?: number;
  plan_kind?: string;
  daily_hifz_pages?: number;
  daily_muraja_pages?: number;
  daily_rabt_faces?: number;
  repeat_target?: number;
  duration_weeks?: number | null;
};

type Props = {
  student: StudentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** عند التعديل — يُمرَّر صف الخطة المستهدفة دون تغيير توقيع المكوّن الأساسي */
  editPlan?: PlanWizardSeed | null;
};

export function PlanWizardDialog({
  student,
  open,
  onOpenChange,
  onSaved,
  editPlan = null,
}: Props) {
  const canSave = Boolean(getApiToken()) || isUiDevPreview();
  const [calendar, setCalendar] = useState<SemesterCalendar | null>(null);
  const [planKind, setPlanKind] = useState<string>("combined");
  const [dailyHifz, setDailyHifz] = useState("0.5");
  const [dailyMuraja, setDailyMuraja] = useState("0.5");
  const [dailyRabt, setDailyRabt] = useState("2");
  const [repeatTarget, setRepeatTarget] = useState("3");
  const [durationWeeks, setDurationWeeks] = useState("2");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canSave) return;
    try {
      const res = await api.teacherPlanGet(student.id);
      setCalendar(res.calendar);
      const seed =
        editPlan ??
        (res.plan
          ? {
              id: Number(res.plan.id),
              plan_kind: String(res.plan.plan_kind ?? "combined"),
              daily_hifz_pages: Number(res.plan.daily_hifz_pages),
              daily_muraja_pages: Number(res.plan.daily_muraja_pages),
              daily_rabt_faces: Number(res.plan.daily_rabt_faces),
              repeat_target: Number(res.plan.repeat_target),
              duration_weeks:
                res.plan.duration_weeks != null
                  ? Number(res.plan.duration_weeks)
                  : null,
            }
          : null);
      if (seed && editPlan) {
        setPlanKind(String(seed.plan_kind ?? "combined"));
        setDailyHifz(String(seed.daily_hifz_pages ?? "0.5"));
        setDailyMuraja(String(seed.daily_muraja_pages ?? "0.5"));
        setDailyRabt(String(seed.daily_rabt_faces ?? "2"));
        setRepeatTarget(String(seed.repeat_target ?? "3"));
        setDurationWeeks(String(seed.duration_weeks && seed.duration_weeks > 0 ? seed.duration_weeks : 2));
      } else if (!editPlan) {
        setPlanKind("combined");
        setDailyHifz("0.5");
        setDailyMuraja("0.5");
        setDailyRabt("2");
        setRepeatTarget("3");
        setDurationWeeks("2");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل الخطة");
    }
  }, [canSave, student.id, editPlan]);

  useEffect(() => {
    if (open) {
      setError(null);
      if (editPlan) {
        setPlanKind(String(editPlan.plan_kind ?? "combined"));
        setDailyHifz(String(editPlan.daily_hifz_pages ?? "0.5"));
        setDailyMuraja(String(editPlan.daily_muraja_pages ?? "0.5"));
        setDailyRabt(String(editPlan.daily_rabt_faces ?? "2"));
        setRepeatTarget(String(editPlan.repeat_target ?? "3"));
        setDurationWeeks(
          String(
            editPlan.duration_weeks && editPlan.duration_weeks > 0
              ? editPlan.duration_weeks
              : 2,
          ),
        );
      }
      void load();
    }
  }, [open, load, editPlan]);

  const inputs = useMemo(
    () => ({
      daily_hifz_pages: Number(dailyHifz) || 0,
      daily_muraja_pages: Number(dailyMuraja) || 0,
      daily_rabt_faces: Number(dailyRabt) || 0,
      repeat_target: Number(repeatTarget) || 1,
    }),
    [dailyHifz, dailyMuraja, dailyRabt, repeatTarget],
  );

  const weeks = Math.max(1, Math.floor(Number(durationWeeks) || 0));

  const estimate: PlanEstimate | null = useMemo(() => {
    if (!calendar) return null;
    return estimatePlan(calendar, inputs);
  }, [calendar, inputs]);

  async function save() {
    if (!canSave) return;
    if (!Number.isFinite(weeks) || weeks < 1) {
      setError("أدخل مدة الخطة بالأسابيع (رقم صحيح ≥ 1).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        plan_kind: planKind,
        daily_hifz_pages: inputs.daily_hifz_pages,
        daily_muraja_pages: inputs.daily_muraja_pages,
        daily_rabt_faces: inputs.daily_rabt_faces,
        repeat_target: inputs.repeat_target,
        duration_weeks: weeks,
        wizard_json: { plan_kind: planKind, duration_weeks: weeks },
      };
      if (editPlan?.id != null) {
        body.plan_id = editPlan.id;
        await api.teacherPlanSave(student.id, body);
      } else {
        await api.teacherPlanSave(student.id, body);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الخطة");
    } finally {
      setSaving(false);
    }
  }

  const isEdit = editPlan?.id != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={tajawal}>
            {isEdit ? "تعديل الخطة" : "خطة جديدة"} — {student.full_name_ar}
          </DialogTitle>
          <DialogDescription style={tajawal}>
            حدّد نوع الخطة ومدتها بالأسابيع والمقدار اليومي. تاريخ الانتهاء يُحسب
            تلقائياً من تاريخ الإنشاء (توقيت الرياض).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label style={tajawal}>نوع الخطة</Label>
            <Select value={planKind} onValueChange={setPlanKind}>
              <SelectTrigger className={ds.btnRound}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label style={tajawal}>مدة الخطة (أسابيع)</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              className={ds.btnRound}
            />
            <p className="text-xs text-muted-foreground" style={tajawal}>
              مثال: أسبوعان = 14 يوماً من تاريخ الإنشاء.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label style={tajawal}>مقدار الحفظ اليومي (صفحات)</Label>
              <Input
                type="number"
                step="0.25"
                min={0}
                value={dailyHifz}
                onChange={(e) => setDailyHifz(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1">
              <Label style={tajawal}>مراجعة المحفوظ (صفحات)</Label>
              <Input
                type="number"
                step="0.25"
                min={0}
                value={dailyMuraja}
                onChange={(e) => setDailyMuraja(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1">
              <Label style={tajawal}>الربط اليومي (أوجه)</Label>
              <Input
                type="number"
                min={0}
                value={dailyRabt}
                onChange={(e) => setDailyRabt(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1">
              <Label style={tajawal}>هدف التكرار</Label>
              <Input
                type="number"
                min={1}
                value={repeatTarget}
                onChange={(e) => setRepeatTarget(e.target.value)}
                className={ds.btnRound}
              />
            </div>
          </div>

          {estimate && (
            <div
              className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2"
              role="status"
            >
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Sparkles className="size-4" />
                <span style={tajawal}>بطاقة تقدير حي</span>
              </div>
              <p className="text-sm leading-relaxed" style={tajawal}>
                {estimate.summary_ar}
              </p>
              <p className="text-xs text-muted-foreground" style={tajawal}>
                المدة: {weeks} أسبوع — عدّل الأرقام قبل التأكيد لتناسب قدرة الطالب.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" style={tajawal}>
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => onOpenChange(false)}
            style={tajawal}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            className={ds.btnRound}
            disabled={saving || !canSave}
            onClick={() => void save()}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : isEdit ? "حفظ التعديل" : "تأكيد الخطة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
