/** حاسبة الخطة — 20 صفحة/جزء، وجهان/صفحة */
export const PAGES_PER_JUZ = 20;
export const FACES_PER_PAGE = 2;

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
  /** اختياري — عند التمرير يُستخدم لبناء تقويم تقدير الخطة وليس الفصل */
  duration_weeks?: number;
  rest_days?: "friday" | "saturday" | "friday_saturday";
};

export type PlanEstimate = {
  teaching_days_total: number;
  total_hifz_pages: number;
  total_juz: number;
  total_muraja_faces: number;
  total_rabt_faces: number;
  summary_ar: string;
};

export function parseSchoolDays(json: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(json ?? "[0,1,2,3,4]") as unknown;
    if (!Array.isArray(parsed)) return [0, 1, 2, 3, 4];
    return parsed.map((d) => Number(d)).filter((n) => n >= 0 && n <= 6);
  } catch {
    return [0, 1, 2, 3, 4];
  }
}

export function buildSemesterCalendar(
  semesterWeeks: number,
  schoolDaysJson: string | null | undefined,
): SemesterCalendar {
  const school_days = parseSchoolDays(schoolDaysJson);
  const weeks = Math.max(1, Number(semesterWeeks) || 16);
  const teaching_days_total = weeks * Math.max(1, school_days.length);
  return { semester_weeks: weeks, school_days, teaching_days_total };
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
  const total_juz = total_hifz_pages / PAGES_PER_JUZ;
  const total_muraja_faces = muraja * FACES_PER_PAGE * days;
  const total_rabt_faces = rabt * days;

  const juzRounded = Math.round(total_juz * 10) / 10;
  const summary_ar =
    `خطتك تعني أن الطالب سيحفظ في هذا الفصل إجمالاً ${juzRounded} جزءاً، ` +
    `وسيقوم بمراجعة ${Math.round(total_muraja_faces)} وجهاً، ` +
    `وربطاً بإجمالي ${Math.round(total_rabt_faces)} وجه (عند الالتزام اليومي).`;

  return {
    teaching_days_total: days,
    total_hifz_pages,
    total_juz: juzRounded,
    total_muraja_faces,
    total_rabt_faces,
    summary_ar,
  };
}

export type DailyMetrics = {
  hifz: {
    heard: boolean;
    repeated: boolean;
    errors: number;
    alerts: number;
  };
  muraja: {
    read: boolean;
    errors: number;
    alerts: number;
  };
  rabt: {
    read: boolean;
    faces_done: number;
  };
};

export function normalizeDailyMetrics(
  raw: unknown,
  dailyRabtFaces: number,
): DailyMetrics {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hifz = (m.hifz && typeof m.hifz === "object" ? m.hifz : {}) as Record<
    string,
    unknown
  >;
  const muraja = (m.muraja && typeof m.muraja === "object" ? m.muraja : {}) as Record<
    string,
    unknown
  >;
  const rabt = (m.rabt && typeof m.rabt === "object" ? m.rabt : {}) as Record<
    string,
    unknown
  >;

  const rabtRead = Boolean(rabt.read);
  const faces =
    rabtRead && !Number(rabt.faces_done)
      ? Math.max(0, dailyRabtFaces)
      : Math.max(0, Number(rabt.faces_done) || 0);

  return {
    hifz: {
      heard: Boolean(hifz.heard),
      repeated: Boolean(hifz.repeated),
      errors: Math.max(0, Math.min(99, Number(hifz.errors) || 0)),
      alerts: Math.max(0, Math.min(99, Number(hifz.alerts) || 0)),
    },
    muraja: {
      read: Boolean(muraja.read),
      errors: Math.max(0, Math.min(99, Number(muraja.errors) || 0)),
      alerts: Math.max(0, Math.min(99, Number(muraja.alerts) || 0)),
    },
    rabt: {
      read: rabtRead,
      faces_done: rabtRead ? faces : 0,
    },
  };
}

export function scoreFromMetrics(metrics: DailyMetrics): number {
  let score = 0;
  if (metrics.hifz.heard) score += 3;
  if (metrics.hifz.repeated) score += 2;
  if (metrics.muraja.read) score += 3;
  if (metrics.rabt.read) score += 2;
  score -= Math.min(5, metrics.hifz.errors + metrics.muraja.errors);
  return Math.max(0, Math.min(10, score));
}
