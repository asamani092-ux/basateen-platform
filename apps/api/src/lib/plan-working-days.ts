import { addDaysIso, weekdayIso } from "./today-riyadh-iso";
import type { SemesterCalendar } from "./plan-estimator";

/** إعداد أيام العطلة الأسبوعية للخطة */
export type RestDaysSetting = "friday" | "saturday" | "friday_saturday";

const REST_WEEKDAYS: Record<RestDaysSetting, ReadonlySet<number>> = {
  friday: new Set([5]),
  saturday: new Set([6]),
  friday_saturday: new Set([5, 6]),
};

export const REST_DAYS_DEFAULT: RestDaysSetting = "friday_saturday";

/** O(1) — التحقق من قيمة rest_days */
export function parseRestDays(raw: unknown): RestDaysSetting {
  const v = String(raw ?? "").trim();
  if (v === "friday" || v === "saturday" || v === "friday_saturday") return v;
  return REST_DAYS_DEFAULT;
}

/** O(1) */
export function isRestDay(iso: string, restDays: RestDaysSetting): boolean {
  return REST_WEEKDAYS[restDays].has(weekdayIso(iso));
}

/** O(1) */
export function workingDaysPerWeek(restDays: RestDaysSetting): number {
  return 7 - REST_WEEKDAYS[restDays].size;
}

/** O(1) — إجمالي أيام العمل في الخطة = أسابيع × أيام عمل/أسبوع */
export function totalPlanWorkingDays(
  durationWeeks: number,
  restDays: RestDaysSetting,
): number {
  const weeks = Math.max(1, Math.floor(Number(durationWeeks) || 0));
  return weeks * workingDaysPerWeek(restDays);
}

/**
 * O(W×7) زمنياً — W=أسابيع الخطة؛ O(1) مكانياً
 * يُحسب ends_at بعد عدّ duration_weeks × working_days_per_week يوم عمل (يبدأ من starts_at).
 */
export function computeEndsAtFromWorkingDays(
  startsAt: string,
  durationWeeks: number,
  restDays: RestDaysSetting,
): string {
  const start = startsAt.trim().slice(0, 10);
  const target = totalPlanWorkingDays(durationWeeks, restDays);
  if (target < 1) return start;

  let cursor = start;
  let counted = 0;
  const maxScan = Math.max(7, durationWeeks * 7 + 14);

  for (let i = 0; i < maxScan && counted < target; i++) {
    if (!isRestDay(cursor, restDays)) {
      counted += 1;
      if (counted === target) return cursor;
    }
    cursor = addDaysIso(cursor, 1);
  }
  return cursor;
}

/**
 * O(D) — D=عدد الأيام بين starts_at وends_at؛ O(1) مكانياً
 */
export function countWorkingDaysInRange(
  startsAt: string,
  endsAt: string,
  restDays: RestDaysSetting,
): number {
  const start = startsAt.trim().slice(0, 10);
  const end = endsAt.trim().slice(0, 10);
  if (start > end) return 0;

  let cursor = start;
  let count = 0;
  while (cursor <= end) {
    if (!isRestDay(cursor, restDays)) count += 1;
    if (cursor === end) break;
    cursor = addDaysIso(cursor, 1);
  }
  return count;
}

/**
 * O(D) — قائمة تواريخ أيام العمل ضمن المدى
 */
export function listWorkingDayDates(
  startsAt: string,
  endsAt: string,
  restDays: RestDaysSetting,
): string[] {
  const start = startsAt.trim().slice(0, 10);
  const end = endsAt.trim().slice(0, 10);
  if (start > end) return [];

  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (!isRestDay(cursor, restDays)) out.push(cursor);
    if (cursor === end) break;
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

/** O(1) — تقويم تقدير الخطة (لا يستخدم أيام الفصل كاملة) */
export function buildPlanEstimateCalendar(
  base: SemesterCalendar,
  durationWeeks: number,
  restDays: RestDaysSetting,
): SemesterCalendar {
  const weeks = Math.max(1, Math.floor(Number(durationWeeks) || 0));
  return {
    ...base,
    semester_weeks: weeks,
    teaching_days_total: totalPlanWorkingDays(weeks, restDays),
  };
}

/** O(1) — المقدار اليومي الثابت حسب نوع الخطة (للتقرير) */
export function planDailyAmount(row: {
  plan_kind: string;
  daily_hifz_pages?: unknown;
  daily_muraja_pages?: unknown;
  daily_rabt_faces?: unknown;
}): number {
  const kind = String(row.plan_kind ?? "combined");
  if (kind === "muraja") return Math.max(0, Number(row.daily_muraja_pages) || 0);
  if (kind === "tilawa") return Math.max(0, Number(row.daily_rabt_faces) || 0);
  if (kind === "hifz_new") return Math.max(0, Number(row.daily_hifz_pages) || 0);
  return (
    Math.max(0, Number(row.daily_hifz_pages) || 0) +
    Math.max(0, Number(row.daily_muraja_pages) || 0) +
    Math.max(0, Number(row.daily_rabt_faces) || 0)
  );
}
