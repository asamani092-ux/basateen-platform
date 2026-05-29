-- Quranic day mega refactor: settings, enrolled students, extended records

ALTER TABLE quranic_days ADD COLUMN fail_threshold INTEGER NOT NULL DEFAULT 3;
ALTER TABLE quranic_days ADD COLUMN hizb_time_limit INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS quranic_day_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quranic_day_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  target_hizbs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(quranic_day_id, student_id),
  FOREIGN KEY (quranic_day_id) REFERENCES quranic_days(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quranic_day_students_day
  ON quranic_day_students(quranic_day_id);

CREATE INDEX IF NOT EXISTS idx_quranic_day_students_student
  ON quranic_day_students(student_id);

ALTER TABLE quranic_day_records ADD COLUMN lahn_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quranic_day_records ADD COLUMN time_taken_seconds INTEGER NOT NULL DEFAULT 0;
