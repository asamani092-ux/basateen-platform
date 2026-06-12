import type { EvalCriterion } from "./evaluation-criteria";

export type TeacherBootstrapNotification = {
  id: number;
  title_ar: string;
  body_ar: string;
  is_read?: number;
  created_at?: string;
};

export type TeacherBootstrapResponse = {
  generated_at: string;
  date: string;
  teacher_circle: { id: number; name_ar: string };
  circle_id: number;
  circle_name: string;
  circles: Array<{ id: number; name_ar: string }>;
  needs_circle_selection: boolean;
  evaluation_criteria: EvalCriterion[];
  items: Array<{
    student_id: number;
    full_name_ar: string;
    track_name?: string | null;
    admin_present?: boolean;
    task_scores?: Record<string, boolean | number>;
    listened?: boolean;
    repeated?: boolean;
    revised?: boolean;
    error_count?: number;
    tune_errors?: number;
    face_count?: number;
    notes: string;
  }>;
  notifications: { items: TeacherBootstrapNotification[] };
};

/** Shape consumed by DailyRecitationPage (compatible with my-students). */
export type RecitationStudentsPayload = {
  date: string;
  circle_id: number | null;
  circle_name: string | null;
  needs_circle_selection: boolean;
  circles: Array<{ id: number; name_ar: string }>;
  evaluation_criteria: EvalCriterion[];
  items: TeacherBootstrapResponse["items"];
};

export function teacherBootstrapToRecitationPayload(
  boot: TeacherBootstrapResponse,
): RecitationStudentsPayload {
  return {
    date: boot.date,
    circle_id: boot.circle_id,
    circle_name: boot.circle_name,
    needs_circle_selection: boot.needs_circle_selection,
    circles: boot.circles,
    evaluation_criteria: boot.evaluation_criteria,
    items: boot.items,
  };
}

export function todayRecitationDate(): string {
  return new Date().toISOString().slice(0, 10);
}
