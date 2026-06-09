-- Competition engine performance indexes (preview + list + detail)

CREATE INDEX IF NOT EXISTS idx_competitions_complex_start
  ON competitions(complex_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_sch_active_circle
  ON student_circle_history(circle_id, student_id)
  WHERE to_at IS NULL AND frozen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sch_active_track
  ON student_circle_history(track_id, student_id)
  WHERE to_at IS NULL AND frozen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_stage_active
  ON students(stage_id, complex_id)
  WHERE stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competition_tasks_comp_sort
  ON competition_tasks(competition_id, sort_order);
