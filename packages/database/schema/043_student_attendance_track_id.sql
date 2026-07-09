-- 043: dual-entity attendance — nullable track_id alongside circle_id
ALTER TABLE student_attendance ADD COLUMN track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_attendance_date_track
  ON student_attendance(attendance_date, track_id);
