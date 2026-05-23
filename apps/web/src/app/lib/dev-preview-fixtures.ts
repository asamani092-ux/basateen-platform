import type { StudentRow } from "./api-client";

export const PREVIEW_TODAY = () => new Date().toISOString().slice(0, 10);

/** حسابات المعاينة — متوافقة مع auth-store و setup/seed-users */
export const PREVIEW_USERS: Record<
  string,
  {
    id: number;
    email: string;
    full_name_ar: string;
    role: string;
    sections: string[];
    supervisor_scope?: string;
  }
> = {
  "0500000001": {
    id: 1,
    email: "manager@basateen.local",
    full_name_ar: "عبدالله — مدير عام",
    role: "general_manager",
    sections: ["admin", "education", "programs"],
  },
  "0500000002": {
    id: 2,
    email: "edu@basateen.local",
    full_name_ar: "مشرف تعليمي (ابتدائي)",
    role: "edu_supervisor",
    sections: ["admin", "education"],
    supervisor_scope: "2",
  },
  "0500000003": {
    id: 3,
    email: "programs@basateen.local",
    full_name_ar: "مشرف البرامج",
    role: "prog_supervisor",
    sections: ["programs"],
  },
  "0500000004": {
    id: 4,
    email: "general@basateen.local",
    full_name_ar: "مشرف عام",
    role: "general_supervisor",
    sections: ["admin", "education", "programs"],
    supervisor_scope: "global",
  },
  "0500000005": {
    id: 5,
    email: "teacher@basateen.local",
    full_name_ar: "معلم حلقة الصديق",
    role: "teacher",
    sections: ["education"],
  },
};

/** روابط ثابتة للمعاينة بدون API */
export const PREVIEW_LIVE_LOG = {
  himma: "demo-himma-live",
  competitionExtended: "demo-comp-extended",
  competitionIntensive: "demo-comp-intensive",
} as const;

export function cloneStudents(): StudentRow[] {
  return [
    {
      id: 1,
      full_name_ar: "أحمد محمد العتيبي",
      national_id: "1010000001",
      nationality: "سعودي",
      phone: "0501111001",
      school_name: "مدرسة النور",
      school_grade: "الخامس",
      memorization_amount: "5 أجزاء",
      guardian_phone: "0502222001",
      health_notes: null,
      circle_name: "حلقة الصديق",
      track_name: "مسار الحفظ",
      stage_id: 2,
      admission_status: null,
      age: 11,
    },
    {
      id: 2,
      full_name_ar: "خالد سعود القحطاني",
      national_id: "1010000002",
      nationality: "سعودي",
      phone: "0501111002",
      school_name: "مدرسة النور",
      school_grade: "السادس",
      memorization_amount: "3 أجزاء",
      guardian_phone: "0502222002",
      health_notes: null,
      circle_name: null,
      track_name: null,
      stage_id: 2,
      admission_status: "pending_placement",
      age: 12,
    },
    {
      id: 4,
      full_name_ar: "سلمان ناصر الحربي",
      national_id: "1010000004",
      nationality: null,
      phone: "0501111004",
      school_name: null,
      school_grade: "الخامس",
      memorization_amount: "جزءان",
      guardian_phone: "0502222004",
      health_notes: null,
      circle_name: "حلقة النور",
      track_name: "مسار الحفظ",
      stage_id: 2,
      admission_status: null,
      age: 11,
    },
    {
      id: 5,
      full_name_ar: "يوسف إبراهيم الدوسري",
      national_id: "1010000005",
      nationality: null,
      phone: "0501111005",
      school_name: null,
      school_grade: "السادس",
      memorization_amount: null,
      guardian_phone: "0502222005",
      health_notes: null,
      circle_name: "حلقة النور",
      track_name: "مسار الحفظ",
      stage_id: 2,
      admission_status: null,
      age: 12,
    },
    {
      id: 9,
      full_name_ar: "نورة عبدالرحمن — انتظار تسكين",
      national_id: "1010000009",
      nationality: null,
      phone: "0501111009",
      school_name: null,
      school_grade: "الرابع",
      memorization_amount: null,
      guardian_phone: "0502222009",
      health_notes: null,
      circle_name: null,
      track_name: null,
      stage_id: 2,
      admission_status: "pending_placement",
      age: 10,
    },
    {
      id: 7,
      full_name_ar: "ماجد فهد الغامدي",
      national_id: "1010000007",
      nationality: null,
      phone: "0501111007",
      school_name: null,
      school_grade: "الأول متوسط",
      memorization_amount: null,
      guardian_phone: "0502222007",
      health_notes: null,
      circle_name: "حلقة الإتقان",
      track_name: "مسار التثبيت",
      stage_id: 3,
      admission_status: null,
      age: 13,
    },
  ];
}

export const PREVIEW_CIRCLES = [
  { id: 1, name_ar: "حلقة الصديق", capacity: 15, stage_id: 2, track_name: "مسار الحفظ" },
  { id: 2, name_ar: "حلقة النور", capacity: 12, stage_id: 2, track_name: "مسار الحفظ" },
  { id: 3, name_ar: "حلقة الإتقان", capacity: 10, stage_id: 3, track_name: "مسار التثبيت" },
];

export const PREVIEW_TRACKS = [
  { id: 1, name_ar: "مسار الحفظ" },
  { id: 2, name_ar: "مسار التثبيت" },
];

export const PREVIEW_EDU_PLANS: Record<
  number,
  { targets: Record<string, unknown>; notes: string | null }
> = {
  1: {
    targets: { hifz_pages: 3, muraja_pages: 2, sama_minutes: 15 },
    notes: "خطة أسبوعية — معاينة",
  },
  4: {
    targets: { hifz_pages: 2, muraja_pages: 1, sama_minutes: 10 },
    notes: null,
  },
};

export function buildTeacherMarksPreview(studentId: number): Array<Record<string, unknown>> {
  const today = new Date();
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const markDate = d.toISOString().slice(0, 10);
    out.push({
      mark_date: markDate,
      score: 7 + ((studentId + i) % 4),
      notes: i === 0 ? "أداء ممتاز" : null,
      attendance_auto: 1,
      logged_at: `${markDate}T08:30:00`,
    });
  }
  return out;
}

export const PREVIEW_COMPETITIONS: Array<Record<string, unknown>> = [
  {
    id: 1,
    name_ar: "سرد ممتد — رمضان (معاينة)",
    start_date: PREVIEW_TODAY(),
    end_date: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 6);
      return d.toISOString().slice(0, 10);
    })(),
    status: "active",
    telemetry_type: "extended_recitation",
    live_log_token: PREVIEW_LIVE_LOG.competitionExtended,
    tv_launch_key: "preview-comp-ext",
    stage_id: 2,
  },
  {
    id: 2,
    name_ar: "برنامج مكثف — أسبوع الإتقان (معاينة)",
    start_date: PREVIEW_TODAY(),
    end_date: PREVIEW_TODAY(),
    status: "active",
    telemetry_type: "intensive_routine",
    live_log_token: PREVIEW_LIVE_LOG.competitionIntensive,
    tv_launch_key: "preview-comp-int",
    stage_id: 2,
  },
];

export function buildCompetitionPlans() {
  const start = PREVIEW_TODAY();
  const dist: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${start}T00:00:00`);
    d.setDate(d.getDate() + i);
    dist[d.toISOString().slice(0, 10)] = 0.5;
  }
  return [1, 4, 5].map((sid, idx) => ({
    student_id: sid,
    full_name_ar:
      cloneStudents().find((s) => s.id === sid)?.full_name_ar ?? `طالب ${sid}`,
    total_target_juz: 3.5,
    daily_volume_juz: 0.5,
    distributed_json: JSON.stringify(dist),
  }));
}

export const PREVIEW_COMPETITION_LOGS: Array<Record<string, unknown>> = [
  {
    student_id: 1,
    full_name_ar: "أحمد محمد العتيبي",
    log_date: PREVIEW_TODAY(),
    metrics_json: JSON.stringify({ hifz_pages: 4, muraja_pages: 2, sama_done: 1 }),
    source: "edu_supervisor",
  },
  {
    student_id: 4,
    full_name_ar: "سلمان ناصر الحربي",
    log_date: PREVIEW_TODAY(),
    metrics_json: JSON.stringify({ hifz_pages: 3, muraja_pages: 1, sama_done: 0 }),
    source: "live_log",
  },
  {
    student_id: 5,
    full_name_ar: "يوسف إبراهيم الدوسري",
    log_date: PREVIEW_TODAY(),
    metrics_json: JSON.stringify({ hifz_pages: 2, muraja_pages: 2, sama_done: 1 }),
    source: "edu_supervisor",
  },
];

export const PREVIEW_HIMMA_SESSION = {
  id: 1,
  name_ar: "يوم الهمة — معاينة تعليمية",
  session_date: PREVIEW_TODAY(),
  status: "live",
  tv_launch_key: "preview-himma-tv",
  live_log_token: PREVIEW_LIVE_LOG.himma,
  rules: {
    hizb_points: 1,
    alert_penalty: 1,
    error_penalty: 2,
    alerts_per_error: 5,
    fail_threshold_errors: 3,
  },
};

export function buildHimmaTargets() {
  return [1, 4, 5].map((sid) => ({
    student_id: sid,
    full_name_ar:
      cloneStudents().find((s) => s.id === sid)?.full_name_ar ?? `طالب ${sid}`,
    target_hizb: 2,
    target_juz: 1,
  }));
}

export function buildHimmaAudit() {
  return [
    {
      student_id: 1,
      attendance: "present",
      juz_done: 1,
      hizb_done: 2,
      alerts_count: 1,
      errors_count: 0,
      current_hizb_failed: 0,
    },
    {
      student_id: 4,
      attendance: "present",
      juz_done: 0.5,
      hizb_done: 1,
      alerts_count: 2,
      errors_count: 1,
      current_hizb_failed: 0,
    },
    {
      student_id: 5,
      attendance: "absent",
      juz_done: 0,
      hizb_done: 0,
      alerts_count: 0,
      errors_count: 0,
      current_hizb_failed: 0,
    },
  ];
}
