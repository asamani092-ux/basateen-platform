import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { STAGE_OPTIONS } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

export type AdmissionFormValues = {
  full_name_ar: string;
  phone: string;
  national_id: string;
  school_grade: string;
  stage_id: string;
  guardian_phone: string;
  guardian_national_id: string;
  guardian_work: string;
  health_notes: string;
  age: string;
};

const EMPTY: AdmissionFormValues = {
  full_name_ar: "",
  phone: "",
  national_id: "",
  school_grade: "",
  stage_id: "",
  guardian_phone: "",
  guardian_national_id: "",
  guardian_work: "",
  health_notes: "",
  age: "",
};

type Props = {
  onSubmit: (values: AdmissionFormValues) => Promise<void>;
  submitting?: boolean;
};

export function AdmissionForm({ onSubmit, submitting }: Props) {
  const [values, setValues] = useState<AdmissionFormValues>(EMPTY);

  const missingRequired = useMemo(() => {
    const req: (keyof AdmissionFormValues)[] = [
      "full_name_ar",
      "phone",
      "national_id",
      "school_grade",
      "stage_id",
      "guardian_phone",
    ];
    return req.filter((k) => !String(values[k]).trim());
  }, [values]);

  const canSubmit = missingRequired.length === 0 && !submitting;

  function set<K extends keyof AdmissionFormValues>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(values);
    setValues(EMPTY);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {missingRequired.length > 0 && (
        <p className={ds.alert.error} style={tajawal}>
          أكمل الحقول الإلزامية المحددة بالنجمة (*)
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="اسم الطالب *" required>
          <Input
            value={values.full_name_ar}
            onChange={(e) => set("full_name_ar", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="جوال الطالب *" required>
          <Input
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="هوية/إقامة الطالب *" required>
          <Input
            value={values.national_id}
            onChange={(e) => set("national_id", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="الصف الدراسي *" required>
          <Input
            value={values.school_grade}
            onChange={(e) => set("school_grade", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="المرحلة *" required>
          <select
            value={values.stage_id}
            onChange={(e) => set("stage_id", e.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2"
            style={tajawal}
          >
            <option value="">— اختر المرحلة —</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="جوال ولي الأمر *" required>
          <Input
            value={values.guardian_phone}
            onChange={(e) => set("guardian_phone", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="العمر (اختياري)">
          <Input
            type="number"
            min={4}
            max={25}
            value={values.age}
            onChange={(e) => set("age", e.target.value)}
            className={ds.btnRound}
          />
        </Field>
        <Field label="هوية ولي الأمر (اختياري)">
          <Input
            value={values.guardian_national_id}
            onChange={(e) => set("guardian_national_id", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="عمل ولي الأمر (اختياري)">
          <Input
            value={values.guardian_work}
            onChange={(e) => set("guardian_work", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="الأعراض الصحية (اختياري)" className="sm:col-span-2">
          <Input
            value={values.health_notes}
            onChange={(e) => set("health_notes", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
      </div>

      <Button
        type="submit"
        disabled={!canSubmit}
        className={ds.btnRound}
        style={tajawal}
      >
        {submitting ? "جاري الحفظ…" : "تسجيل الطالب وتوجيهه للحلقة"}
      </Button>
    </form>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className={`text-xs block mb-1 ${required ? "text-destructive font-medium" : "text-muted-foreground"}`}
        style={tajawal}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
