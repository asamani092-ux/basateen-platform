-- Competition engine performance indexes (preview + list + detail)
-- Safe on all schemas — conditional history indexes applied via migrate-049-remote.mjs

CREATE INDEX IF NOT EXISTS idx_competitions_complex_start
  ON competitions(complex_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_students_stage_active
  ON students(stage_id, complex_id)
  WHERE stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competition_tasks_comp_sort
  ON competition_tasks(competition_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_students_current_circle
  ON students(current_circle_id, complex_id)
  WHERE current_circle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_current_track
  ON students(current_track_id, complex_id)
  WHERE current_track_id IS NOT NULL;
