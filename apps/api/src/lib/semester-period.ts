import type { Env } from "../types";
import { tableHasColumn } from "./db-schema";

export type SemesterPeriod = {
  active: boolean;
  start_date: string | null;
  end_date: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchSemesterPeriod(
  env: Env,
  complexId: number,
): Promise<SemesterPeriod> {
  const hasActive = await tableHasColumn(env, "complex_settings", "semester_active");
  if (!hasActive) {
    return { active: false, start_date: null, end_date: null };
  }
  const row = await env.DB.prepare(
    `SELECT semester_active, semester_start_date, semester_end_date
     FROM complex_settings WHERE complex_id = ?`,
  )
    .bind(complexId)
    .first<{
      semester_active: number;
      semester_start_date: string | null;
      semester_end_date: string | null;
    }>();

  const active = Number(row?.semester_active ?? 0) === 1;
  return {
    active,
    start_date: row?.semester_start_date ?? null,
    end_date: row?.semester_end_date ?? null,
  };
}

/** نطاق الاستعلامات الإدارية — الفصل النشط أو اليوم فقط */
export function semesterQueryRange(period: SemesterPeriod): {
  start: string;
  end: string;
} {
  const today = todayIso();
  if (period.active && period.start_date) {
    const end = period.end_date && period.end_date >= period.start_date
      ? period.end_date
      : today;
    return { start: period.start_date, end: end > today ? today : end };
  }
  return { start: today, end: today };
}
