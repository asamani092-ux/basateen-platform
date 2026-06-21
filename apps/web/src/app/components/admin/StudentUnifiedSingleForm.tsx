import { useMemo, useState } from "react";
import { GuardedForm } from "../ui/guarded-form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { STAGE_OPTIONS } from "../../lib/stages";
import type { EducationalGroupRow } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";
import {
  formatFacesToText,
  convertToFaces,
  clampUnitValue,
  getUnitMax,
  QURAN_MAX_FACES,
  QURAN_MAX_HIZB,
  QURAN_MAX_JUZ,
  type QuranUnit,
} from "../../lib/quran-memorization";

const UNIT_MAX_HINT: Record<QuranUnit, string> = {
  face: `الحد الأقصى ${QURAN_MAX_FACES} وجه`,
  hizb: `الحد الأقصى ${QURAN_MAX_HIZB} حزب`,
  juz: `الحد الأقصى ${QURAN_MAX_JUZ} جزء (الجزء 30 = 23 وجه)`,
};

export type StudentUnifiedFormValues = {
  full_name_ar: string;
  national_id: string;
  nationality: string;
  phone: string;
  guardian_phone: string;
  school_name: string;
  school_grade: string;
  memorization_amount: string;
  memorization_value: string;
  memorization_unit: QuranUnit;
  guardian_national_id: string;
  guardian_work: string;
  health_notes: string;
  stage_id: string;
  age: string;
  placement: string;
};

const EMPTY: StudentUnifiedFormValues = {
  full_name_ar: "",
  national_id: "",
  nationality: "سعودي",
  phone: "",
  guardian_phone: "",
  school_name: "",
  school_grade: "",
  memorization_amount: "",
  memorization_value: "",
  memorization_unit: "face",
  guardian_national_id: "",
  guardian_work: "",
  health_notes: "",
  stage_id: "",
  age: "",
  placement: "",
};

type Props = {
  groups: EducationalGroupRow[];
  onSubmit: (values: StudentUnifiedFormValues) => Promise<void>;
  submitting?: boolean;
  /** وضع التعديل — يملأ الحقول من الطالب الحالي */
  initialValues?: Partial<StudentUnifiedFormValues>;
  submitLabel?: string;
  /** إلزامية الإسناد (افتراضي: نعم للإضافة) */
  requirePlacement?: boolean;
  resetOnSubmit?: boolean;
};

export function StudentUnifiedSingleForm({
  groups,
  onSubmit,
  submitting,
  initialValues,
  submitLabel,
  requirePlacement = true,
  resetOnSubmit = true,
}: Props) {
  const [values, setValues] = useState<StudentUnifiedFormValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [stageFilter, setStageFilter] = useState(
    requirePlacement ? "" : (initialValues?.stage_id ?? ""),
  );

  const groupOptions = useMemo(() => {
    let list = groups;
    if (stageFilter) {
      const sid = Number(stageFilter);
      list = list.filter(
        (g) =>
          g.stage_id === sid ||
          (g.stage_ids?.includes(sid) ?? false),
      );
    }
    return list.map((g) => ({
      value: `${g.entity_type}:${g.id}`,
      label: `${g.name_ar} (${g.entity_type === "circle" ? "حلقة" : "مسار"})`,
    }));
  }, [groups, stageFilter]);

  const missingRequired = useMemo(() => {
    const req: (keyof StudentUnifiedFormValues)[] = [
      "full_name_ar",
      "national_id",
      "nationality",
      "phone",
      "guardian_phone",
    ];
    if (requirePlacement) req.push("placement");
    return req.filter((k) => !String(values[k]).trim());
  }, [values, requirePlacement]);

  const canSubmit = missingRequired.length === 0 && !submitting;

  function set<K extends keyof StudentUnifiedFormValues>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function setMemorization(rawValue: string, unit: QuranUnit) {
    const clamped = clampUnitValue(Number(rawValue) || 0, unit);
    const displayValue =
      rawValue === "" || rawValue === "0"
        ? rawValue
        : String(clamped);
    const faces = convertToFaces(clamped, unit);
    const text = formatFacesToText(faces);
    setValues((prev) => ({
      ...prev,
      memorization_value: displayValue,
      memorization_unit: unit,
      memorization_amount: text,
    }));
  }

  const memorizationMax = getUnitMax(values.memorization_unit);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(values);
    if (resetOnSubmit) {
      setValues(EMPTY);
      setStageFilter("");
    }
  }

  return (
    <GuardedForm onSubmit={handleSubmit} className="space-y-4">
      {missingRequired.length > 0 && (
        <p className={ds.alert.error} style={tajawal}>
          أكمل الحقول الإلزامية المحددة بالنجمة (*)
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="الاسم الرباعي *" required>
          <Input
            value={values.full_name_ar}
            onChange={(e) => set("full_name_ar", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="الهوية الوطنية *" required>
          <Input
            value={values.national_id}
            onChange={(e) => set("national_id", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="الجنسية *" required>
          <Input
            value={values.nationality}
            onChange={(e) => set("nationality", e.target.value)}
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
        <Field label="جوال ولي الأمر *" required>
          <Input
            value={values.guardian_phone}
            onChange={(e) => set("guardian_phone", e.target.value)}
            dir="ltr"
            className={ds.btnRound}
          />
        </Field>
        <Field label="المرحلة (اختياري — لفلترة الحلقات)">
          <select
            value={values.stage_id}
            onChange={(e) => {
              set("stage_id", e.target.value);
              setStageFilter(e.target.value);
              set("placement", "");
            }}
            className={ds.select}
            style={tajawal}
          >
            <option value="">— اختر —</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={requirePlacement ? "الحلقة / المسار *" : "الحلقة / المسار (للإسناد)"}
          required={requirePlacement}
          className="sm:col-span-2"
        >
          <select
            value={values.placement}
            onChange={(e) => set("placement", e.target.value)}
            className={ds.select}
            style={tajawal}
            required={requirePlacement}
          >
            <option value="">
              {requirePlacement ? "— اختر الحلقة أو المسار —" : "— بدون تغيير —"}
            </option>
            {groupOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="المدرسة">
          <Input
            value={values.school_name}
            onChange={(e) => set("school_name", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="الصف الدراسي">
          <Input
            value={values.school_grade}
            onChange={(e) => set("school_grade", e.target.value)}
            className={ds.btnRound}
            style={tajawal}
          />
        </Field>
        <Field label="مقدار الحفظ">
          <p className="text-xs text-muted-foreground mb-1.5" style={tajawal}>
            أدخل العدد ثم اختر الوحدة (وجه / حزب / جزء)
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={memorizationMax}
              step={1}
              value={values.memorization_value}
              onChange={(e) =>
                setMemorization(e.target.value, values.memorization_unit)
              }
              className={`${ds.btnRound} flex-1 text-lg font-semibold tabular-nums`}
              style={tajawal}
              dir="ltr"
              placeholder="مثال: 5"
            />
            <select
              value={values.memorization_unit}
              onChange={(e) =>
                setMemorization(
                  values.memorization_value,
                  e.target.value as QuranUnit,
                )
              }
              className={ds.select}
              style={tajawal}
            >
              <option value="face">وجه</option>
              <option value="hizb">حزب</option>
              <option value="juz">جزء</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
            {UNIT_MAX_HINT[values.memorization_unit]}
          </p>
          {values.memorization_amount ? (
            <div
              className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground"
              style={tajawal}
            >
              {values.memorization_amount}
            </div>
          ) : null}
        </Field>
        <Field label="العمر (اختياري)">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={values.age}
            onChange={(e) => set("age", e.target.value.replace(/[^\d]/g, ""))}
            className={ds.btnRound}
            placeholder="—"
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
        <Field label="أعراض صحية (اختياري)" className="sm:col-span-2">
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
        {submitting ? "جاري الحفظ…" : (submitLabel ?? "حفظ الطالب ➕")}
      </Button>
    </GuardedForm>
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
      <Label
        className={`text-xs block mb-1 ${required ? "text-destructive font-medium" : "text-muted-foreground"}`}
        style={tajawal}
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
