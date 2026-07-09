-- 060: Semester historical snapshots + edu_daily_recitation.complex_id
-- Applied via apps/api/scripts/migrate-060-remote.mjs

CREATE TABLE IF NOT EXISTS semester_historical_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  semester_start_date TEXT NOT NULL,
  semester_end_date TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by_user_id INTEGER,
  snapshot_attendance_json TEXT NOT NULL DEFAULT '[]',
  snapshot_recitation_json TEXT NOT NULL DEFAULT '[]',
  snapshot_competitions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_semester_snapshots_complex
  ON semester_historical_snapshots(complex_id, semester_start_date);

ALTER TABLE edu_daily_recitation ADD COLUMN complex_id INTEGER REFERENCES complexes(id);

UPDATE edu_daily_recitation
SET complex_id = (
  SELECT s.complex_id FROM students s WHERE s.id = edu_daily_recitation.student_id
)
WHERE complex_id IS NULL;
