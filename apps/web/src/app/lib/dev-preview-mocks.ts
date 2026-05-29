import {
  PREVIEW_CIRCLES,
  PREVIEW_COMPETITION_LOGS,
  PREVIEW_LIVE_LOG,
  PREVIEW_TRACKS,
  PREVIEW_TODAY,
  PREVIEW_USERS,
} from "./dev-preview-fixtures";
import { previewStore } from "./dev-preview-store";
import { progPreviewStore } from "./dev-preview-prog-store";
import { teacherPreviewStore } from "./dev-preview-teacher-store";
import type { DailyMetrics } from "./teacher/daily-metrics";
import { scoreFromMetrics } from "./teacher/daily-metrics";
import { estimatePlan } from "./teacher/plan-estimator";

const MOCK_STAFF = [
  { user_id: 1, full_name_ar: "عبدالله — مدير عام", role: "general_manager", status: "present" },
  { user_id: 4, full_name_ar: "مشرف عام", role: "general_supervisor", status: "present" },
  { user_id: 2, full_name_ar: "مشرف تعليمي", role: "edu_supervisor", status: "present" },
  { user_id: 5, full_name_ar: "معلم حلقة الصديق", role: "teacher", status: "present" },
];

function resolvePreviewUser(bodyText?: string): (typeof PREVIEW_USERS)[string] | null {
  if (!bodyText) return PREVIEW_USERS["0500000002"];
  try {
    const body = JSON.parse(bodyText) as { mobile?: string };
    const digits = String(body.mobile ?? "").replace(/\D/g, "");
    let mobile = "";
    if (digits.length === 10 && digits.startsWith("05")) mobile = digits;
    else if (digits.length === 12 && digits.startsWith("9665")) mobile = `0${digits.slice(3)}`;
    return mobile ? (PREVIEW_USERS[mobile] ?? null) : null;
  } catch {
    return null;
  }
}

function liveLogPayload(token: string) {
  const isComp = token.includes("comp");
  const isIntensive = token === PREVIEW_LIVE_LOG.competitionIntensive;
  const students = previewStore
    .filterStudents({ stageIds: [2] })
    .filter((s) => s.admission_status !== "pending_placement")
    .slice(0, 5)
    .map((s) => ({
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      target_hizb: 2,
      target_juz: 1,
    }));

  return {
    kind: isComp ? ("competition" as const) : ("yom_himma" as const),
    session: {
      name_ar: isComp
        ? isIntensive
          ? "برنامج مكثف — أسبوع الإتقان (معاينة)"
          : "سرد ممتد — رمضان (معاينة)"
        : String(previewStore.getHimmaSession().name_ar),
      rules: {
        fail_threshold_errors: 3,
        alerts_per_error: 5,
      },
      tv_key: "preview-key",
      telemetry_type: isIntensive ? "intensive_routine" : "extended_recitation",
    },
    students,
    audit: students.map((s) => {
      const row = previewStore
        .getHimmaDetail()
        .audit.find((a) => a.student_id === s.student_id);
      return {
        student_id: s.student_id,
        attendance: row?.attendance ?? "present",
        juz_done: row?.juz_done ?? 0,
        hizb_done: row?.hizb_done ?? 0,
        alerts_count: row?.alerts_count ?? 0,
        errors_count: row?.errors_count ?? 0,
        current_hizb_failed: row?.current_hizb_failed ?? 0,
      };
    }),
    logs: isIntensive ? PREVIEW_COMPETITION_LOGS : undefined,
  };
}

export function resolveDevPreviewMock<T>(
  path: string,
  method: string,
  bodyText?: string,
): T | null {
  const url = new URL(path, "http://local");
  const p = url.pathname;
  const m = method.toUpperCase();
  const date = url.searchParams.get("date") ?? PREVIEW_TODAY();

  if (p === "/api/health") {
    return { ok: true, service: "ui-dev-preview", examples: true } as T;
  }

  if (p === "/api/auth/login-mobile" || p === "/api/auth/login") {
    const profile = resolvePreviewUser(bodyText) ?? PREVIEW_USERS["0500000002"];
    return {
      token: "ui-dev-preview-token",
      user: {
        id: profile.id,
        email: profile.email,
        full_name_ar: profile.full_name_ar,
        role: profile.role,
        sections: profile.sections,
        supervisor_scope: profile.supervisor_scope ?? "global",
      },
    } as T;
  }

  if (p === "/api/auth/me") {
    const profile = PREVIEW_USERS["0500000002"];
    return {
      user: {
        id: profile.id,
        email: profile.email,
        full_name_ar: profile.full_name_ar,
        role: profile.role,
        sections: profile.sections,
      },
    } as T;
  }

  if (p === "/api/students") {
    const admission = url.searchParams.get("admission_status");
    const q = url.searchParams.get("q");
    const items = previewStore.filterStudents({
      admission_status: admission ?? undefined,
      q,
      stageIds: admission === "pending_placement" ? [2] : undefined,
    });
    return { items, count: items.length, q: q ?? null } as T;
  }

  const studentDetailMatch = p.match(/^\/api\/students\/(\d+)$/);
  if (studentDetailMatch && m === "GET") {
    const sid = Number(studentDetailMatch[1]);
    const st = previewStore.findStudent(sid);
    if (!st) return { error: "not_found" } as T;
    return {
      student: { id: st.id, full_name_ar: st.full_name_ar, phone: st.phone },
      current: st.circle_name
        ? {
            history_id: 1,
            circle_id: st.circle_name.includes("صديق") ? 1 : 2,
            circle_name: st.circle_name,
            track_name: st.track_name,
            from_at: PREVIEW_TODAY(),
            to_at: null,
          }
        : null,
      history: [],
    } as T;
  }

  const transferMatch = p.match(/^\/api\/students\/(\d+)\/transfer$/);
  if (transferMatch && m === "POST") {
    const sid = Number(transferMatch[1]);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const circleId = Number(body.circle_id);
    const res = previewStore.transferStudent(sid, circleId);
    const st = previewStore.findStudent(sid)!;
    return {
      ok: res.ok,
      message: res.message,
      placement: {
        history_id: 99,
        circle_id: circleId,
        circle_name: st.circle_name,
        track_name: st.track_name,
        from_at: PREVIEW_TODAY(),
        to_at: null,
      },
    } as T;
  }

  if (p === "/api/circles") {
    return { items: PREVIEW_CIRCLES } as T;
  }

  if (p === "/api/complex/settings" || p === "/api/admin/complex-settings") {
    return {
      graduates_count: 42,
      huffadh_count: 8,
      display_mode: "carousel",
      slides: [],
      semester_weeks: 16,
      school_days: [0, 1, 2, 3, 4],
    } as T;
  }

  if (p === "/api/general-supervisor/staff-attendance/today" && m === "GET") {
    const items = MOCK_STAFF.map((r) => ({
      ...r,
      status: previewStore.getStaffStatus(r.user_id, date, r.status),
    }));
    return { date, items, default_status: "present" } as T;
  }

  if (p === "/api/general-supervisor/staff-attendance/init-today" && m === "POST") {
    for (const r of MOCK_STAFF) {
      previewStore.setStaffStatus(r.user_id, PREVIEW_TODAY(), "present");
    }
    return { ok: true, date: PREVIEW_TODAY(), count: MOCK_STAFF.length } as T;
  }

  if (p === "/api/general-supervisor/staff-attendance/upsert" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const uid = Number(body.user_id);
    const d = body.attendance_date ?? PREVIEW_TODAY();
    if (uid) previewStore.setStaffStatus(uid, d, body.status ?? "present");
    return { ok: true } as T;
  }

  if (p === "/api/admin-dept/staff" && m === "GET") {
    const items = MOCK_STAFF.map((r) => ({
      user_id: r.user_id,
      full_name_ar: r.full_name_ar,
      role: r.role,
      status: previewStore.getStaffStatus(r.user_id, date, r.status),
    }));
    return { date, items, default_status: "present" } as T;
  }

  if (p === "/api/admin-dept/staff/attendance" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const d = body.attendance_date ?? PREVIEW_TODAY();
    for (const rec of body.records ?? []) {
      const uid = Number(rec.user_id);
      if (uid) previewStore.setStaffStatus(uid, d, rec.status ?? "present");
    }
    return { ok: true, attendance_date: d, saved: body.records?.length ?? 0 } as T;
  }

  const circleAtt = p.match(/^\/api\/admin-dept\/students\/attendance\/(\d+)$/);
  if (circleAtt && m === "GET") {
    const circleId = Number(circleAtt[1]);
    const items = previewStore.getStudents().map((s) => ({
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      status: previewStore.getStudentStatus(s.id, date, "present"),
    }));
    return {
      attendance_date: date,
      circle: { id: circleId, name_ar: `حلقة ${circleId}`, stage: "primary" },
      items,
      default_status: "present",
    } as T;
  }

  if (p === "/api/admin-dept/students/attendance" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const d = body.attendance_date ?? PREVIEW_TODAY();
    for (const rec of body.records ?? []) {
      const sid = Number(rec.student_id);
      if (sid) previewStore.setStudentStatus(sid, d, rec.status ?? "present");
    }
    return {
      ok: true,
      attendance_date: d,
      circle_id: body.circle_id,
      saved: body.records?.length ?? 0,
    } as T;
  }

  if (p === "/api/admin-dept/magic-links" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const token = `preview-${body.circle_id ?? 1}-${Date.now()}`;
    return {
      ok: true,
      id: 1,
      token,
      feature_name: "student_attendance",
      is_active: 1,
      context_data: { circle_id: body.circle_id, attendance_date: date },
      public_path: `/public/attendance/${token}`,
      api_get: `/api/public/attendance/${token}`,
      api_post: `/api/public/attendance/${token}`,
    } as T;
  }

  if (p.match(/^\/api\/admin-dept\/magic-links\/\d+\/toggle$/) && m === "PUT") {
    return { ok: true, id: 1, is_active: 0 } as T;
  }

  if (p === "/api/admin-dept/students/absent-today" && m === "GET") {
    const items = previewStore
      .getStudents()
      .slice(0, 3)
      .map((s) => ({
        student_id: s.id,
        full_name_ar: s.full_name_ar,
        guardian_phone: s.guardian_phone ?? "966500000001",
        status: "absent",
        circle_name: s.circle_name,
        whatsapp_url: `https://wa.me/966500000001?text=${encodeURIComponent("غياب تجريبي")}`,
      }));
    return { date, items, template: "غياب {{student_name}}" } as T;
  }

  if (p === "/api/admin-dept/admission" && m === "POST") {
    return {
      ok: true,
      student_id: 901,
      stage_id: 2,
      stage_label: "ابتدائي",
      circle_id: 1,
    } as T;
  }

  if (p === "/api/admin-dept/pledges" && m === "POST") {
    return {
      ok: true,
      pledge_id: 1,
      pledge_count: 3,
      max_pledges: 3,
      threshold_reached: true,
      alert: "تنبيه تجريبي: بلغ الحد",
    } as T;
  }

  const pledgeGet = p.match(/^\/api\/admin-dept\/pledges\/(\d+)$/);
  if (pledgeGet && m === "GET") {
    const sid = Number(pledgeGet[1]);
    const st = previewStore.findStudent(sid);
    return {
      student: st ?? { id: sid, full_name_ar: "طالب تجريبي" },
      pledges: [
        {
          id: 1,
          reason_ar: "تأخر",
          pledge_date: date,
          created_at: date,
          created_by_name: "مشرف",
        },
      ],
      pledge_count: 1,
      max_pledges: 3,
      threshold_reached: false,
    } as T;
  }

  const pubAtt = p.match(/^\/api\/public\/attendance\/([^/]+)$/);
  if (pubAtt && m === "GET") {
    const token = pubAtt[1];
    return {
      token,
      attendance_date: date,
      circle: { id: 1, name_ar: "حلقة تجريبية", stage: "primary" },
      items: previewStore.getStudents().slice(0, 5).map((s) => ({
        student_id: s.id,
        full_name_ar: s.full_name_ar,
        status: "present",
      })),
      default_status: "present",
    } as T;
  }
  if (pubAtt && m === "POST") {
    return { ok: true, saved: 1 } as T;
  }

  if (p === "/api/general-supervisor/applications" && m === "GET") {
    return { items: previewStore.getApplications() } as T;
  }

  if (p === "/api/general-supervisor/applications" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const row = {
      id: previewStore.nextAppId(),
      ...body,
      status: "pending",
      created_at: PREVIEW_TODAY(),
    };
    previewStore.pushApplication(row);
    return { ok: true, id: row.id } as T;
  }

  if (p.match(/\/api\/general-supervisor\/applications\/\d+\/accept/) && m === "POST") {
    return { ok: true, student_id: 99, admission_status: "pending_placement" } as T;
  }

  if (p.match(/\/api\/general-supervisor\/applications\/\d+\/reject/) && m === "POST") {
    return { ok: true } as T;
  }

  if (p === "/api/general-supervisor/disciplinary" && m === "GET") {
    const st = previewStore.findStudent(1)!;
    return {
      items: [
        {
          id: 1,
          full_name_ar: st.full_name_ar,
          stage_id: 2,
          notice_count: 1,
          escalation_level: "notice_1",
          pledge_archived: 0,
          account_status: "active",
        },
      ],
    } as T;
  }

  if (p === "/api/general-supervisor/dashboard" && m === "GET") {
    const pending = previewStore.filterStudents({
      admission_status: "pending_placement",
    }).length;
    return {
      today: PREVIEW_TODAY(),
      kpis: {
        active_students: previewStore.getStudents().length,
        present_today: 6,
        attendance_rate_today: 75,
        graduates_count: 42,
        huffadh_count: 8,
        pending_applications: previewStore.getApplications().length,
        pending_placement: pending,
      },
    } as T;
  }

  if (p === "/api/general-supervisor/tv-launch" && m === "GET") {
    return {
      session: {
        id: previewStore.getHimmaSession().id,
        tv_launch_key: previewStore.getHimmaSession().tv_launch_key,
        name_ar: previewStore.getHimmaSession().name_ar,
      },
      fallback_url: "/tv-live",
    } as T;
  }

  if (
    (p === "/api/general-supervisor/student-attendance/today" ||
      p === "/api/edu-supervisor/student-attendance/today") &&
    m === "GET"
  ) {
    const items = previewStore.getStudents().map((s) => ({
      student_id: s.id,
      full_name_ar: s.full_name_ar,
      stage_id: s.stage_id,
      circle_name: s.circle_name,
      status: previewStore.getStudentStatus(s.id, date, "present"),
    }));
    return {
      date,
      items,
      default_status: "present",
      scope: { type: "stages", stageIds: [2] },
    } as T;
  }

  if (
    (p === "/api/general-supervisor/student-attendance/init-today" ||
      p === "/api/edu-supervisor/student-attendance/init-today") &&
    m === "POST"
  ) {
    for (const s of previewStore.getStudents()) {
      previewStore.setStudentStatus(s.id, PREVIEW_TODAY(), "present");
    }
    return { ok: true, date: PREVIEW_TODAY(), count: previewStore.getStudents().length } as T;
  }

  if (
    (p === "/api/general-supervisor/student-attendance/upsert" ||
      p === "/api/edu-supervisor/student-attendance/upsert") &&
    m === "POST"
  ) {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const sid = Number(body.student_id);
    const d = body.attendance_date ?? PREVIEW_TODAY();
    if (sid) previewStore.setStudentStatus(sid, d, body.status ?? "present");
    return { ok: true } as T;
  }

  if (p === "/api/yom-himma" && m === "GET") {
    const s = previewStore.getHimmaSession();
    return {
      items: [
        {
          id: s.id,
          name_ar: s.name_ar,
          session_date: s.session_date,
          status: s.status,
          tv_launch_key: s.tv_launch_key,
          live_log_token: previewStore.getHimmaLiveToken(),
        },
      ],
    } as T;
  }

  const himmaDetailMatch = p.match(/^\/api\/yom-himma\/(\d+)$/);
  if (himmaDetailMatch && m === "GET") {
    return previewStore.getHimmaDetail() as T;
  }

  const himmaAuditMatch = p.match(/^\/api\/yom-himma\/(\d+)\/audit$/);
  if (himmaAuditMatch && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const sid = Number(body.student_id);
    previewStore.upsertHimmaAudit(sid, body);
    const failed =
      Number(body.errors_count ?? 0) >= 3 || Number(body.delta_error ?? 0) > 0;
    return { ok: true, failed } as T;
  }

  if (p.match(/^\/api\/yom-himma\/\d+\/live-log-token$/) && m === "POST") {
    const token = previewStore.rotateHimmaLiveToken();
    return {
      ok: true,
      live_log_token: token,
      access_pin: "1234",
      path: `/live-log/${token}`,
    } as T;
  }

  if (p === "/api/yom-himma" && m === "POST") {
    return {
      ok: true,
      id: previewStore.getHimmaSession().id,
      tv_launch_key: previewStore.getHimmaSession().tv_launch_key,
    } as T;
  }


  if (p.startsWith("/api/edu-supervisor/master-grid") && m === "GET") {
    const pendingOnly = url.searchParams.get("pending_acceptance") === "1";
    const rows = previewStore.listStudents().map((s) => ({
      id: s.id,
      full_name_ar: s.full_name_ar,
      is_active: 1,
      stage_id: s.stage_id,
      school_grade: s.school_grade,
      admission_status: s.admission_status,
      current_circle_id: s.admission_status === "pending_placement" ? null : 1,
      current_circle_name: s.admission_status === "pending_placement" ? null : "حلقة معاينة",
      current_track_id: s.admission_status === "pending_placement" ? null : 1,
      current_track_name: s.admission_status === "pending_placement" ? null : "مسار معاينة",
    }));
    return {
      items: pendingOnly
        ? rows.filter((r) => r.current_circle_id === null && r.current_track_id === null)
        : rows,
      circles: PREVIEW_CIRCLES,
      tracks: PREVIEW_TRACKS,
      pending_filter_applied: pendingOnly,
    } as T;
  }

  if (p === "/api/edu-supervisor/dashboard" && m === "GET") {
    const pending = previewStore.filterStudents({
      admission_status: "pending_placement",
      stageIds: [2],
    }).length;
    const inScope = previewStore.filterStudents({ stageIds: [2] });
    return {
      scope_label: "ابتدائي",
      kpis: {
        pending_placement: pending,
        active_students: inScope.filter((s) => !s.admission_status).length,
        active_competitions: previewStore.getCompetitions().length,
        teacher_marks_today: 3,
      },
      active_himma: {
        id: previewStore.getHimmaSession().id,
        name_ar: previewStore.getHimmaSession().name_ar,
      },
    } as T;
  }

  if (p === "/api/edu-supervisor/scope" && m === "GET") {
    return {
      supervisor_scope: "2",
      scope: { type: "stages", stageIds: [2] },
    } as T;
  }

  if (p === "/api/edu-supervisor/target-options" && m === "GET") {
    const scoped = previewStore.filterStudents({ stageIds: [2] });
    return {
      students: scoped.map((s) => ({
        id: s.id,
        full_name_ar: s.full_name_ar,
        stage_id: s.stage_id,
        circle_name: s.circle_name,
      })),
      circles: PREVIEW_CIRCLES.filter((c) => c.stage_id === 2),
      tracks: PREVIEW_TRACKS,
      scope: { type: "stages", stageIds: [2] },
    } as T;
  }

  const eduStudentMatch = p.match(/^\/api\/edu-supervisor\/students\/(\d+)$/);
  if (eduStudentMatch && m === "GET") {
    const sid = Number(eduStudentMatch[1]);
    const st = previewStore.findStudent(sid) ?? previewStore.getStudents()[0];
    const plan = previewStore.getEduPlan(sid);
    return {
      student: st,
      current: {
        circle_name: st.circle_name,
        track_name: st.track_name,
      },
      edu_plan: plan,
      teacher_marks: previewStore.getTeacherMarks(sid),
      competitions_summary: previewStore.getCompetitions(),
      competition_logs: PREVIEW_COMPETITION_LOGS.filter((l) => l.student_id === sid),
    } as T;
  }

  if (p.match(/^\/api\/edu-supervisor\/students\/\d+\/plan$/) && m === "PATCH") {
    const sid = Number(p.match(/^\/api\/edu-supervisor\/students\/(\d+)\/plan$/)![1]);
    const body = bodyText ? JSON.parse(bodyText) : {};
    previewStore.patchEduPlan(sid, body.targets ?? {}, body.notes);
    return { ok: true } as T;
  }

  if (p.match(/^\/api\/edu-supervisor\/students\/\d+\/apply-himma-plan$/) && m === "POST") {
    const sid = Number(
      p.match(/^\/api\/edu-supervisor\/students\/(\d+)\/apply-himma-plan$/)![1],
    );
    const targets = previewStore.applyHimmaPlan(sid);
    return { ok: true, targets } as T;
  }

  const compDetail = p.match(/^\/api\/edu-supervisor\/competitions\/(\d+)$/);
  if (compDetail && m === "GET") {
    const id = Number(compDetail[1]);
    const c = previewStore.getCompetition(id) ?? previewStore.getCompetitions()[0];
    const isIntensive = String(c.telemetry_type) === "intensive_routine";
    return {
      competition: c,
      targets: [{ target_type: "circle", circle_id: 1 }],
      plans: isIntensive ? [] : previewStore.getCompetitionPlans(id),
      logs: isIntensive ? PREVIEW_COMPETITION_LOGS : [],
    } as T;
  }

  if (p === "/api/edu-supervisor/competitions" && m === "GET") {
    return { items: previewStore.getCompetitions() } as T;
  }

  if (p === "/api/edu-supervisor/competitions" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const row = {
      id: previewStore.getCompetitions().length + 1,
      name_ar: body.name_ar,
      start_date: body.start_date,
      end_date: body.end_date,
      status: "draft",
      telemetry_type: body.telemetry_type ?? "intensive_routine",
      live_log_token: null,
      tv_launch_key: `comp-${Date.now()}`,
      stage_id: 2,
    };
    previewStore.addCompetition(row);
    return { ok: true, id: row.id, tv_launch_key: row.tv_launch_key } as T;
  }

  if (p.match(/^\/api\/edu-supervisor\/competitions\/\d+\/live-log-token$/) && m === "POST") {
    const id = Number(p.match(/^\/api\/edu-supervisor\/competitions\/(\d+)\/live-log-token$/)![1]);
    const token = `preview-comp-${Date.now()}`;
    previewStore.setCompetitionLiveToken(id, token);
    return { ok: true, live_log_token: token, access_pin: "1234", path: `/live-log/${token}` } as T;
  }

  if (p.match(/^\/api\/edu-supervisor\/competitions\/\d+\/activate$/) && m === "POST") {
    return { ok: true } as T;
  }

  if (p === "/api/v1/education/public/validate-gate" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const token = String(body.token ?? "demo-himma-live");
    const pin = String(body.pin_code ?? "");
    if (pin && pin !== "1234" && pin !== "8890") {
      throw new Error("invalid_pin");
    }
    const payload = liveLogPayload(token);
    return {
      ok: true,
      session_token: "preview-reciter-jwt",
      session: payload.session,
      students: (payload.students as Array<Record<string, unknown>>).map((s) => ({
        id: Number(s.student_id),
        full_name_ar: String(s.full_name_ar),
        school_grade: null,
      })),
    } as T;
  }

  if (p.match(/^\/api\/v1\/education\/public\/student-snapshot\/\d+$/) && m === "GET") {
    return {
      student: { id: 1, full_name_ar: "معاينة طالب", school_grade: null, memorization_amount: null },
      cumulative: { total_memorized_days: 12, aggregate_errors: 2, aggregate_warnings: 1 },
      plan: null,
      session_today: {
        has_memorized: 0,
        memorization_errors: 0,
        memorization_warnings: 0,
        juz_done: 0,
        hizb_done: 0,
        current_hizb_failed: 0,
      },
      target: { target_juz: 1, target_hizb: 2 },
    } as T;
  }

  if (p === "/api/v1/education/public/submit-log" && m === "POST") {
    return { ok: true, failed: false, tv_key: "preview-key" } as T;
  }

  if (p.startsWith("/api/v1/education/supervisor/master-grid") && m === "GET") {
    return {
      date: new Date().toISOString().slice(0, 10),
      rows: previewStore.listStudents().map((s) => ({
        student_id: s.id,
        full_name_ar: s.full_name_ar,
        school_grade: s.school_grade,
        circle_id: 1,
        circle_name: "حلقة معاينة",
        has_memorized: 0,
        has_reviewed: 0,
        has_linked: 0,
        memorization_errors: 0,
        memorization_warnings: 0,
      })),
    } as T;
  }

  if (p === "/api/v1/education/supervisor/upsert-log" && m === "POST") {
    return { ok: true } as T;
  }

  const liveMatch = p.match(/^\/api\/live-log\/([^/]+)$/);
  if (liveMatch && (m === "GET" || m === "POST")) {
    throw new Error("deprecated");
  }

  if (p === "/api/prog-supervisor/scope" && m === "GET") {
    return {
      supervisor_scope: "global",
      scope: { type: "global" },
      scope_label: "كل المجمع",
    } as T;
  }

  if (p === "/api/prog-supervisor/analytics" && m === "GET") {
    return {
      scope_label: "كل المجمع",
      kpis: {
        published_quizzes: progPreviewStore.listQuizzes().length,
        quiz_attempts_submitted: 2,
        average_quiz_score: 88,
      },
      top_students: [
        { id: 1, full_name_ar: "أحمد محمد العتيبي", avg_score: 90, quiz_count: 2 },
      ],
      top_circles_participation: [
        { id: 1, name_ar: "حلقة الصديق", participants: 5, participation_events: 8 },
      ],
      circle_quiz_averages: [
        { id: 1, name_ar: "حلقة الصديق", avg_score: 85, attempts: 4 },
      ],
    } as T;
  }

  if (p === "/api/prog-supervisor/quizzes" && m === "GET") {
    return { items: progPreviewStore.listQuizzes() } as T;
  }

  if (p === "/api/prog-supervisor/quizzes" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const id = progPreviewStore.createQuiz(
      String(body.title_ar ?? "اختبار جديد"),
      body.access_code ?? null,
    );
    return { ok: true, id } as T;
  }

  const progQuizMatch = p.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)$/);
  if (progQuizMatch && m === "GET") {
    const qid = Number(progQuizMatch[1]);
    const quiz = progPreviewStore.getQuiz(qid);
    if (!quiz) return { error: "not_found" } as T;
    return {
      quiz,
      questions: progPreviewStore.getQuestions(qid),
      attempts: [],
    } as T;
  }

  if (progQuizMatch && m === "PATCH") {
    return { ok: true } as T;
  }

  const progQSave = p.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/questions$/);
  if (progQSave && m === "PUT") {
    const qid = Number(progQSave[1]);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const list = (body.questions ?? []).map((q: Record<string, unknown>, i: number) => ({
      id: 100 + i,
      question_type: (q.question_type === "true_false" ? "true_false" : "mcq") as "mcq" | "true_false",
      prompt_ar: String(q.prompt_ar ?? ""),
      points: Number(q.points) || 1,
      correct_answer: String(q.correct_answer ?? ""),
      options_json: JSON.stringify(q.options ?? []),
      sort_order: i,
    }));
    const total = progPreviewStore.saveQuestions(qid, list);
    return { ok: true, total_points: total } as T;
  }

  const progPublish = p.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/publish$/);
  if (progPublish && m === "POST") {
    const qid = Number(progPublish[1]);
    const res = progPreviewStore.publishQuiz(qid);
    return { ok: true, ...res } as T;
  }

  const progLinks = p.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/links$/);
  if (progLinks && m === "GET") {
    return progPreviewStore.getLinks(Number(progLinks[1])) as T;
  }

  if (p === "/api/prog-supervisor/vault" && m === "GET") {
    const q = url.searchParams.get("q") ?? "";
    return { items: progPreviewStore.listVault(q), q: q || null } as T;
  }

  if (p === "/api/prog-supervisor/vault" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    progPreviewStore.addVault(body);
    return { ok: true, id: 99 } as T;
  }

  if (p.match(/^\/api\/prog-supervisor\/vault\/\d+$/) && m === "PATCH") {
    return { ok: true } as T;
  }

  if (p === "/api/prog-supervisor/activities" && m === "GET") {
    return {
      items: [
        { id: 1, title_ar: "رحلة ترفيهية — معاينة", activity_type: "trip", starts_at: PREVIEW_TODAY() },
      ],
    } as T;
  }

  if (p === "/api/prog-supervisor/target-options" && m === "GET") {
    const scoped = previewStore.filterStudents({ stageIds: [2] });
    return {
      students: scoped,
      circles: PREVIEW_CIRCLES.filter((c) => c.stage_id === 2),
      scope: { type: "global" },
    } as T;
  }

  const quizPublic = p.match(/^\/api\/quiz\/(\d+)\/public$/);
  if (quizPublic && m === "GET") {
    const qid = Number(quizPublic[1]);
    const quiz = progPreviewStore.getQuiz(qid);
    if (!quiz) return { error: "not_found" } as T;
    return {
      quiz_id: qid,
      title_ar: quiz.title_ar,
      requires_access_code: Boolean(quiz.access_code),
      status: quiz.status,
    } as T;
  }

  const quizGate = p.match(/^\/api\/quiz\/(\d+)\/gate$/);
  if (quizGate && m === "POST") {
    const qid = Number(quizGate[1]);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const res = progPreviewStore.gate(qid, String(body.identifier ?? ""), String(body.access_code ?? ""));
    if (!res) return { error: "not_found" } as T;
    if ("error" in res) {
      if (res.error === "submitted") return { error: "already_submitted" } as T;
      return { error: "invalid_access_code" } as T;
    }
    return {
      ok: true,
      session_token: res.token,
      student_id: res.student_id,
      full_name_ar: res.full_name_ar,
    } as T;
  }

  const quizTake = p.match(/^\/api\/quiz\/(\d+)\/take$/);
  if (quizTake && m === "GET") {
    const qid = Number(quizTake[1]);
    const token = url.searchParams.get("token") ?? "";
    const res = progPreviewStore.take(qid, token);
    if (!res) return { error: "invalid_token" } as T;
    if ("already_submitted" in res && res.already_submitted) {
      return {
        already_submitted: true,
        score_percent: res.score_percent,
        student: { full_name_ar: res.full_name_ar },
      } as T;
    }
    return {
      quiz: { id: qid, title_ar: res.quiz.title_ar },
      student: res.student,
      questions: res.questions,
    } as T;
  }

  const quizSubmit = p.match(/^\/api\/quiz\/(\d+)\/submit$/);
  if (quizSubmit && m === "POST") {
    const qid = Number(quizSubmit[1]);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const res = progPreviewStore.submit(qid, String(body.token ?? ""), body.answers ?? {});
    if (!res) return { error: "invalid_token" } as T;
    if ("error" in res) return { error: "already_submitted" } as T;
    return { ok: true, score_percent: res.score_percent } as T;
  }

  if (p === "/api/teacher/calendar" && m === "GET") {
    return teacherPreviewStore.calendar() as T;
  }

  if (p === "/api/teacher/plans" && m === "GET") {
    return { items: teacherPreviewStore.listPlans() } as T;
  }

  if (p === "/api/teacher/plans/estimate" && m === "POST") {
    const body = bodyText ? JSON.parse(bodyText) : {};
    const calendar = teacherPreviewStore.calendar();
    return {
      calendar,
      estimate: estimatePlan(calendar, {
        daily_hifz_pages: Number(body.daily_hifz_pages) || 0,
        daily_muraja_pages: Number(body.daily_muraja_pages) || 0,
        daily_rabt_faces: Number(body.daily_rabt_faces) || 0,
        repeat_target: Number(body.repeat_target) || 1,
      }),
    } as T;
  }

  const teacherPlanMatch = p.match(/^\/api\/teacher\/plans\/(\d+)$/);
  if (teacherPlanMatch) {
    const sid = Number(teacherPlanMatch[1]);
    if (m === "GET") {
      return teacherPreviewStore.getPlan(sid) as T;
    }
    if (m === "PUT") {
      const body = bodyText ? JSON.parse(bodyText) : {};
      const res = teacherPreviewStore.savePlan(sid, body);
      if (!res) return { error: "not_found" } as T;
      return res as T;
    }
  }

  if (p.startsWith("/api/teacher/daily-marks")) {
    const date = url.searchParams.get("date") ?? PREVIEW_TODAY();
    if (m === "GET") {
      return { date, items: teacherPreviewStore.listMarks(date) } as T;
    }
    const body = bodyText ? JSON.parse(bodyText) : {};
    const metrics = (body.metrics ?? {}) as DailyMetrics;
    const score = scoreFromMetrics(metrics);
    return teacherPreviewStore.upsertMark(
      Number(body.student_id),
      String(body.mark_date ?? date),
      metrics,
      score,
    ) as T;
  }

  if (p.startsWith("/api/admin/")) {
    return { ok: true, items: [] } as T;
  }

  if (m === "PATCH" || m === "POST") {
    return { ok: true } as T;
  }

  return { items: [], count: 0, ok: true } as T;
}
