-- محرك المنافسات والبرامج الاستثنائية (عزل عن الرصد اليومي للمعلم)

CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  telemetry_type TEXT NOT NULL
    CHECK (telemetry_type IN ('extended_recitation', 'intensive_routine')),
  rules_json TEXT NOT NULL DEFAULT '{}',
  scope_json TEXT NOT NULL DEFAULT '{}',
  stage_id INTEGER,
  live_log_token TEXT UNIQUE,
  tv_launch_key TEXT UNIQUE,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS competition_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('student', 'circle', 'track')),
  student_id INTEGER,
  circle_id INTEGER,
  track_id INTEGER,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS competition_student_plans (
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  total_target_juz REAL NOT NULL DEFAULT 0,
  daily_volume_juz REAL NOT NULL DEFAULT 0,
  distributed_json TEXT,
  PRIMARY KEY (competition_id, student_id),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS competition_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  log_date TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'edu_supervisor'
    CHECK (source IN ('edu_supervisor', 'live_log', 'general_supervisor')),
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (competition_id, student_id, log_date),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS competition_audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT,
  source TEXT NOT NULL DEFAULT 'live_log',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_competitions_dates ON competitions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_competition_logs_comp ON competition_logs(competition_id, log_date);

-- رمز الرصد التشاركي ليوم الهمة (SQLite: لا يمكن ADD COLUMN مع UNIQUE مباشرة)
ALTER TABLE yom_himma_sessions ADD COLUMN live_log_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_yom_himma_sessions_live_log_token
  ON yom_himma_sessions (live_log_token)
  WHERE live_log_token IS NOT NULL;
