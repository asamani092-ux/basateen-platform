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
      "/api/edu-supervisor/competitions",
    ),
  competitionsCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number; tv_launch_key: string }>(
      "/api/edu-supervisor/competitions",
      { method: "POST", body: JSON.stringify(body) },
    ),
  competitionsDetail: (id: number) =>
    request<{
      competition: Record<string, unknown>;
      targets: Array<Record<string, unknown>>;
      plans: Array<Record<string, unknown>>;
    }>(`/api/edu-supervisor/competitions/${id}`),
  competitionsLiveLogToken: (id: number) =>
    request<{ ok: boolean; live_log_token: string; path: string }>(
      `/api/edu-supervisor/competitions/${id}/live-log-token`,
      { method: "POST", body: "{}" },
    ),
  competitionsActivate: (id: number) =>
    request<{ ok: boolean }>(
      `/api/edu-supervisor/competitions/${id}/activate`,
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
    }>("/api/edu-supervisor/dashboard"),
  eduScope: () =>
    request<{
      supervisor_scope: string;
      scope: { type: string; stageIds?: number[] };
    }>("/api/edu-supervisor/scope"),
  eduStudentProfile: (studentId: number) =>
    request<{
      student: Record<string, unknown>;
      current: Record<string, unknown> | null;
      edu_plan: { targets: Record<string, unknown>; notes: string | null };
      teacher_marks: Array<Record<string, unknown>>;
      competitions_summary: Array<Record<string, unknown>>;
    }>(`/api/edu-supervisor/students/${studentId}`),
  eduStudentPlanPatch: (
    studentId: number,
    body: { targets?: Record<string, unknown>; notes?: string },
  ) =>
    request<{ ok: boolean }>(`/api/edu-supervisor/students/${studentId}/plan`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  eduApplyHimmaPlan: (studentId: number, body: { session_id: number }) =>
    request<{ ok: boolean }>(
      `/api/edu-supervisor/students/${studentId}/apply-himma-plan`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  eduTargetOptions: () =>
    request<{
      students: Array<Record<string, unknown>>;
      circles: Array<Record<string, unknown>>;
      tracks: Array<Record<string, unknown>>;
    }>("/api/edu-supervisor/target-options"),
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
    stage_ids: number[];
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
    }>(`/api/edu-supervisor/master-grid${qs ? `?${qs}` : ""}`);
  },
  eduAcceptAssign: (body: {
    student_id: number;
    circle_id: number;
    track_id?: number | null;
    note?: string;
  }) =>
    request<{ ok: boolean; message: string }>("/api/edu-supervisor/accept-assign", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  gsScope: () =>
    request<{
      scope: { type: string; stageIds?: number[] };
      supervisor_scope: string;
      stage_labels: Record<number, string>;
    }>("/api/general-supervisor/scope"),
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
    }>(`/api/general-supervisor/staff-attendance/today${qs}`);
  },
  gsStaffAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/general-supervisor/staff-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  gsStaffAttendanceUpsert: (body: {
    user_id: number;
    status: string;
    attendance_date?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/general-supervisor/staff-attendance/upsert",
      { method: "POST", body: JSON.stringify(body) },
    ),
  gsApplications: (status = "pending") =>
    request<{ items: unknown[] }>(
      `/api/general-supervisor/applications?status=${encodeURIComponent(status)}`,
    ),
  gsApplicationCreate: (body: Record<string, unknown>) =>
    request<{ ok: boolean; id: number }>(
      "/api/general-supervisor/applications",
      { method: "POST", body: JSON.stringify(body) },
    ),
  gsApplicationAccept: (id: number) =>
    request<{ ok: boolean; student_id: number }>(
      `/api/general-supervisor/applications/${id}/accept`,
      { method: "POST", body: "{}" },
    ),
  gsApplicationReject: (id: number) =>
    request<{ ok: boolean }>(
      `/api/general-supervisor/applications/${id}/reject`,
      { method: "POST", body: "{}" },
    ),
  gsDisciplinary: () =>
    request<{ items: unknown[] }>("/api/general-supervisor/disciplinary"),
  gsDisciplinaryViolation: (studentId: number, description?: string) =>
    request<{ ok: boolean }>(
      `/api/general-supervisor/disciplinary/${studentId}/violation`,
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
      `/api/general-supervisor/disciplinary/${studentId}/action`,
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
    }>("/api/general-supervisor/dashboard"),
  gsTvLaunch: () =>
    request<{
      session: {
        id: number;
        tv_launch_key: string;
        name_ar: string;
      } | null;
      fallback_url: string;
    }>("/api/general-supervisor/tv-launch"),
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
    }>(`/api/general-supervisor/student-attendance/today${qs}`);
  },
  gsStudentAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/general-supervisor/student-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  gsStudentAttendanceUpsert: (body: {
    student_id: number;
    status: string;
    attendance_date?: string;
    notes?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/general-supervisor/student-attendance/upsert",
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
    }>(`/api/edu-supervisor/student-attendance/today${qs}`);
  },
  eduStudentAttendanceInitToday: () =>
    request<{ ok: boolean; date: string; count: number }>(
      "/api/edu-supervisor/student-attendance/init-today",
      { method: "POST", body: "{}" },
    ),
  eduStudentAttendanceUpsert: (body: {
    student_id: number;
    status: string;
    attendance_date?: string;
    notes?: string;
  }) =>
    request<{ ok: boolean }>(
      "/api/edu-supervisor/student-attendance/upsert",
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
  progQuizCreate: (body: { title_ar: string; access_code?: string | null }) =>
    request<{ ok: boolean; id: number }>("/api/prog-supervisor/quizzes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
    },
  ) =>
    request<{ ok: boolean }>(`/api/prog-supervisor/quizzes/${id}`, {
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

  quizPublicMeta: (quizId: number) =>
    request<{
      quiz_id: number;
      title_ar: string;
      requires_access_code: boolean;
      status: string;
    }>(`/api/quiz/${quizId}/public`),
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
