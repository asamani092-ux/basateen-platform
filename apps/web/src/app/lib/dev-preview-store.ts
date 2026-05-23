import type { StudentRow } from "./api-client";
import { matchesArabicName } from "./attendance-search";
import {
  PREVIEW_COMPETITIONS,
  PREVIEW_EDU_PLANS,
  PREVIEW_HIMMA_SESSION,
  PREVIEW_TODAY,
  buildCompetitionPlans,
  buildHimmaAudit,
  buildHimmaTargets,
  buildTeacherMarksPreview,
  cloneStudents,
} from "./dev-preview-fixtures";

/** حالة قابلة للتعديل أثناء معاينة الواجهة (تسكين، خطط، رصد) */
const students: StudentRow[] = cloneStudents();
const eduPlans = { ...PREVIEW_EDU_PLANS };
const staffStatus = new Map<string, string>();
const studentStatus = new Map<string, string>();
let competitions = [...PREVIEW_COMPETITIONS];
let himmaSession = { ...PREVIEW_HIMMA_SESSION };
let himmaLiveToken = PREVIEW_HIMMA_SESSION.live_log_token as string;
let himmaAudit = buildHimmaAudit();
let himmaTargets = buildHimmaTargets();
let appIdSeq = 100;

const mockApplications: Array<Record<string, unknown>> = [
  {
    id: 1,
    full_name_ar: "طالب جديد — معاينة قبول",
    phone: "0503333001",
    age: 10,
    stage_id: 2,
    school_grade: "الرابع",
    guardian_phone: "0504444001",
    status: "pending",
    created_at: PREVIEW_TODAY(),
  },
];

function keyStudent(id: number, date: string) {
  return `${id}:${date}`;
}

function keyStaff(id: number, date: string) {
  return `${id}:${date}`;
}

export const previewStore = {
  getStudents(): StudentRow[] {
    return students;
  },

  findStudent(id: number): StudentRow | undefined {
    return students.find((s) => s.id === id);
  },

  filterStudents(opts: {
    admission_status?: string | null;
    q?: string | null;
    stageIds?: number[];
  }): StudentRow[] {
    let items = [...students];
    if (opts.admission_status) {
      items = items.filter((s) => s.admission_status === opts.admission_status);
    }
    if (opts.stageIds?.length) {
      items = items.filter(
        (s) => s.stage_id == null || opts.stageIds!.includes(Number(s.stage_id)),
      );
    }
    const q = opts.q?.trim();
    if (q) {
      items = items.filter((s) => matchesArabicName(q, s.full_name_ar));
    }
    return items;
  },

  transferStudent(
    id: number,
    circleId: number,
  ): { ok: boolean; message: string } {
    const st = students.find((s) => s.id === id);
    if (!st) return { ok: false, message: "not_found" };
    const circle =
      circleId === 1
        ? { name: "حلقة الصديق", track: "مسار الحفظ" }
        : circleId === 2
          ? { name: "حلقة النور", track: "مسار الحفظ" }
          : { name: "حلقة الإتقان", track: "مسار التثبيت" };
    st.circle_name = circle.name;
    st.track_name = circle.track;
    st.admission_status = null;
    return { ok: true, message: "تم التسكين (معاينة)" };
  },

  getEduPlan(studentId: number) {
    return (
      eduPlans[studentId] ?? {
        targets: {},
        notes: null,
      }
    );
  },

  patchEduPlan(
    studentId: number,
    targets: Record<string, unknown>,
    notes?: string,
  ) {
    eduPlans[studentId] = { targets, notes: notes ?? null };
  },

  applyHimmaPlan(studentId: number) {
    const row = himmaAudit.find((a) => a.student_id === studentId);
    const prev = eduPlans[studentId]?.targets ?? {};
    eduPlans[studentId] = {
      targets: {
        ...prev,
        himma_hizb_done: row?.hizb_done ?? 0,
        himma_juz_done: row?.juz_done ?? 0,
        last_himma_session_id: himmaSession.id,
      },
      notes: eduPlans[studentId]?.notes ?? null,
    };
    return eduPlans[studentId].targets;
  },

  getTeacherMarks(studentId: number) {
    return buildTeacherMarksPreview(studentId);
  },

  getCompetitions() {
    return competitions;
  },

  getCompetition(id: number) {
    return competitions.find((c) => c.id === id);
  },

  addCompetition(row: Record<string, unknown>) {
    competitions = [...competitions, row];
  },

  setCompetitionLiveToken(id: number, token: string) {
    competitions = competitions.map((c) =>
      c.id === id ? { ...c, live_log_token: token, status: "active" } : c,
    );
  },

  getHimmaSession() {
    return himmaSession;
  },

  getHimmaLiveToken() {
    return himmaLiveToken;
  },

  rotateHimmaLiveToken() {
    himmaLiveToken = `preview-himma-${Date.now()}`;
    himmaSession = { ...himmaSession, live_log_token: himmaLiveToken };
    return himmaLiveToken;
  },

  getHimmaDetail() {
    return {
      session: {
        name_ar: himmaSession.name_ar,
        tv_launch_key: himmaSession.tv_launch_key,
        rules: himmaSession.rules,
      },
      targets: himmaTargets,
      audit: himmaAudit,
    };
  },

  upsertHimmaAudit(studentId: number, patch: Record<string, unknown>) {
    const idx = himmaAudit.findIndex((a) => a.student_id === studentId);
    const base =
      idx >= 0
        ? himmaAudit[idx]
        : {
            student_id: studentId,
            attendance: "present" as const,
            juz_done: 0,
            hizb_done: 0,
            alerts_count: 0,
            errors_count: 0,
            current_hizb_failed: 0,
          };
    const merged = { ...base, ...patch, student_id: studentId };
    if (idx >= 0) himmaAudit[idx] = merged;
    else himmaAudit.push(merged);
    return merged;
  },

  getStaffStatus(userId: number, date: string, fallback: string) {
    return staffStatus.get(keyStaff(userId, date)) ?? fallback;
  },

  setStaffStatus(userId: number, date: string, status: string) {
    staffStatus.set(keyStaff(userId, date), status);
  },

  getStudentStatus(studentId: number, date: string, fallback: string) {
    return studentStatus.get(keyStudent(studentId, date)) ?? fallback;
  },

  setStudentStatus(studentId: number, date: string, status: string) {
    studentStatus.set(keyStudent(studentId, date), status);
  },

  getApplications() {
    return mockApplications;
  },

  pushApplication(row: Record<string, unknown>) {
    mockApplications.push(row);
  },

  nextAppId() {
    return ++appIdSeq;
  },

  getCompetitionPlans(competitionId: number) {
    if (competitionId === 1) return buildCompetitionPlans();
    return [];
  },
};
