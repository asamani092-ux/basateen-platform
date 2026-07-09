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
  ends_at: string;
  duration_weeks: number;
  days_remaining: number;
  is_expired: boolean;
  is_active: number;
};

const plans = new Map<number, PlanRow>();
const planDays = new Map<string, { day_date: string; completed: number }>();
let planSeq = 1;
const marks = new Map<string, { metrics: DailyMetrics; score: number }>();

function planDayKey(planId: number, dayDate: string) {
  return `${planId}:${dayDate}`;
}

function markKey(studentId: number, date: string) {
  return `${studentId}:${date}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysRemaining(endsAt: string, today = PREVIEW_TODAY()): number {
  const [ey, em, ed] = endsAt.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round(
    (Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
  );
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

function refreshMeta(row: PlanRow): PlanRow {
  const rem = daysRemaining(row.ends_at);
  return { ...row, days_remaining: rem, is_expired: rem < 0 };
}

export const teacherPreviewStore = {
  calendar: () => ({ ...CALENDAR }),

  listPlans(): PlanRow[] {
    return [...plans.values()]
      .filter((p) => p.is_active === 1)
      .map(refreshMeta);
  },

  getPlan(studentId: number) {
    const active = [...plans.values()]
      .filter((p) => p.student_id === studentId && p.is_active === 1)
      .map(refreshMeta)
      .sort((a, b) => b.id - a.id);
    const plan = active[0] ?? null;
    const estimate = plan
      ? estimatePlan(CALENDAR, {
          daily_hifz_pages: plan.daily_hifz_pages,
          daily_muraja_pages: plan.daily_muraja_pages,
          daily_rabt_faces: plan.daily_rabt_faces,
          repeat_target: plan.repeat_target,
        })
      : null;
    return { plan, plans: active, calendar: CALENDAR, estimate };
  },

  savePlan(
    studentId: number,
    body: {
      plan_kind?: string;
      daily_hifz_pages?: number;
      daily_muraja_pages?: number;
      daily_rabt_faces?: number;
      repeat_target?: number;
      duration_weeks?: number;
      plan_id?: number;
    },
  ) {
    const stu = previewStore.findStudent(studentId);
    if (!stu) return null;
    const weeks = Math.max(1, Math.floor(Number(body.duration_weeks) || 0));
    if (weeks < 1) return null;

    const editId = body.plan_id != null ? Number(body.plan_id) : NaN;
    if (Number.isFinite(editId) && editId > 0) {
      const prev = plans.get(editId);
      if (!prev || prev.student_id !== studentId || prev.is_active !== 1) {
        return null;
      }
      const ends_at = addDaysIso(prev.starts_at, weeks * 7);
      const row = refreshMeta({
        ...prev,
        plan_kind: body.plan_kind ?? prev.plan_kind,
        daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
        daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
        daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
        repeat_target: Number(body.repeat_target) || 1,
        duration_weeks: weeks,
        ends_at,
      });
      plans.set(editId, row);
      const estimate = estimatePlan(CALENDAR, {
        daily_hifz_pages: row.daily_hifz_pages,
        daily_muraja_pages: row.daily_muraja_pages,
        daily_rabt_faces: row.daily_rabt_faces,
        repeat_target: row.repeat_target,
      });
      return {
        ok: true,
        id: editId,
        estimate,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        duration_weeks: weeks,
        days_remaining: row.days_remaining,
      };
    }

    const starts_at = PREVIEW_TODAY();
    const ends_at = addDaysIso(starts_at, weeks * 7);
    const id = planSeq++;
    const row = refreshMeta({
      id,
      student_id: studentId,
      full_name_ar: stu.full_name_ar,
      plan_kind: body.plan_kind ?? "combined",
      daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
      daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
      daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
      repeat_target: Number(body.repeat_target) || 1,
      circle_name: stu.circle_name,
      starts_at,
      ends_at,
      duration_weeks: weeks,
      days_remaining: 0,
      is_expired: false,
      is_active: 1,
    });
    plans.set(id, row);
    const estimate = estimatePlan(CALENDAR, {
      daily_hifz_pages: row.daily_hifz_pages,
      daily_muraja_pages: row.daily_muraja_pages,
      daily_rabt_faces: row.daily_rabt_faces,
      repeat_target: row.repeat_target,
    });
    return {
      ok: true,
      id,
      estimate,
      starts_at,
      ends_at,
      duration_weeks: weeks,
      days_remaining: row.days_remaining,
    };
  },

  deletePlan(planId: number) {
    const prev = plans.get(planId);
    if (!prev) return null;
    plans.set(planId, { ...prev, is_active: 0 });
    return { ok: true, id: planId, closed: true };
  },

  permanentDeletePlan(planId: number) {
    const prev = plans.get(planId);
    if (!prev) return null;
    for (const key of [...planDays.keys()]) {
      if (key.startsWith(`${planId}:`)) planDays.delete(key);
    }
    plans.delete(planId);
    return { ok: true, id: planId, deleted: true };
  },

  listPlanDays(planId: number) {
    const plan = plans.get(planId);
    if (!plan) return null;
    const days = [...planDays.entries()]
      .filter(([k]) => k.startsWith(`${planId}:`))
      .map(([, v]) => v);
    const completed = days.filter((d) => d.completed === 1).length;
    return {
      plan_id: planId,
      starts_at: plan.starts_at,
      ends_at: plan.ends_at,
      rest_days: "friday_saturday",
      total_working_days: 10,
      completed_days: completed,
      days,
    };
  },

  upsertPlanDays(
    planId: number,
    entries: Array<{ day_date?: string; completed?: boolean | number }>,
  ) {
    const plan = plans.get(planId);
    if (!plan) return null;
    for (const entry of entries) {
      const dayDate = String(entry.day_date ?? "").slice(0, 10);
      if (!dayDate) continue;
      planDays.set(planDayKey(planId, dayDate), {
        day_date: dayDate,
        completed: entry.completed ? 1 : 0,
      });
    }
    const days = [...planDays.entries()]
      .filter(([k]) => k.startsWith(`${planId}:`))
      .map(([, v]) => v);
    const completed = days.filter((d) => d.completed === 1).length;
    return {
      ok: true,
      plan_id: planId,
      total_working_days: 10,
      completed_days: completed,
    };
  },

  listPlansReport() {
    return [...plans.values()].map((p) => {
      const meta = refreshMeta(p);
      const daily =
        (meta.daily_hifz_pages || 0) +
        (meta.daily_muraja_pages || 0) +
        (meta.daily_rabt_faces || 0);
      const completed = [...planDays.entries()].filter(
        ([k, v]) => k.startsWith(`${meta.id}:`) && v.completed === 1,
      ).length;
      const total = 10;
      const achieved = completed * daily;
      const target = total * daily;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        ...meta,
        rest_days: "friday_saturday",
        plan_status: meta.is_active ? "active" : "closed",
        plan_status_ar: meta.is_active ? "نشطة" : "مغلقة",
        total_working_days: total,
        completed_days: completed,
        progress_pct: pct,
        daily_amount: daily,
        achieved,
        target,
        completion_pct: pct,
      };
    });
  },

  listMarks(date: string) {
    return teacherStudents()
      .map((s) => {
        const m = marks.get(markKey(s.id, date));
        if (!m) return null;
        const active = [...plans.values()]
          .filter((p) => p.student_id === s.id && p.is_active === 1)
          .sort((a, b) => b.id - a.id)[0];
        return {
          id: s.id,
          student_id: s.id,
          mark_date: date,
          score: m.score,
          notes: null,
          metrics: m.metrics,
          attendance_auto: 1,
          plan_id: active?.id ?? null,
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
    const active = [...plans.values()]
      .filter((p) => p.student_id === studentId && p.is_active === 1)
      .sort((a, b) => b.id - a.id)[0];
    return {
      ok: true,
      attendance_recorded: true,
      mark_date: date,
      student_id: studentId,
      score,
      metrics,
      plan_id: active?.id ?? null,
      updated_at: new Date().toISOString(),
    };
  },

  seedDemoPlan() {
    const students = teacherStudents();
    if (students[0] && ![...plans.values()].some((p) => p.student_id === students[0].id)) {
      this.savePlan(students[0].id, {
        plan_kind: "combined",
        daily_hifz_pages: 0.5,
        daily_muraja_pages: 0.5,
        daily_rabt_faces: 2,
        repeat_target: 3,
        duration_weeks: 2,
      });
    }
  },
};

teacherPreviewStore.seedDemoPlan();
