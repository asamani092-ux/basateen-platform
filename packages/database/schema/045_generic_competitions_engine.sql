-- Generic competitions engine: per-competition description, isolated attendance, global weight

ALTER TABLE competitions ADD COLUMN description TEXT;

ALTER TABLE edu_settings ADD COLUMN competition_attendance_weight REAL NOT NULL DEFAULT 1.0;

CREATE TABLE IF NOT EXISTS competition_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1)),
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (competition_id, student_id, attendance_date),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_competition_attendance_comp_date
  ON competition_attendance(competition_id, attendance_date);
