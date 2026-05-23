import { PREVIEW_TODAY } from "./dev-preview-fixtures";
import { previewStore } from "./dev-preview-store";
import type { DailyMetrics } from "./teacher/daily-metrics";
import { estimatePlan } from "./teacher/plan-estimator";

const CALENDAR = {
  semester_weeks: 16,
  school_days: [0, 1, 2, 3, 4],
  teaching_days_total: 80,
};

type PlanRow = {
  id: number;
  student_id: number;
  full_name_ar: string;
  plan_kind: string;
  daily_hifz_pages: number;
  daily_muraja_pages: number;
  daily_rabt_faces: number;
  repeat_target: number;
  circle_name: string | null;
  starts_at: string;
};

const plans = new Map<number, PlanRow>();
const marks = new Map<string, { metrics: DailyMetrics; score: number }>();

function markKey(studentId: number, date: string) {
  return `${studentId}:${date}`;
}

function teacherStudents() {
  return previewStore
    .getStudents()
    .filter(
      (s) =>
        s.admission_status !== "pending_placement" &&
        (s.circle_name === "حلقة الصديق" || s.id === 1),
    );
}

export const teacherPreviewStore = {
  calendar: () => ({ ...CALENDAR }),

  listPlans(): PlanRow[] {
    return [...plans.values()];
  },

  getPlan(studentId: number) {
    const plan = plans.get(studentId) ?? null;
    const estimate = plan
      ? estimatePlan(CALENDAR, {
          daily_hifz_pages: plan.daily_hifz_pages,
          daily_muraja_pages: plan.daily_muraja_pages,
          daily_rabt_faces: plan.daily_rabt_faces,
          repeat_target: plan.repeat_target,
        })
      : null;
    return { plan, calendar: CALENDAR, estimate };
  },

  savePlan(
    studentId: number,
    body: {
      plan_kind?: string;
      daily_hifz_pages?: number;
      daily_muraja_pages?: number;
      daily_rabt_faces?: number;
      repeat_target?: number;
    },
  ) {
    const stu = previewStore.findStudent(studentId);
    if (!stu) return null;
    const id = plans.get(studentId)?.id ?? plans.size + 1;
    const row: PlanRow = {
      id,
      student_id: studentId,
      full_name_ar: stu.full_name_ar,
      plan_kind: body.plan_kind ?? "combined",
      daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
      daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
      daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
      repeat_target: Number(body.repeat_target) || 1,
      circle_name: stu.circle_name,
      starts_at: PREVIEW_TODAY(),
    };
    plans.set(studentId, row);
    const estimate = estimatePlan(CALENDAR, {
      daily_hifz_pages: row.daily_hifz_pages,
      daily_muraja_pages: row.daily_muraja_pages,
      daily_rabt_faces: row.daily_rabt_faces,
      repeat_target: row.repeat_target,
    });
    return { ok: true, id, estimate };
  },

  listMarks(date: string) {
    return teacherStudents()
      .map((s) => {
        const m = marks.get(markKey(s.id, date));
        if (!m) return null;
        return {
          id: s.id,
          student_id: s.id,
          mark_date: date,
          score: m.score,
          notes: null,
          metrics: m.metrics,
          attendance_auto: 1,
          plan_id: plans.get(s.id)?.id ?? null,
          updated_at: PREVIEW_TODAY(),
          full_name_ar: s.full_name_ar,
        };
      })
      .filter(Boolean);
  },

  upsertMark(
    studentId: number,
    date: string,
    metrics: DailyMetrics,
    score: number,
  ) {
    marks.set(markKey(studentId, date), { metrics, score });
    return {
      ok: true,
      attendance_recorded: true,
      mark_date: date,
      student_id: studentId,
      score,
      metrics,
      plan_id: plans.get(studentId)?.id ?? null,
      updated_at: new Date().toISOString(),
    };
  },

  seedDemoPlan() {
    const students = teacherStudents();
    if (students[0] && !plans.has(students[0].id)) {
      this.savePlan(students[0].id, {
        plan_kind: "combined",
        daily_hifz_pages: 0.5,
        daily_muraja_pages: 0.5,
        daily_rabt_faces: 2,
        repeat_target: 3,
      });
    }
  },
};

teacherPreviewStore.seedDemoPlan();
