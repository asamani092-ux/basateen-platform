export const PAGES_PER_JUZ = 20;
export const FACES_PER_PAGE = 2;

export type RestDaysSetting = "friday" | "saturday" | "friday_saturday";

export type SemesterCalendar = {
  semester_weeks: number;
  school_days: number[];
  teaching_days_total: number;
};

export type PlanInputs = {
  daily_hifz_pages: number;
  daily_muraja_pages: number;
  daily_rabt_faces: number;
  repeat_target: number;
};

export type PlanEstimate = {
  teaching_days_total: number;
  total_hifz_pages: number;
  total_juz: number;
  total_muraja_faces: number;
  total_rabt_faces: number;
  summary_ar: string;
};

const REST_WEEKDAYS: Record<RestDaysSetting, number> = {
  friday: 1,
  saturday: 1,
  friday_saturday: 2,
};

/** O(1) */
export function workingDaysPerWeek(restDays: RestDaysSetting): number {
  return 7 - REST_WEEKDAYS[restDays];
}

/** O(1) */
export function totalPlanWorkingDays(
  durationWeeks: number,
  restDays: RestDaysSetting,
): number {
  const weeks = Math.max(1, Math.floor(Number(durationWeeks) || 0));
  return weeks * workingDaysPerWeek(restDays);
}

/** O(1) — تقويم تقدير الخطة وليس الفصل كاملاً */
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

export function estimatePlan(
  calendar: SemesterCalendar,
  inputs: PlanInputs,
): PlanEstimate {
  const days = calendar.teaching_days_total;
  const hifz = Math.max(0, Number(inputs.daily_hifz_pages) || 0);
  const muraja = Math.max(0, Number(inputs.daily_muraja_pages) || 0);
  const rabt = Math.max(0, Number(inputs.daily_rabt_faces) || 0);

  const total_hifz_pages = hifz * days;
  const total_juz = Math.round((total_hifz_pages / PAGES_PER_JUZ) * 10) / 10;
  const total_muraja_faces = muraja * FACES_PER_PAGE * days;
  const total_rabt_faces = rabt * days;

  const summary_ar =
    `خطتك تعني أن الطالب سيحفظ خلال مدة الخطة إجمالاً ${total_juz} جزءاً، ` +
    `وسيقوم بمراجعة ${Math.round(total_muraja_faces)} وجهاً، ` +
    `وربطاً بإجمالي ${Math.round(total_rabt_faces)} وجه (عند الالتزام اليومي).`;

  return {
    teaching_days_total: days,
    total_hifz_pages,
    total_juz,
    total_muraja_faces,
    total_rabt_faces,
    summary_ar,
  };
}
