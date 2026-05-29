-- Edu Department Phase 1: settings, daily recitation, teacher requests

CREATE TABLE IF NOT EXISTS edu_settings (
  complex_id INTEGER PRIMARY KEY,
  weight_listening REAL NOT NULL DEFAULT 1.0,
  weight_revision REAL NOT NULL DEFAULT 1.0,
  weight_repeat REAL NOT NULL DEFAULT 1.0,
  penalty_per_error REAL NOT NULL DEFAULT 0.5,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edu_daily_recitation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  teacher_user_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  recitation_date TEXT NOT NULL,
  listened INTEGER NOT NULL DEFAULT 0,
  repeated INTEGER NOT NULL DEFAULT 0,
  revised INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  tune_errors INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, recitation_date)
);

CREATE INDEX IF NOT EXISTS idx_edu_daily_recitation_circle_date
  ON edu_daily_recitation(circle_id, recitation_date);

CREATE TABLE IF NOT EXISTS teacher_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  student_id INTEGER NOT NULL,
  teacher_user_id INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('transfer', 'escalation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  target_circle_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by_user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_teacher_requests_status
  ON teacher_requests(status, request_type);
