export type CompetitionCategory =
  | "recitation"
  | "review"
  | "new_memorization";

export type MemorizationUnit = "juz" | "hizb";

export type TaskInputType = "boolean" | "numeric" | "counter";

export type TaskType = "addition" | "deduction";

export type TargetScope = {
  circle_ids: number[];
  track_ids: number[];
  stage_ids: number[];
};

export type PreviewStudent = {
  student_id: number;
  full_name_ar: string;
  circle_name: string | null;
  stage_id: number | null;
  current_memorization: number;
  target_amount: number;
  memorization_amount: string | null;
};

export type StudentTargetRow = {
  student_id: number;
  full_name_ar: string;
  current_memorization: number;
  target_amount: number;
};

export const COMPETITION_CATEGORIES: Array<{
  value: CompetitionCategory;
  label: string;
}> = [
  { value: "recitation", label: "سرد" },
  { value: "review", label: "مراجعة" },
  { value: "new_memorization", label: "حفظ جديد" },
];

/** مراحل الاستهداف في المنافسات — ابتدائي، متوسط، ثانوي فقط */
export const COMPETITION_STAGE_OPTIONS = [
  { id: 2, label: "ابتدائي" },
  { id: 3, label: "متوسط" },
  { id: 4, label: "ثانوي" },
] as const;

export function categoryLabel(category: string | undefined): string {
  return (
    COMPETITION_CATEGORIES.find((c) => c.value === category)?.label ??
    category ??
    "—"
  );
}

export function isAdditiveCategory(category: CompetitionCategory): boolean {
  return category === "new_memorization";
}

export function isRecitationCategory(category: string): boolean {
  return category === "recitation";
}

export function isReviewCategory(category: string): boolean {
  return category === "review";
}

export function isMemorizationTrackingCategory(category: string): boolean {
  return category === "new_memorization" || category === "review";
}

/** O(1) — maps legacy task type to default input widget. */
export function defaultInputTypeFromTaskType(type: TaskType): TaskInputType {
  return type === "deduction" ? "counter" : "boolean";
}

export function resolveTaskInputType(task: {
  type: string;
  input_type?: string | null;
}): TaskInputType {
  const raw = task.input_type;
  if (raw === "boolean" || raw === "numeric" || raw === "counter") return raw;
  return defaultInputTypeFromTaskType(task.type === "deduction" ? "deduction" : "addition");
}

export const TASK_INPUT_TYPE_OPTIONS: Array<{ value: TaskInputType; label: string }> = [
  { value: "boolean", label: "نعم/لا (checkbox)" },
  { value: "numeric", label: "رقم (إدخال)" },
  { value: "counter", label: "عداد (+/−)" },
];

/** O(1) — inclusive calendar days between start and end (YYYY-MM-DD). */
export function countCompetitionDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

/** O(1) — juz × 20 faces, hizb × 10 faces. */
export function totalFacesFromUnit(unit: MemorizationUnit, count: number): number {
  const n = Number(count) || 0;
  return unit === "juz" ? n * 20 : n * 10;
}

/** O(1) — daily face quota for memorization competitions. */
export function dailyFaces(totalFaces: number, dayCount: number): number {
  const days = Math.max(1, dayCount);
  return Math.round((totalFaces / days) * 100) / 100;
}

/** O(1) — recitation targets: 1 juz = 2 hizb. */
export function targetHizbCount(targetJuz: number): number {
  const juz = Number(targetJuz) || 0;
  return Math.max(1, Math.ceil(juz * 2));
}

export function studentDailyFaces(
  unit: MemorizationUnit,
  targetAmount: number,
  dayCount: number,
): number {
  return dailyFaces(totalFacesFromUnit(unit, targetAmount), dayCount);
}

export function defaultTargetForCategory(
  category: CompetitionCategory,
  currentMemorization: number,
): number {
  if (isAdditiveCategory(category)) return 1;
  return currentMemorization;
}

export function recitationScoreKey(
  studentId: number,
  hizbIndex: number,
  taskId: number,
): string {
  return `${studentId}:${hizbIndex}:${taskId}`;
}

export function gradingScoreKey(
  studentId: number,
  taskId: number,
  hizbIndex?: number,
): string {
  if (hizbIndex != null && hizbIndex > 0) {
    return recitationScoreKey(studentId, hizbIndex, taskId);
  }
  return `${studentId}:${taskId}`;
}

export type SirdSettings = {
  base_hizb_score: number;
  mistake_deduction: number;
  warning_deduction: number;
  pass_threshold: number;
};

export const DEFAULT_SIRD_SETTINGS: SirdSettings = {
  base_hizb_score: 20,
  mistake_deduction: 2.5,
  warning_deduction: 0.5,
  pass_threshold: 14,
};

export type SirdPeriodData = {
  period_index: number;
  hizb_number: number;
  mistakes_count: number;
  warnings_count: number;
  is_passed: boolean;
  score: number | null;
};

/** O(1) — parse sird settings from competition rules. */
export function parseSirdSettings(
  rules: Record<string, unknown> | null | undefined,
): SirdSettings {
  const raw = (rules?.sird ?? {}) as Record<string, unknown>;
  return {
    base_hizb_score: Number(raw.base_hizb_score ?? DEFAULT_SIRD_SETTINGS.base_hizb_score),
    mistake_deduction: Number(raw.mistake_deduction ?? DEFAULT_SIRD_SETTINGS.mistake_deduction),
    warning_deduction: Number(raw.warning_deduction ?? DEFAULT_SIRD_SETTINGS.warning_deduction),
    pass_threshold: Number(raw.pass_threshold ?? DEFAULT_SIRD_SETTINGS.pass_threshold),
  };
}

/** O(1) — client-side sird score + pass flag. */
export function computeSirdPeriodScore(
  mistakes: number,
  warnings: number,
  settings: SirdSettings,
): { score: number; is_passed: boolean } {
  const m = Math.max(0, Math.round(Number(mistakes) || 0));
  const w = Math.max(0, Math.round(Number(warnings) || 0));
  const score =
    Math.round(
      (settings.base_hizb_score -
        m * settings.mistake_deduction -
        w * settings.warning_deduction) *
        100,
    ) / 100;
  return {
    score,
    is_passed: score >= settings.pass_threshold,
  };
}
