import { getApiToken } from "./api-token";
import { isUiDevPreview } from "./dev-preview";
import { resolveDevPreviewMock } from "./dev-preview-mocks";
import {
  redirectToLoginAfterSessionReset,
  resetClientSession,
} from "./session-reset";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type TvSummary = {
  complex: string;
  date: string | null;
  present: number;
  absent: number;
  attendance_rate: number;
  active_circles: number;
  updated_at: string;
};

export type AuthUser = {
  id: number;
  email: string;
  full_name_ar: string;
  role: string;
  sections: string[];
};

export type StudentRow = {
  id: number;
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  guardian_phone: string | null;
  health_notes: string | null;
  circle_name: string | null;
  track_name: string | null;
  stage_id?: number | null;
  admission_status?: string | null;
  age?: number | null;
};

export type StudentExportRow = {
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  guardian_phone: string | null;
  guardian_national_id: string | null;
  circle_name: string | null;
  health_notes: string | null;
};

export type StudentImportRow = Omit<StudentExportRow, "guardian_national_id"> & {
  guardian_national_id?: string | null;
};

export type CircleOption = {
  id: number;
  name_ar: string;
  capacity: number;
  default_capacity?: number;
  track_id: number | null;
  track_name: string | null;
  stage_id?: number;
  stage?: string | null;
  student_count?: number;
  seats_remaining?: number;
  near_capacity?: boolean;
  at_or_over_capacity?: boolean;
  alert_level?: "ok" | "near" | "full";
};

export type AdminCircleRow = {
  id: number;
  name_ar: string;
  stage_id: number;
  default_capacity: number;
  student_count: number;
  seats_remaining: number;
  near_capacity: boolean;
  at_or_over_capacity: boolean;
  alert_level: "ok" | "near" | "full";
  teacher_id: number | null;
  teacher_name: string | null;
  track_id: number | null;
  track_name: string | null;
  is_active: number;
  capacity_warning: string | null;
};

export type AdminTrackRow = {
  id: number;
  name_ar: string;
  default_capacity: number;
  is_active: number;
  supervisor_id?: number;
  supervisor_name?: string | null;
  stage_ids: number[];
  circle_ids: number[];
  circles: Array<{ id: number; name_ar: string }>;
  student_count: number;
};

export type StaffTeacherRow = {
  id: number;
  full_name_ar: string;
  mobile: string | null;
  is_active: number;
  circle_id: number | null;
  circle_name: string | null;
  stage_id: number;
};

export type StaffSupervisorRow = {
  id: number;
  full_name_ar: string;
  mobile: string | null;
  role: string;
  supervisor_scope: string;
  is_active: number;
};

export type StudentPlacement = {
  history_id: number;
  circle_id: number;
  circle_name: string;
  track_id: number | null;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
};

export type HistoryRow = {
  id: number;
  circle_name: string;
  track_name: string | null;
  from_at: string;
  to_at: string | null;
  frozen_at: string | null;
  note: string | null;
};

export type StudentDetail = {
  student: { id: number; full_name_ar: string; phone: string | null };
  current: StudentPlacement | null;
  history: HistoryRow[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const bodyText =
    typeof init?.body === "string" ? init.body : undefined;

  if (isUiDevPreview()) {
    await new Promise((r) => setTimeout(r, 60));
    return resolveDevPreviewMock<T>(path, method, bodyText);
  }

  const url = `${API_BASE.replace(/\/$/, "")}${path}`;
  const token = getApiToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if ((body as { clear_polluted_session?: boolean }).clear_polluted_session) {
      resetClientSession();
      redirectToLoginAfterSessionReset();
      throw new Error("legacy_session_detected");
    }
    throw new Error(
      (body as { error?: string; message?: string }).error ??
        (body as { message?: string }).message ??
        `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; service?: string }>("/api/health"),
  tvSummary: () => request<TvSummary>("/api/tv/summary"),
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  loginMobile: (mobile: string) =>
    request<{ token: string; user: AuthUser }>("/api/auth/login-mobile", {
      method: "POST",
      body: JSON.stringify({ mobile }),
    }),
  me: () => request<{ user: AuthUser }>("/api/auth/me"),
  students: (q?: string) => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return request<{ items: StudentRow[]; count: number }>(
      `/api/students${qs ? `?${qs}` : ""}`,
    );
  },
  circles: () => request<{ items: CircleOption[] }>("/api/circles"),
  studentDetail: (id: number) =>
    request<StudentDetail>(`/api/students/${id}`),
  transferStudent: (
    id: number,
    body: { circle_id: number; track_id?: number | null; note?: string },
  ) =>
    request<{
      ok: boolean;
      message: string;
      placement: StudentPlacement;
      capacity_warning?: string | null;
      capacity?: {
        student_count: number;
        default_capacity: number;
        seats_remaining: number;
        near_capacity: boolean;
        at_or_over_capacity: boolean;
      };
    }>(`/api/students/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  studentsExport: () =>
    request<{ items: StudentExportRow[]; count: number }>(
      "/api/students/export",
    ),
  studentsBulkImport: (
    mode: "register" | "transfer",
    rows: StudentImportRow[],
  ) =>
    request<{
      ok: boolean;
      mode: string;
      total: number;
      success: number;
      failed: number;
      results: Array<{ row: number; ok: boolean; error?: string; action?: string }>;
    }>("/api/students/bulk", {
      method: "POST",
      body: JSON.stringify({ mode, rows }),
    }),
  yomHimmaList: () =>
    request<{
      items: Array<{
        id: number;
        name_ar: string;
        session_date: string;
        status: string;
        tv_launch_key: string;
      }>;
    }>("/api/yom-himma"),
  yomHimmaCreate: (body: unknown) =>
    request<{ ok: boolean; id: number; tv_launch_key: string }>("/api/yom-himma", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  yomHimmaDetail: (id: number) =>
    request<{
      session: Record<string, unknown>;
      targets: Array<Record<string, unknown>>;
      audit: Array<Record<string, unknown>>;
    }>(`/api/yom-himma/${id}`),
  yomHimmaAudit: (sessionId: number, body: unknown) =>
    request<{ ok: boolean; failed: boolean }>(
      `/api/yom-himma/${sessionId}/audit`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  yomHimmaTv: (key: string) =>
    request<{ session: Record<string, unknown>; stats: Record<string, number> }>(
      `/api/yom-himma/tv?key=${encodeURIComponent(key)}`,
    ),
  yomHimmaLiveLogToken: (sessionId: number) =>
    request<{ ok: boolean; live_log_token: string; path: string }>(
      `/api/yom-himma/${sessionId}/live-log-token`,
      { method: "POST", body: "{}" },
    ),
  liveLogSession: (token: string, pin: string) =>
    request<{
      kind: "yom_himma" | "competition";
      session: Record<string, unknown>;
      students: Array<Record<string, unknown>>;
      audit?: Array<Record<string, unknown>>;
      logs?: Array<Record<string, unknown>>;
    }>(`/api/live-log/${encodeURIComponent(token)}`, {
      headers: { "X-Live-Pin": pin },
    }),
  liveLogUpsert: (
    token: string,
    body: Record<string, unknown>,
    pin: string,
  ) =>
    request<{ ok: boolean; failed?: boolean; tv_key?: string }>(
      `/api/live-log/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "X-Live-Pin": pin },
        body: JSON.stringify(body),
      },
    ),
  competitionsList: () =>
    request<{ items: Array<Record<string, unknown>> }>(
      "/api/edu-dept/competitions",
    ),
  competitionsCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number; tv_launch_key: string }>(
      "/api/edu-dept/competitions",
      { method: "POST", body: JSON.stringify(body) },
    ),
  competitionsDetail: (id: number) =>
    request<{
      competition: Record<string, unknown>;
      targets: Array<Record<string, unknown>>;
      plans: Array<Record<string, unknown>>;
    }>(`/api/edu-dept/competitions/${id}`),
  competitionsLiveLogToken: (id: number) =>
    request<{ ok: boolean; live_log_token: string; path: string }>(
      `/api/edu-dept/competitions/${id}/live-log-token`,
      { method: "POST", body: "{}" },
    ),
  competitionsActivate: (id: number) =>
    request<{ ok: boolean }>(
      `/api/edu-dept/competitions/${id}/activate`,
      { method: "POST", body: "{}" },
    ),
  eduDashboard: () =>
    request<{
      scope_label: string;
      kpis: {
        pending_placement: number;
        active_students: number;
        active_competitions: number;
        teacher_marks_today: number;
      };
      active_himma: { id: number; name_ar: string } | null;
    }>("/api/edu-dept/dashboard"),
  eduScope: () =>
    request<{
      supervisor_scope: string;
      scope: { type: string; stageIds?: number[] };
    }>("/api/edu-dept/scope"),
  eduStudentProfile: (studentId: number) =>
    request<{
      student: Record<string, unknown>;
      current: Record<string, unknown> | null;
      edu_plan: { targets: Record<string, unknown>; notes: string | null };
      teacher_marks: Array<Record<string, unknown>>;
      competitions_summary: Array<Record<string, unknown>>;
    }>(`/api/edu-dept/students/${studentId}`),
  eduStudentPlanPatch: (
    studentId: number,
    body: { targets?: Record<string, unknown>; notes?: string },
  ) =>
    request<{ ok: boolean }>(`/api/edu-dept/students/${studentId}/plan`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduApplyHimmaPlan: (studentId: number, body: { session_id: number }) =>
    request<{ ok: boolean }>(
      `/api/edu-dept/students/${studentId}/apply-himma-plan`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  eduTargetOptions: () =>
    request<{
      students: Array<Record<string, unknown>>;
      circles: Array<Record<string, unknown>>;
      tracks: Array<Record<string, unknown>>;
    }>("/api/edu-dept/target-options"),
  complexSettings: () =>
    request<{
      graduates_count: number;
      huffadh_count: number;
      display_mode: string;
      slides: unknown[];
    }>("/api/complex/settings"),
  patchComplexSettings: (body: unknown) =>
    request<{ ok: boolean }>("/api/complex/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  teacherCalendar: () =>
    request<{
      semester_weeks: number;
      school_days: number[];
      teaching_days_total: number;
    }>("/api/teacher/calendar"),
  teacherPlansList: () =>
    request<{ items: Array<Record<string, unknown>> }>("/api/teacher/plans"),
  teacherPlanGet: (studentId: number) =>
    request<{
      plan: Record<string, unknown> | null;
      calendar: {
        semester_weeks: number;
        school_days: number[];
        teaching_days_total: number;
      };
      estimate: Record<string, unknown> | null;
    }>(`/api/teacher/plans/${studentId}`),
  teacherPlanSave: (studentId: number, body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number; estimate: Record<string, unknown> }>(
      `/api/teacher/plans/${studentId}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  teacherPlanEstimate: (body: Record<string, unknown>) =>
    request<{
      estimate: Record<string, unknown>;
      calendar: {
        semester_weeks: number;
        school_days: number[];
        teaching_days_total: number;
      };
    }>("/api/teacher/plans/estimate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  teacherDailyMarks: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      date: string;
      items: Array<{
        id: number;
        student_id: number;
        mark_date: string;
        score: number | null;
        notes: string | null;
        metrics: Record<string, unknown> | null;
        attendance_auto: number;
        plan_id: number | null;
        updated_at?: string;
      }>;
    }>(`/api/teacher/daily-marks${qs}`);
  },
  teacherDailyUpsert: (body: {
    student_id: number;
    mark_date?: string;
    score?: number | null;
    notes?: string | null;
    plan_id?: number | null;
    metrics?: Record<string, unknown>;
  }) =>
    request<{
      ok: boolean;
      attendance_recorded: boolean;
      mark_date: string;
      student_id: number;
      score?: number;
      metrics?: Record<string, unknown>;
      plan_id?: number | null;
      updated_at?: string;
    }>("/api/teacher/daily-marks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminTeachers: () =>
    request<{ items: StaffTeacherRow[] }>("/api/admin/teachers"),
  adminTeachersCreate: (body: {
    full_name_ar: string;
    mobile: string;
    circle_id: number;
  }) =>
    request<{ ok: boolean; id: number }>("/api/admin/teachers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminSupervisors: () =>
    request<{ items: StaffSupervisorRow[] }>("/api/admin/supervisors"),
  adminSupervisorsCreate: (body: {
    full_name_ar: string;
    mobile: string;
    role: string;
    supervisor_scope: string;
  }) =>
    request<{ ok: boolean; id: number }>("/api/admin/supervisors", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminCirclesSummary: () =>
    request<{ items: AdminCircleRow[] }>("/api/admin/circles/summary"),
  adminCirclesCreate: (body: {
    name_ar: string;
    stage_id: number;
    default_capacity: number;
    teacher_user_id?: number;
    new_teacher?: { full_name_ar: string; mobile: string };
    track_id?: number | null;
  }) =>
    request<{ ok: boolean; id: number }>("/api/admin/circles", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminCirclesPatch: (
    id: number,
    body: {
      default_capacity?: number;
      teacher_user_id?: number;
      name_ar?: string;
      stage_id?: number;
      is_active?: number;
    },
  ) =>
    request<{ ok: boolean }>(`/api/admin/circles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminTracks: () => request<{ items: AdminTrackRow[] }>("/api/admin/tracks"),
  adminTracksCreate: (body: {
    name_ar: string;
    default_capacity: number;
    supervisor_id?: number;
    stage_ids?: number[];
    circle_ids?: number[];
  }) =>
    request<{ ok: boolean; id: number }>("/api/admin/tracks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminTracksPatch: (
    id: number,
    body: {
      name_ar?: string;
      default_capacity?: number;
      is_active?: number;
      stage_ids?: number[];
      circle_ids?: number[];
    },
  ) =>
    request<{ ok: boolean }>(`/api/admin/tracks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminTeachersPatch: (
    id: number,
    body: {
      full_name_ar?: string;
      mobile?: string;
      circle_id?: number;
      is_active?: number;
    },
  ) =>
    request<{ ok: boolean }>(`/api/admin/teachers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminTeachersDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/teachers/${id}`, { method: "DELETE" }),
  adminSupervisorsPatch: (
    id: number,
    body: {
      full_name_ar?: string;
      mobile?: string;
      role?: string;
      supervisor_scope?: string;
      is_active?: number;
    },
  ) =>
    request<{ ok: boolean }>(`/api/admin/supervisors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminSupervisorsDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/supervisors/${id}`, { method: "DELETE" }),
  adminStats: (period?: string) => {
    const qs = period ? `?period=${encodeURIComponent(period)}` : "";
    return request<{
      period: string;
      today: string;
      kpis: {
        active_students: number;
        present_today: number;
        attendance_rate_today: number;
        attendance_records_period: number;
        active_teachers: number;
        active_supervisors: number;
        staff_present_today: number;
      };
      by_circle: Array<{
        id: number;
        name_ar: string;
        enrolled: number;
        present_today: number;
      }>;
      auto_attendance_today: Array<{
        full_name_ar: string;
        circle_name: string | null;
        logged_at: string;
      }>;
    }>(`/api/admin/stats${qs}`);
  },
  adminYomHimmaSummary: () =>
    request<{
      items: Array<{
        session: { id: number; name_ar: string; session_date: string; status: string };
        stats: { total: number; present: number; juz_total: number; hizb_total: number };
      }>;
    }>("/api/admin/yom-himma-summary"),
  adminStaffAttendance: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request<{
      items: Array<{
        id: number;
        user_id: number;
        attendance_date: string;
        status: string;
        notes: string | null;
        full_name_ar: string;
        role: string;
      }>;
      from: string;
      to: string;
    }>(`/api/admin/staff-attendance${qs ? `?${qs}` : ""}`);
  },
  adminStaffAttendanceUpsert: (body: {
    user_id: number;
    attendance_date?: string;
    status: string;
    notes?: string;
  }) =>
    request<{ ok: boolean }>("/api/admin/staff-attendance", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminComplexSettings: () =>
    request<{
      semester_weeks: number;
      school_days: number[];
      graduates_count: number;
      huffadh_count: number;
    }>("/api/admin/complex-settings"),
  adminPatchComplexSettings: (body: {
    semester_weeks?: number;
    school_days?: number[];
    graduates_count?: number;
    huffadh_count?: number;
  }) =>
    request<{ ok: boolean }>("/api/admin/complex-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduMasterGrid: (params?: { pending_acceptance?: string; q?: string }) => {
    const search = new URLSearchParams();
    if (params?.pending_acceptance) {
      search.set("pending_acceptance", params.pending_acceptance);
    }
    if (params?.q?.trim()) search.set("q", params.q.trim());
    const qs = search.toString();
    return request<{
      items: Array<{
        id: number;
        full_name_ar: string;
        is_active: number;
        stage_id: number | null;
        school_grade: string | null;
        admission_status: string | null;
        current_circle_id: number | null;
        current_circle_name: string | null;
        current_track_id: number | null;
        current_track_name: string | null;
      }>;
      circles: CircleOption[];
      tracks: Array<{ id: number; name_ar: string }>;
      pending_filter_applied: boolean;
    }>(`/api/edu-dept/master-grid${qs ? `?${qs}` : ""}`);
  },
  eduAcceptAssign: (body: {
    student_id: number;
    circle_id: number;
    track_id?: number | null;
    note?: string;
  }) =>
    request<{ ok: boolean; message: string }>("/api/edu-dept/accept-assign", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** القسم الإداري — API v2.6 */
  adminDeptStaff: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      date: string;
      items: Array<{
        user_id: number;
        full_name_ar: string;
        role: string | null;
        status: string;
        recorded_at?: string | null;
      }>;
      default_status: string;
    }>(`/api/admin-dept/staff${qs}`);
  },
  adminDeptSaveStaffAttendance: (body: {
    attendance_date?: string;
    records: Array<{ user_id: number; status: string }>;
  }) =>
    request<{ ok: boolean; attendance_date: string; saved: number }>(
      "/api/admin-dept/staff/attendance",
      { method: "POST", body: JSON.stringify(body) },
    ),
  adminDeptStudentAttendance: (circleId: number, date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      attendance_date: string;
      circle: { id: number; name_ar: string; stage: string } | null;
      items: Array<{
        student_id: number;
        full_name_ar: string;
        stage_id?: number | null;
        status: string;
        recorded_at?: string | null;
        source?: string | null;
      }>;
      default_status: string;
    }>(`/api/admin-dept/students/attendance/${circleId}${qs}`);
  },
  adminDeptSaveStudentAttendance: (body: {
    circle_id: number;
    attendance_date?: string;
    records: Array<{ student_id: number; status: string; notes?: string }>;
  }) =>
    request<{ ok: boolean; attendance_date: string; circle_id: number; saved: number }>(
      "/api/admin-dept/students/attendance",
      { method: "POST", body: JSON.stringify(body) },
    ),
  adminDeptAbsentToday: (params?: { date?: string; circle_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.circle_id != null) q.set("circle_id", String(params.circle_id));
    const qs = q.toString();
    return request<{
      date: string;
      items: Array<Record<string, unknown>>;
      template: string;
    }>(`/api/admin-dept/students/absent-today${qs ? `?${qs}` : ""}`);
  },
  adminDeptCreateMagicLink: (body: {
    circle_id: number;
    attendance_date?: string;
    feature_name?: string;
  }) =>
    request<{
      ok: boolean;
      id: number;
      token: string;
      feature_name: string;
      is_active: number;
      context_data: Record<string, unknown>;
      public_path: string;
      api_get: string;
      api_post: string;
    }>("/api/admin-dept/magic-links", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeptToggleMagicLink: (id: number) =>
    request<{ ok: boolean; id: number; is_active: number }>(
      `/api/admin-dept/magic-links/${id}/toggle`,
      { method: "PUT", body: "{}" },
    ),
  adminDeptMagicLinksList: () =>
    request<{
      items: Array<{
        id: number;
        token: string;
        circle_id: number | null;
        circle_name: string | null;
        attendance_date: string | null;
        is_active: number;
        created_at: string;
        public_path: string;
      }>;
    }>("/api/admin-dept/magic-links"),
  adminDeptMagicLinksDelete: (id: number) =>
    request<{ ok: boolean; id: number }>(`/api/admin-dept/magic-links/${id}`, {
      method: "DELETE",
    }),
  adminDeptStudentsSearch: (q: string, limit = 20) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", String(limit));
    return request<{
      items: Array<{
        id: number;
        full_name_ar: string;
        national_id: string | null;
        phone: string | null;
        guardian_phone: string | null;
        circle_name: string | null;
      }>;
      count: number;
    }>(`/api/admin-dept/students/search?${params.toString()}`);
  },
  adminDeptAdmission: (body: {
    full_name_ar: string;
    national_id: string;
    guardian_phone: string;
    stage_id: number;
    circle_id: number;
    phone?: string;
    school_grade?: string;
    age?: number | null;
    guardian_national_id?: string;
    guardian_work?: string;
    health_notes?: string;
    track_id?: number | null;
    nationality?: string;
    school_name?: string;
  }) =>
    request<{
      ok: boolean;
      student_id: number;
      stage_id: number;
      stage_label?: string;
      circle_id: number;
      admission_status?: string;
    }>("/api/admin-dept/admission", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeptAddPledge: (body: {
    student_id: number;
    reason_ar: string;
    pledge_date?: string;
  }) =>
    request<{
      ok: boolean;
      pledge_id: number;
      pledge_count: number;
      max_pledges: number;
      threshold_reached: boolean;
      alert: string | null;
    }>("/api/admin-dept/pledges", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeptPledgesList: () =>
    request<{
      items: Array<{
        student_id: number;
        full_name_ar: string;
        guardian_phone: string | null;
        pledge_count: number;
        latest_reason: string | null;
      }>;
    }>("/api/admin-dept/pledges"),
  adminDeptReports: (params?: {
    startDate?: string;
    endDate?: string;
    status?: "all" | "absent_only";
    type?: "all" | "staff" | "student";
  }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    if (params?.status) q.set("status", params.status);
    if (params?.type) q.set("type", params.type);
    const qs = q.toString();
    return request<{
      start_date: string;
      end_date: string;
      filters: { status: string; type: string };
      summary: {
        staff_total: number;
        staff_present: number;
        staff_absent: number;
        staff_present_pct: number;
        staff_absent_pct: number;
        students_total: number;
        students_present: number;
        students_absent: number;
        students_present_pct: number;
        students_absent_pct: number;
      };
      items: Array<{
        name: string;
        date: string;
        status: string;
        type: "staff" | "student";
      }>;
    }>(`/api/admin-dept/reports${qs ? `?${qs}` : ""}`);
  },
  adminDeptStudentAttendanceReport: (studentId: number) =>
    request<{
      student: {
        id: number;
        full_name_ar: string;
        guardian_phone: string | null;
        stage_id: number | null;
      };
      summary: { present: number; absent: number; excused: number; total: number };
      items: Array<{ date: string; status: string }>;
    }>(`/api/admin-dept/reports/student/${studentId}`),
  adminDeptPledgeReport: (studentId: number) =>
    request<{
      student: Record<string, unknown>;
      pledges: Array<{
        id: number;
        reason_ar: string;
        pledge_date: string;
        created_at: string;
        created_by_name?: string | null;
      }>;
      pledge_count: number;
      max_pledges: number;
      threshold_reached: boolean;
    }>(`/api/admin-dept/pledges/${studentId}`),
  adminDeptTeacherEscalations: () =>
    request<{
      items: Array<{
        id: number;
        student_id: number;
        student_name: string;
        teacher_name: string;
        notes: string | null;
        created_at: string;
      }>;
    }>("/api/admin-dept/teacher-requests/escalations"),
  adminDeptConvertEscalationToPledge: (requestId: number) =>
    request<{
      ok: boolean;
      pledge_id: number;
      pledge_count: number;
      max_pledges: number;
      threshold_reached: boolean;
    }>(`/api/admin-dept/teacher-requests/${requestId}/convert-pledge`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  adminDeptPatchEscalation: (requestId: number, notes: string) =>
    request<{ ok: boolean; id: number }>(`/api/admin-dept/teacher-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),
  adminDeptDeleteEscalation: (requestId: number) =>
    request<{ ok: boolean; id: number }>(`/api/admin-dept/teacher-requests/${requestId}`, {
      method: "DELETE",
    }),
  eduDeptSettingsGet: () =>
    request<{
      settings: {
        weight_listening: number;
        weight_revision: number;
        weight_repeat: number;
        rabt_weight: number;
        penalty_per_error: number;
        himma_defaults?: {
          hizb_points: number;
          alert_penalty: number;
          error_penalty: number;
          alerts_per_error: number;
          fail_threshold_errors: number;
        };
        competition_defaults?: {
          mistake_penalty: number;
          alert_penalty: number;
          lahn_penalty: number;
          default_task_weight: number;
        };
      };
    }>("/api/edu-dept/settings"),
  eduDeptSettingsPatch: (body: {
    weight_listening: number;
    weight_revision: number;
    weight_repeat: number;
    rabt_weight: number;
    penalty_per_error: number;
    himma_defaults?: {
      hizb_points: number;
      alert_penalty: number;
      error_penalty: number;
      alerts_per_error: number;
      fail_threshold_errors: number;
    };
    competition_defaults?: {
      mistake_penalty: number;
      alert_penalty: number;
      lahn_penalty: number;
      default_task_weight: number;
    };
  }) =>
    request<{ ok: boolean }>("/api/edu-dept/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduDeptTeacherCircles: () =>
    request<{ items: Array<{ id: number; name_ar: string }> }>(
      "/api/edu-dept/teacher/circles",
    ),
  eduDeptMyStudents: (params?: { date?: string; circle_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.circle_id != null) q.set("circle_id", String(params.circle_id));
    const qs = q.toString();
    return request<{
      date: string;
      circle_id: number | null;
      circle_name: string | null;
      needs_circle_selection: boolean;
      circles: Array<{ id: number; name_ar: string }>;
      items: Array<{
        student_id: number;
        full_name_ar: string;
        listened: boolean;
        repeated: boolean;
        revised: boolean;
        error_count: number;
        tune_errors: number;
        face_count: number;
        notes: string;
      }>;
    }>(`/api/edu-dept/my-students${qs ? `?${qs}` : ""}`);
  },
  eduDeptDailyRecitationGet: (circleId: number, date: string) =>
    request<{
      items: Array<{
        student_id: number;
        full_name_ar: string;
        listened: boolean;
        repeated: boolean;
        revised: boolean;
        error_count: number;
        tune_errors: number;
        face_count: number;
        notes: string;
      }>;
      date: string;
      circle_id: number;
    }>(
      `/api/edu-dept/daily-recitation?circle_id=${circleId}&date=${encodeURIComponent(date)}`,
    ),
  eduDeptDailyRecitationSave: (body: {
    circle_id?: number;
    recitation_date: string;
    rows: Array<{
      student_id: number;
      listened?: boolean;
      repeated?: boolean;
      revised?: boolean;
      error_count?: number;
      tune_errors?: number;
      face_count?: number;
      notes?: string;
    }>;
  }) =>
    request<{ ok: boolean; saved: number; circle_id?: number }>("/api/edu-dept/daily-recitation", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  eduDeptTeacherRequests: (params?: {
    status?: string;
    request_type?: "transfer" | "escalation";
  }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.request_type) q.set("request_type", params.request_type);
    const qs = q.toString();
    return request<{
      items: Array<{
        id: number;
        student_id: number;
        student_name: string;
        teacher_name: string;
        request_type: string;
        status: string;
        notes: string | null;
        target_circle_id: number | null;
        target_circle_name: string | null;
        created_at: string;
      }>;
    }>(`/api/edu-dept/teacher-requests${qs ? `?${qs}` : ""}`);
  },
  eduDeptCreateTeacherRequest: (body: {
    student_id: number;
    request_type: "transfer" | "escalation";
    notes?: string;
    target_circle_id?: number | null;
  }) =>
    request<{ ok: boolean; id: number }>("/api/edu-dept/teacher-requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  eduDeptResolveTeacherRequest: (
    id: number,
    body: { status: "approved" | "rejected"; target_circle_id?: number },
  ) =>
    request<{ ok: boolean; status: string }>(
      `/api/edu-dept/teacher-requests/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  eduDeptManualTransfer: (body: {
    student_id: number;
    circle_id: number;
    track_id?: number | null;
    note?: string;
  }) =>
    request<{ ok: boolean }>("/api/edu-dept/transfers/manual", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  eduDeptTeacherCompetitionsList: () =>
    request<{
      items: Array<{
        id: number;
        name_ar: string;
        start_date: string | null;
        end_date: string | null;
        created_at: string;
      }>;
      default_task_weight?: number;
    }>("/api/edu-dept/teacher-competitions"),
  eduDeptTeacherCompetitionCreate: (body: {
    name_ar: string;
    start_date?: string;
    end_date?: string;
  }) =>
    request<{ ok: boolean; id: number }>("/api/edu-dept/teacher-competitions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  eduDeptTeacherCompetitionDetail: (id: number) =>
    request<{
      competition: { id: number; name_ar: string; start_date: string | null; end_date: string | null };
      tasks: Array<{ id: number; title_ar: string; weight_points: number; sort_order: number }>;
      students: Array<{ id: number; full_name_ar: string }>;
      scores: Array<{ task_id: number; student_id: number; points: number }>;
    }>(`/api/edu-dept/teacher-competitions/${id}`),
  eduDeptTeacherCompetitionUpdate: (
    id: number,
    body: { name_ar?: string; start_date?: string | null; end_date?: string | null },
  ) =>
    request<{ ok: boolean }>(`/api/edu-dept/teacher-competitions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduDeptTeacherCompetitionDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/edu-dept/teacher-competitions/${id}`, {
      method: "DELETE",
    }),
  eduDeptTeacherCompetitionAddTask: (
    compId: number,
    body: { title_ar: string; weight_points?: number },
  ) =>
    request<{ ok: boolean; id: number }>(
      `/api/edu-dept/teacher-competitions/${compId}/tasks`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  eduDeptTeacherCompetitionDeleteTask: (compId: number, taskId: number) =>
    request<{ ok: boolean }>(
      `/api/edu-dept/teacher-competitions/${compId}/tasks/${taskId}`,
      { method: "DELETE" },
    ),
  eduDeptTeacherCompetitionLeaderboard: (compId: number) =>
    request<{
      items: Array<{
        rank: number;
        student_id: number;
        full_name_ar: string;
        total_points: number;
      }>;
    }>(`/api/edu-dept/teacher-competitions/${compId}/leaderboard`),
  eduDeptTeacherCompetitionSaveScores: (
    compId: number,
    scores: Array<{ task_id: number; student_id: number; points: number }>,
  ) =>
    request<{ ok: boolean; saved: number }>(
      `/api/edu-dept/teacher-competitions/${compId}/scores`,
      { method: "POST", body: JSON.stringify({ scores }) },
    ),
  eduDeptQuranicDaysList: () =>
    request<{
      items: Array<{
        id: number;
        name_ar: string;
        event_date: string;
        deduction_rules: {
          mistake_penalty: number;
          alert_penalty: number;
          lahn_penalty: number;
        };
        fail_threshold: number;
        hizb_time_limit: number;
        has_magic_link: boolean;
        is_active: number;
        created_at: string;
      }>;
    }>("/api/edu-dept/quranic-days"),
  eduDeptQuranicDayCreate: (body: {
    name_ar: string;
    event_date: string;
    mistake_penalty?: number;
    alert_penalty?: number;
    lahn_penalty?: number;
    fail_threshold?: number;
    hizb_time_limit?: number;
  }) =>
    request<{ ok: boolean; id: number }>("/api/edu-dept/quranic-days", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  eduDeptQuranicDayUpdate: (
    id: number,
    body: {
      name_ar?: string;
      event_date?: string;
      mistake_penalty?: number;
      alert_penalty?: number;
      lahn_penalty?: number;
      fail_threshold?: number;
      hizb_time_limit?: number;
      is_active?: number;
    },
  ) =>
    request<{ ok: boolean }>(`/api/edu-dept/quranic-days/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduDeptQuranicDayDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/edu-dept/quranic-days/${id}`, { method: "DELETE" }),
  eduDeptQuranicDayMagicLink: (id: number) =>
    request<{
      ok: boolean;
      token: string;
      public_path: string;
      api_get: string;
    }>(`/api/edu-dept/quranic-days/${id}/magic-link`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  eduDeptQuranicDayStudents: (dayId: number) =>
    request<{
      items: Array<{
        id: number;
        student_id: number;
        full_name_ar: string;
        stage_id: number | null;
        target_hizbs: number[];
      }>;
    }>(`/api/edu-dept/quranic-days/${dayId}/students`),
  eduDeptQuranicDayStudentSearch: (dayId: number, q: string, stageIds: number[]) =>
    request<{
      items: Array<{ id: number; full_name_ar: string; stage_id: number | null }>;
    }>(
      `/api/edu-dept/quranic-days/${dayId}/students/search?q=${encodeURIComponent(q)}&stage_ids=${stageIds.join(",")}`,
    ),
  eduDeptQuranicDayEnrollStudent: (
    dayId: number,
    body: { student_id: number; hizb_from: number; hizb_to: number },
  ) =>
    request<{ ok: boolean; target_hizbs: number[] }>(
      `/api/edu-dept/quranic-days/${dayId}/students`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  eduDeptQuranicDayRemoveStudent: (dayId: number, studentId: number) =>
    request<{ ok: boolean }>(
      `/api/edu-dept/quranic-days/${dayId}/students/${studentId}`,
      { method: "DELETE" },
    ),
  eduDeptQuranicDayRecords: (dayId: number) =>
    request<{
      items: Array<{
        id: number;
        student_id: number;
        full_name_ar: string;
        hizb_number: number;
        mistakes: number;
        alerts: number;
        lahn_count: number;
        time_taken_seconds: number;
        recorded_at: string;
      }>;
    }>(`/api/edu-dept/quranic-days/${dayId}/records`),
  eduDeptQuranicDayRecordUpdate: (
    recordId: number,
    body: { mistakes?: number; alerts?: number; lahn_count?: number },
  ) =>
    request<{ ok: boolean }>(`/api/edu-dept/quranic-days/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduDeptQuranicDayRecordDelete: (recordId: number) =>
    request<{ ok: boolean }>(`/api/edu-dept/quranic-days/records/${recordId}`, {
      method: "DELETE",
    }),
  eduDeptQuranicDayReport: (dayId: number) =>
    request<{
      total_hizbs_read: number;
      students_completed: number;
      students_over_threshold: number;
      enrolled_count: number;
      fail_threshold: number;
      students: Array<{
        student_id: number;
        full_name_ar: string;
        hizbs_read: number;
        target_count: number;
        max_mistakes: number;
        status: "completed" | "over_threshold" | "in_progress" | "none";
      }>;
    }>(`/api/edu-dept/quranic-days/${dayId}/report`),
  publicQuranicDayGet: (token: string) =>
    request<{
      token: string;
      day: {
        id: number;
        name_ar: string;
        event_date: string;
        deduction_rules: {
          mistake_penalty: number;
          alert_penalty: number;
          lahn_penalty: number;
        };
        fail_threshold: number;
        hizb_time_limit: number;
      };
    }>(`/api/public/quranic-day/${encodeURIComponent(token)}`),
  publicQuranicDaySearchStudents: (token: string, q: string) =>
    request<{
      items: Array<{
        student_id: number;
        full_name_ar: string;
        target_hizbs: number[];
      }>;
    }>(
      `/api/public/quranic-day/${encodeURIComponent(token)}/students/search?q=${encodeURIComponent(q)}`,
    ),
  publicQuranicDayGetStudent: (token: string, studentId: number) =>
    request<{
      student: {
        student_id: number;
        full_name_ar: string;
        target_hizbs: number[];
        completed_hizbs: number[];
      };
      day: {
        id: number;
        name_ar: string;
        event_date: string;
        deduction_rules: {
          mistake_penalty: number;
          alert_penalty: number;
          lahn_penalty: number;
        };
        fail_threshold: number;
        hizb_time_limit: number;
      };
    }>(
      `/api/public/quranic-day/${encodeURIComponent(token)}/students/${studentId}`,
    ),
  publicQuranicDaySaveRecord: (
    token: string,
    body: {
      student_id: number;
      hizb_number: number;
      mistakes: number;
      alerts: number;
      lahn_count: number;
      time_taken_seconds: number;
    },
  ) =>
    request<{
      ok: boolean;
      fail_threshold_exceeded?: boolean;
      completed_hizbs: number[];
    }>(
      `/api/public/quranic-day/${encodeURIComponent(token)}/records`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  publicQuranicDayStudentSummary: (token: string, studentId: number) =>
    request<{
      student_name: string;
      hizbs_read: number;
      total_mistakes: number;
      total_alerts: number;
      total_lahn: number;
      fail_threshold: number;
      status: "passed" | "failed" | "none";
    }>(
      `/api/public/quranic-day/${encodeURIComponent(token)}/students/${studentId}/summary`,
    ),
  eduDeptReportsProgress: (params?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    circle_id?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.circle_id != null) q.set("circle_id", String(params.circle_id));
    const qs = q.toString();
    return request<{
      date: string;
      date_from: string;
      date_to: string;
      semester_start: string;
      summary: {
        avg_quality: number;
        top_circle: { circle_id: number; circle_name: string; avg_quality: number } | null;
        active_students: number;
        total_records: number;
        total_faces_semester: number;
        faces_today: number;
      };
      circles: Array<{ id: number; name_ar: string }>;
      items: Array<{
        student_id: number;
        full_name_ar: string;
        circle_id: number;
        circle_name: string;
        quality_pct: number;
        listened: boolean;
        repeated: boolean;
        revised: boolean;
        error_count: number;
        face_count: number;
      }>;
    }>(`/api/edu-dept/reports/progress${qs ? `?${qs}` : ""}`);
  },
  publicAttendanceGet: (token: string) =>
    request<{
      token: string;
      attendance_date: string;
      circle: { id: number; name_ar: string; stage: string };
      items: Array<{
        student_id: number;
        full_name_ar: string;
        status: string;
      }>;
      default_status: string;
    }>(`/api/public/attendance/${encodeURIComponent(token)}`),
  publicAttendanceSave: (
    token: string,
    body: { records: Array<{ student_id: number; status: string }> },
  ) =>
    request<{ ok: boolean; saved: number }>(
      `/api/public/attendance/${encodeURIComponent(token)}`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  gsScope: () =>
    request<{
      scope: { type: string; stageIds?: number[] };
      supervisor_scope: string;
      stage_labels: Record<number, string>;
    }>("/api/admin-dept/scope"),
  gsStaffAttendanceToday: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      date: string;
      items: Array<{
        user_id: number;
        full_name_ar: string;
        role: string;
        status: string;
      }>;
      default_status: string;
    }>(`/api/admin-dept/staff-attendance/today${qs}`);
  },
  gsStaffAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/admin-dept/staff-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  gsStaffAttendanceUpsert: (body: {
    user_id: number;
    status: string;
    attendance_date?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/admin-dept/staff-attendance/upsert",
      { method: "POST", body: JSON.stringify(body) },
    ),
  gsApplications: (status = "pending") =>
    request<{ items: unknown[] }>(
      `/api/admin-dept/applications?status=${encodeURIComponent(status)}`,
    ),
  gsApplicationCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number }>(
      "/api/admin-dept/applications",
      { method: "POST", body: JSON.stringify(body) },
    ),
  gsApplicationAccept: (id: number) =>
    request<{ ok: boolean; student_id: number }>(
      `/api/admin-dept/applications/${id}/accept`,
      { method: "POST", body: "{}" },
    ),
  gsApplicationReject: (id: number) =>
    request<{ ok: boolean }>(
      `/api/admin-dept/applications/${id}/reject`,
      { method: "POST", body: "{}" },
    ),
  gsDisciplinary: () =>
    request<{ items: unknown[] }>("/api/admin-dept/disciplinary"),
  gsDisciplinaryViolation: (studentId: number, description?: string) =>
    request<{ ok: boolean }>(
      `/api/admin-dept/disciplinary/${studentId}/violation`,
      {
        method: "POST",
        body: JSON.stringify({ description }),
      },
    ),
  gsDisciplinaryAction: (
    studentId: number,
    action: "archive_pledge" | "suspend" | "dismiss" | "transfer",
    note?: string,
  ) =>
    request<{ ok: boolean }>(
      `/api/admin-dept/disciplinary/${studentId}/action`,
      { method: "POST", body: JSON.stringify({ action, note }) },
    ),
  gsDashboard: () =>
    request<{
      today: string;
      kpis: {
        active_students: number;
        present_today: number;
        attendance_rate_today: number;
        graduates_count: number;
        huffadh_count: number;
        pending_applications: number;
        pending_placement: number;
      };
    }>("/api/admin-dept/dashboard"),
  gsTvLaunch: () =>
    request<{
      session: {
        id: number;
        tv_launch_key: string;
        name_ar: string;
      } | null;
      fallback_url: string;
    }>("/api/admin-dept/tv-launch"),
  gsStudentAttendanceToday: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      date: string;
      items: Array<{
        student_id: number;
        full_name_ar: string;
        stage_id: number | null;
        circle_name: string | null;
        status: string;
      }>;
      scope: { type: string; stageIds?: number[] };
      default_status: string;
    }>(`/api/admin-dept/student-attendance/today${qs}`);
  },
  gsStudentAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/admin-dept/student-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  gsStudentAttendanceUpsert: (body: {
    student_id: number;
    status: string;
    attendance_date?: string;
    notes?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/admin-dept/student-attendance/upsert",
      { method: "POST", body: JSON.stringify(body) },
    ),
  eduStudentAttendanceToday: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      date: string;
      items: Array<{
        student_id: number;
        full_name_ar: string;
        stage_id: number | null;
        circle_name: string | null;
        status: string;
      }>;
      scope: { type: string; stageIds?: number[] };
      default_status: string;
    }>(`/api/edu-dept/student-attendance/today${qs}`);
  },
  eduStudentAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/edu-dept/student-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  eduStudentAttendanceUpsert: (body: {
    student_id: number;
    status: string;
    attendance_date?: string;
    notes?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/edu-dept/student-attendance/upsert",
      { method: "POST", body: JSON.stringify(body) },
    ),

  progScope: () =>
    request<{
      supervisor_scope: string;
      scope: { type: string; stageIds?: number[] };
      scope_label: string;
    }>("/api/prog-supervisor/scope"),
  progAnalytics: () =>
    request<{
      scope_label: string;
      kpis: {
        published_quizzes: number;
        quiz_attempts_submitted: number;
        average_quiz_score: number;
      };
      top_students: Array<Record<string, unknown>>;
      top_circles_participation: Array<Record<string, unknown>>;
      circle_quiz_averages: Array<Record<string, unknown>>;
    }>("/api/prog-supervisor/analytics"),
  progQuizzesList: () =>
    request<{ items: Array<Record<string, unknown>> }>("/api/prog-supervisor/quizzes"),
  progQuizCreate: (body: {
    title_ar: string;
    access_code: string;
    show_score_instantly?: boolean;
    custom_success_message?: string | null;
    require_student_name?: boolean;
    questions?: Array<Record<string, unknown>>;
  }) =>
    request<{ ok: boolean; id: number }>("/api/prog-supervisor/quizzes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  progQuizDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/prog-supervisor/quizzes/${id}`, { method: "DELETE" }),
  progQuizResponses: (id: number) =>
    request<{
      items: Array<{
        source: string;
        student_name: string;
        student_phone: string | null;
        total_score: number | null;
        score_percent: number | null;
        submitted_at: string;
      }>;
    }>(`/api/prog-supervisor/quizzes/${id}/responses`),
  progQuizDetail: (id: number) =>
    request<{
      quiz: Record<string, unknown>;
      questions: Array<Record<string, unknown>>;
      attempts: Array<Record<string, unknown>>;
    }>(`/api/prog-supervisor/quizzes/${id}`),
  progQuizPatch: (
    id: number,
    body: {
      title_ar?: string;
      access_code?: string | null;
      status?: string;
      show_score_instantly?: boolean;
      custom_success_message?: string | null;
      is_active?: number;
      require_student_name?: boolean;
      questions?: Array<Record<string, unknown>>;
    },
  ) =>
    request<{ ok: boolean; total_points?: number }>(`/api/prog-supervisor/quizzes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  progQuizQuestionsSave: (
    id: number,
    questions: Array<Record<string, unknown>>,
  ) =>
    request<{ ok: boolean; total_points: number }>(
      `/api/prog-supervisor/quizzes/${id}/questions`,
      { method: "PUT", body: JSON.stringify({ questions }) },
    ),
  progQuizPublish: (id: number) =>
    request<{
      ok: boolean;
      public_path: string;
      access_code: string | null;
      student_links: Array<Record<string, unknown>>;
    }>(`/api/prog-supervisor/quizzes/${id}/publish`, {
      method: "POST",
      body: "{}",
    }),
  progQuizLinks: (id: number) =>
    request<{
      title_ar: string;
      public_path: string;
      access_code: string | null;
      items: Array<Record<string, unknown>>;
    }>(`/api/prog-supervisor/quizzes/${id}/links`),
  progVaultList: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return request<{ items: Array<Record<string, unknown>>; q: string | null }>(
      `/api/prog-supervisor/vault${qs}`,
    );
  },
  progVaultCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number }>("/api/prog-supervisor/vault", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  progVaultArchive: (id: number) =>
    request<{ ok: boolean }>(`/api/prog-supervisor/vault/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: 0 }),
    }),
  progProgramArchivesList: (params?: { q?: string; type?: string; tag?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q?.trim()) sp.set("q", params.q.trim());
    if (params?.type?.trim()) sp.set("type", params.type.trim());
    if (params?.tag?.trim()) sp.set("tag", params.tag.trim());
    const qs = sp.toString() ? `?${sp}` : "";
    return request<{ items: Array<Record<string, unknown>> }>(
      `/api/prog-supervisor/program-archives${qs}`,
    );
  },
  progProgramArchiveCreate: (body: {
    title: string;
    type: "link" | "file";
    file_url_or_link: string;
    description?: string;
    tags?: string[];
  }) =>
    request<{ ok: boolean; id: number }>("/api/prog-supervisor/program-archives", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  progProgramArchivePatch: (
    id: number,
    body: {
      title?: string;
      type?: "link" | "file";
      file_url_or_link?: string;
      description?: string;
      tags?: string[];
    },
  ) =>
    request<{ ok: boolean }>(`/api/prog-supervisor/program-archives/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  progProgramArchiveDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/prog-supervisor/program-archives/${id}`, {
      method: "DELETE",
    }),

  displayMediaList: () =>
    request<{
      items: Array<{
        id: number;
        media_type: string;
        media_url: string;
        display_order: number;
        is_active: number;
        created_at: string;
      }>;
    }>("/api/display-dept/media"),
  displayMediaCreate: (body: {
    media_type: "image" | "gif" | "video";
    media_url: string;
    display_order?: number;
    is_active?: number;
  }) =>
    request<{ ok: boolean; id: number }>("/api/display-dept/media", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  displayMediaPatch: (
    id: number,
    body: {
      media_type?: string;
      media_url?: string;
      display_order?: number;
      is_active?: number;
    },
  ) =>
    request<{ ok: boolean }>(`/api/display-dept/media/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  displayMediaDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/display-dept/media/${id}`, { method: "DELETE" }),
  displayMediaReorder: (order: number[]) =>
    request<{ ok: boolean }>("/api/display-dept/media/reorder", {
      method: "POST",
      body: JSON.stringify({ order }),
    }),

  publicLiveDisplayMetrics: () =>
    request<{
      complex_name: string;
      date: string;
      updated_at: string;
      metrics: {
        attendance_present_today: number;
        attendance_absent_today: number;
        faces_cumulative: number;
        active_pledges: number;
      };
      top_students: Array<{ full_name_ar: string; metric: number; label: string }>;
    }>("/api/public/live-display/metrics"),
  publicLiveDisplayMedia: () =>
    request<{
      items: Array<{ id: number; media_type: string; media_url: string; display_order: number }>;
    }>("/api/public/live-display/media"),
  publicLiveDisplayCarousel: () =>
    request<{
      complex_name: string;
      slide_seconds: number;
      slides: Array<Record<string, unknown>>;
    }>("/api/public/live-display/carousel"),
  displaySettingsGet: () =>
    request<{ slide_seconds: number }>("/api/display-dept/settings"),
  displaySettingsPatch: (body: { slide_seconds: number }) =>
    request<{ ok: boolean; slide_seconds: number }>("/api/display-dept/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  progQuizResponseGrade: (quizId: number, responseId: number, total_score: number) =>
    request<{ ok: boolean; total_score: number }>(
      `/api/prog-supervisor/quizzes/${quizId}/responses/${responseId}/grade`,
      { method: "PATCH", body: JSON.stringify({ total_score }) },
    ),
  progActivitiesList: () =>
    request<{ items: Array<Record<string, unknown>> }>(
      "/api/prog-supervisor/activities",
    ),
  progActivityCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number }>("/api/prog-supervisor/activities", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  progParticipationRecord: (body: Record<string, unknown>) =>
    request<{ ok: boolean }>("/api/prog-supervisor/participation", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  quizPublicMeta: (quizId: number, usePublicPrefix = true) =>
    request<{
      quiz_id: number;
      title_ar: string;
      requires_access_code: boolean;
      require_student_name?: boolean;
      status: string;
      show_score_instantly?: boolean;
    }>(
      usePublicPrefix
        ? `/api/public/quiz/${quizId}/public`
        : `/api/quiz/${quizId}/public`,
    ),
  publicQuizGate: (
    quizId: number,
    body: { access_code: string; student_name?: string },
  ) =>
    request<{ ok: boolean; session_token: string }>(
      `/api/public/quiz/${quizId}/gate`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  publicQuizTake: (quizId: number, token: string) =>
    request<{
      quiz: { id: number; title_ar: string };
      student: { full_name_ar: string };
      questions: Array<Record<string, unknown>>;
      saved_answers?: Record<string, string>;
      already_submitted?: boolean;
      show_score?: boolean;
      score_percent?: number | null;
      total_score?: number | null;
      message?: string;
    }>(`/api/public/quiz/${quizId}/take?token=${encodeURIComponent(token)}`),
  publicQuizSubmit: (
    quizId: number,
    body: { token: string; answers: Record<string, string> },
  ) =>
    request<{
      ok: boolean;
      show_score: boolean;
      score_percent: number | null;
      total_score: number | null;
      max_score: number | null;
      message: string;
    }>(`/api/public/quiz/${quizId}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quizGate: (quizId: number, body: { identifier: string; access_code?: string }) =>
    request<{
      ok: boolean;
      session_token: string;
      student_id: number;
      full_name_ar: string;
    }>(`/api/quiz/${quizId}/gate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quizTake: (quizId: number, token: string) =>
    request<{
      quiz: { id: number; title_ar: string };
      student: { id: number; full_name_ar: string };
      questions: Array<Record<string, unknown>>;
      already_submitted?: boolean;
      score_percent?: number;
    }>(`/api/quiz/${quizId}/take?token=${encodeURIComponent(token)}`),
  quizSubmit: (
    quizId: number,
    body: { token: string; answers: Record<string, string> },
  ) =>
    request<{ ok: boolean; score_percent: number }>(`/api/quiz/${quizId}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
