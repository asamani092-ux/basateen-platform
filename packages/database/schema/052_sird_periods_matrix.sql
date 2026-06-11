-- 052: Sird (recitation) periods matrix — isolated from dynamic competition_tasks
-- Each student period stores exactly: hizb_number, mistakes_count, warnings_count, is_passed

CREATE TABLE IF NOT EXISTS sird_period_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  period_index INTEGER NOT NULL CHECK (period_index >= 1),
  hizb_number REAL NOT NULL DEFAULT 0,
  mistakes_count INTEGER NOT NULL DEFAULT 0,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  is_passed INTEGER NOT NULL DEFAULT 0 CHECK (is_passed IN (0, 1)),
  score REAL,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (competition_id, student_id, period_index),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_sird_period_records_comp_student
  ON sird_period_records(competition_id, student_id);

CREATE INDEX IF NOT EXISTS idx_sird_period_records_comp_period
  ON sird_period_records(competition_id, period_index);
