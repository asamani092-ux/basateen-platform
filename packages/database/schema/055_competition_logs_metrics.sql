-- Restore metrics_json + source on competition_logs (v48 dropped them in 021).
-- Enables single-row-per-student/day grading with juz_done in JSON.

ALTER TABLE competition_logs ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE competition_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'edu_supervisor';

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_logs_student_day
  ON competition_logs (competition_id, student_id, log_date);
