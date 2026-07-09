export type CompetitionLeaderRow = {
  student_id: number;
  score?: number;
  overall_pct?: number;
  grading_days?: number;
  guardian_phone?: string | null;
  full_name_ar?: string;
  target_amount?: number;
  achievement_pct?: number;
  read_count?: number;
  passed_count?: number;
  failed_count?: number;
  total_mistakes?: number;
  total_warnings?: number;
  mastery_pct?: number;
};
