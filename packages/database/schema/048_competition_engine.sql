-- Platform competition engine (v48)
-- Extends competitions + per-student targets, tasks, and isolated logs.

ALTER TABLE competitions ADD COLUMN category TEXT NOT NULL DEFAULT 'recitation'
  CHECK (category IN ('recitation', 'review', 'new_memorization', 'other'));

ALTER TABLE competitions ADD COLUMN custom_category TEXT;

ALTER TABLE competitions ADD COLUMN target_scope TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS competition_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  current_memorization REAL NOT NULL DEFAULT 0,
  target_amount REAL NOT NULL DEFAULT 0,
  achieved_amount REAL NOT NULL DEFAULT 0,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (competition_id, student_id),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_competition_targets_comp
  ON competition_targets(competition_id);

CREATE INDEX IF NOT EXISTS idx_competition_targets_student
  ON competition_targets(student_id);

CREATE TABLE IF NOT EXISTS competition_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  name_ar TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  type TEXT NOT NULL CHECK (type IN ('addition', 'deduction')) DEFAULT 'addition',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competition_tasks_platform_comp
  ON competition_tasks(competition_id);

CREATE TABLE IF NOT EXISTS competition_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  task_id INTEGER,
  log_date TEXT NOT NULL,
  points REAL NOT NULL DEFAULT 0,
  notes TEXT,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (task_id) REFERENCES competition_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_competition_logs_comp_date
  ON competition_logs(competition_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_competition_logs_student
  ON competition_logs(competition_id, student_id);
