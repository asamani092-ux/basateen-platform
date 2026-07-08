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

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "الأحد" },
  { value: 1, label: "الاثنين" },
  { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" },
  { value: 4, label: "الخميس" },
  { value: 5, label: "الجمعة" },
  { value: 6, label: "السبت" },
] as const;

export const DEFAULT_ACTIVE_WEEKDAYS: number[] = [0, 1, 2, 3, 4];

const WEEKDAY_LABELS = WEEKDAY_OPTIONS.map((o) => o.label);

/** O(n) — n ≤ 7 */
export function parseActiveWeekdays(
  rules: Record<string, unknown> | null | undefined,
): number[] {
  const raw = rules?.active_weekdays;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_ACTIVE_WEEKDAYS];
  }
  const days = raw
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_ACTIVE_WEEKDAYS];
}

/** O(D) time, O(D) space */
export function enumerateActiveCompetitionDates(
  startDate: string,
  endDate: string,
  activeWeekdays: number[] = DEFAULT_ACTIVE_WEEKDAYS,
): string[] {
  const active = new Set(activeWeekdays);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [startDate];
  }
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    if (active.has(cur.getDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates.length ? dates : [startDate];
}

export function countActiveCompetitionDays(
  startDate: string,
  endDate: string,
  activeWeekdays?: number[],
): number {
  return enumerateActiveCompetitionDates(
    startDate,
    endDate,
    activeWeekdays ?? DEFAULT_ACTIVE_WEEKDAYS,
  ).length;
}

export function defaultActiveLogDate(
  activeDates: string[],
  preferred = new Date().toISOString().slice(0, 10),
): string {
  if (!activeDates.length) return preferred;
  if (activeDates.includes(preferred)) return preferred;
  const past = activeDates.filter((d) => d <= preferred);
  return past[past.length - 1] ?? activeDates[0];
}

export function formatActiveDayLabel(dayIndex: number, isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  const weekday = WEEKDAY_LABELS[d.getDay()] ?? "";
  return `اليوم ${dayIndex} — ${weekday}`;
}

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

/** O(1) — normalize raw widget value before persistence (matches engine semantics). */
export function normalizeTaskInput(
  task: { type: string; input_type?: string | null },
  raw: number,
): number {
  const inputType = resolveTaskInputType(task);
  if (inputType === "boolean") return raw > 0 ? 1 : 0;
  if (inputType === "numeric") return Math.max(0, Number(raw) || 0);
  return Math.max(0, Math.round(raw));
}

/** O(1) — signed point contribution for display/leaderboard (weight × normalized input). */
export function signedTaskPoints(
  task: { type: string; weight: number },
  normalizedInput: number,
): number {
  const weight = Number(task.weight) || 1;
  const pts = Math.abs(normalizedInput);
  return task.type === "deduction" ? -pts * weight : pts * weight;
}

export const TEACHER_TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: "addition", label: "إضافة نقاط" },
  { value: "deduction", label: "خصم نقاط" },
];

export const TEACHER_TASK_INPUT_OPTIONS: Array<{ value: TaskInputType; label: string }> = [
  { value: "boolean", label: "تشيك بوكس" },
  { value: "numeric", label: "عدد نقاط" },
  { value: "counter", label: "عدد أوجه" },
];

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
/** O(1) — normalize Saudi guardian phone for wa.me */
export function normalizeGuardianPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("966") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `966${digits}`;
  return digits.length >= 10 ? digits : null;
}

/** O(1) — build WhatsApp report link for guardian */
export function buildCompetitionWhatsAppUrl(
  guardianPhone: string | null | undefined,
  studentName: string,
  overallPct: number,
  rank: number,
): string | null {
  const phone = normalizeGuardianPhone(guardianPhone);
  if (!phone) return null;
  const text =
    `السلام عليكم ورحمة الله وبركاته 🍃 عزيزي ولي أمر الطالب: ${studentName}، ` +
    `نضع بين يديك الملخص لإنجاز ابنكم في مجمع حلق بساتين. ` +
    `نسبة إتقان الطالب الكلية في البرنامج: ${overallPct}%، وترتيبه الحالي: ${rank}. ` +
    `بارك الله في الجهود وأجزل لنا ولكم الأجر والمثوبة. 🌺`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

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
