-- Edu mega update: rabt weight, teacher sandbox competitions, quranic days

ALTER TABLE edu_settings ADD COLUMN rabt_weight REAL NOT NULL DEFAULT 1.0;

CREATE TABLE IF NOT EXISTS teacher_competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  teacher_user_id INTEGER NOT NULL,
  name_ar TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_teacher_competitions_teacher
  ON teacher_competitions(teacher_user_id);

CREATE TABLE IF NOT EXISTS competition_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  title_ar TEXT NOT NULL,
  weight_points REAL NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (competition_id) REFERENCES teacher_competitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competition_tasks_comp
  ON competition_tasks(competition_id);

CREATE TABLE IF NOT EXISTS student_comp_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  points REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(task_id, student_id),
  FOREIGN KEY (task_id) REFERENCES competition_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quranic_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  event_date TEXT NOT NULL,
  deduction_rules TEXT NOT NULL DEFAULT '{"mistake_penalty":1,"alert_penalty":0.5}',
  magic_token TEXT UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quranic_days_token
  ON quranic_days(magic_token);

CREATE TABLE IF NOT EXISTS quranic_day_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quranic_day_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  hizb_number INTEGER NOT NULL,
  mistakes INTEGER NOT NULL DEFAULT 0,
  alerts INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(quranic_day_id, student_id, hizb_number),
  FOREIGN KEY (quranic_day_id) REFERENCES quranic_days(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quranic_day_records_day
  ON quranic_day_records(quranic_day_id, student_id);
