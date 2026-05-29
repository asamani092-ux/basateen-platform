/**
 * D1 data contracts (v3.2) — 18 core tables for API–database alignment.
 * Nullable fields mirror SQLite columns added across migrations.
 */

export type UserRole =
  | "super_admin"
  | "edu_supervisor"
  | "admin_supervisor"
  | "prog_supervisor"
  | "teacher";

/** Map legacy JWT/DB role strings to v3.2 department roles */
export function normalizeUserRole(role: string): UserRole {
  switch (role) {
    case "general_manager":
      return "super_admin";
    case "general_supervisor":
      return "admin_supervisor";
    case "super_admin":
    case "edu_supervisor":
    case "admin_supervisor":
    case "prog_supervisor":
    case "teacher":
      return role;
    default:
      return "teacher";
  }
}

export type UserSection = "admin" | "education" | "programs";

/** Flat-matrix flags (legacy/alternate users schema) */
export interface UserFlatFlags {
  is_admin: number;
  is_educational: number;
  is_programs: number;
  is_teacher: number;
  is_track_supervisor: number;
  stage_scope: string | null;
}

export interface Complex {
  id: number;
  name_ar: string;
  created_at: string;
}

/** RBAC row (migrations 001 + 007) */
export interface User {
  id: number;
  complex_id: number;
  email: string;
  mobile: string | null;
  password_hash: string;
  full_name_ar: string;
  role: UserRole;
  supervisor_scope?: string | null;
  is_active: number;
  created_at: string;
}

export interface UserSectionRow {
  id: number;
  user_id: number;
  section: UserSection;
}

export interface Session {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface Track {
  id: number;
  complex_id: number;
  name_ar: string;
}

export interface Circle {
  id: number;
  complex_id: number;
  track_id: number | null;
  name_ar: string;
  capacity: number;
  is_active: number;
}

export interface Student {
  id: number;
  complex_id: number;
  full_name_ar: string;
  national_id: string | null;
  phone: string | null;
  is_active: number;
  created_at: string;
  stage_id?: number | null;
  admission_status?: string | null;
  school_grade?: string | null;
  age?: number | null;
  guardian_phone?: string | null;
}

export interface StudentCircleHistory {
  id: number;
  student_id: number;
  circle_id: number;
  track_id: number | null;
  teacher_user_id: number | null;
  from_at: string;
  to_at: string | null;
  frozen_at: string | null;
  note: string | null;
}

export interface SupervisorScope {
  user_id: number;
  circle_id: number | null;
  track_id: number | null;
}

export interface TeacherAssignment {
  user_id: number;
  circle_id: number;
}

export interface ComplexSettings {
  complex_id: number;
  semester_weeks: number;
  school_days_json: string;
  graduates_count: number;
  huffadh_count: number;
  updated_at: string;
}

export interface YomHimmaSession {
  id: number;
  complex_id: number;
  name_ar: string;
  session_date: string;
  status: string;
  rules_json: string;
  live_log_token: string | null;
  tv_launch_key: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface YomHimmaTarget {
  id: number;
  session_id: number;
  student_id: number;
  target_juz: number | null;
  target_hizb: number | null;
}

export interface YomHimmaAudit {
  id: number;
  session_id: number;
  student_id: number;
  attendance: string | null;
  juz_done: number | null;
  hizb_done: number | null;
  alerts_count: number | null;
  errors_count: number | null;
  current_hizb_failed: number | null;
  updated_at: string | null;
}

export interface Competition {
  id: number;
  complex_id: number;
  name_ar: string;
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "closed" | string;
  telemetry_type: string;
  rules_json: string;
  scope_json: string;
  stage_id: number | null;
  live_log_token: string | null;
  tv_launch_key: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitionTarget {
  id: number;
  competition_id: number;
  target_type: "student" | "circle" | "track" | string;
  student_id: number | null;
  circle_id: number | null;
  track_id: number | null;
}

export interface CompetitionLog {
  id: number;
  competition_id: number;
  student_id: number;
  log_date: string;
  metrics_json: string;
  source: string;
  recorded_by_user_id: number | null;
  recorded_at: string;
}

export interface TeacherDailyMark {
  id: number;
  student_id: number;
  teacher_user_id: number;
  mark_date: string;
  listening_done: number;
  repetition_done: number;
  review_done: number;
  linkage_done: number;
  notes: string | null;
  recorded_at: string;
}

/** Union used when reading users table before schema detection */
export type DbUserRow = User | (Omit<User, "role"> & UserFlatFlags & { role?: UserRole });

export function resolveRoleFromUser(row: DbUserRow): UserRole {
  if ("role" in row && row.role) return normalizeUserRole(String(row.role));
  const flat = row as UserFlatFlags;
  if (flat.is_admin === 1) return "super_admin";
  if (flat.is_educational === 1) return "edu_supervisor";
  if (flat.is_programs === 1) return "prog_supervisor";
  if (flat.is_teacher === 1) return "teacher";
  return "super_admin";
}
