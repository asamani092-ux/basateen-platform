-- Phase 2: Educational Division — Flat Grid Matrix (UI-over-Database)
-- Legacy tables (circles, tracks, students, daily_logs from 002/003) are unchanged.
-- New sovereign entities live under edu_matrix_* per hybrid student / context-locked ledger spec.

ALTER TABLE users ADD COLUMN is_educational INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN is_teacher INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN is_track_supervisor INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS edu_matrix_circles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  stage TEXT NOT NULL CHECK (stage IN ('tlaqeen', 'primary', 'middle', 'secondary')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edu_matrix_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  supervisor_id INTEGER NOT NULL REFERENCES users(id),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edu_matrix_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_phone TEXT,
  guardian_phone TEXT NOT NULL,
  national_id TEXT UNIQUE NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('tlaqeen', 'primary', 'middle', 'secondary')),
  academic_grade TEXT NOT NULL,
  current_circle_id INTEGER REFERENCES edu_matrix_circles(id) ON DELETE SET NULL,
  current_track_id INTEGER REFERENCES edu_matrix_tracks(id) ON DELETE SET NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edu_matrix_competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edu_matrix_competition_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES edu_matrix_competitions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('circle', 'track')),
  target_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS edu_matrix_daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES edu_matrix_students(id),
  date TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('circle', 'track', 'competition')),
  context_id INTEGER NOT NULL,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  has_memorized INTEGER DEFAULT 0,
  has_repeated INTEGER DEFAULT 0,
  has_reviewed INTEGER DEFAULT 0,
  has_linked INTEGER DEFAULT 0,
  memorization_errors INTEGER DEFAULT 0,
  memorization_warnings INTEGER DEFAULT 0,
  review_errors INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edu_matrix_daily_logs_upsert
  ON edu_matrix_daily_logs(student_id, date, context_type, context_id);

CREATE TABLE IF NOT EXISTS edu_matrix_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES edu_matrix_students(id),
  date TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('circle', 'track', 'competition')),
  context_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused')),
  recorded_by INTEGER REFERENCES users(id),
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, date, context_type, context_id)
);

CREATE TABLE IF NOT EXISTS edu_matrix_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES edu_matrix_students(id),
  from_circle_id INTEGER,
  to_circle_id INTEGER,
  from_track_id INTEGER,
  to_track_id INTEGER,
  transferred_by INTEGER NOT NULL REFERENCES users(id),
  transferred_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_edu_matrix_students_circle
  ON edu_matrix_students(current_circle_id);
CREATE INDEX IF NOT EXISTS idx_edu_matrix_students_track
  ON edu_matrix_students(current_track_id);
CREATE INDEX IF NOT EXISTS idx_edu_matrix_logs_student
  ON edu_matrix_daily_logs(student_id, date);
