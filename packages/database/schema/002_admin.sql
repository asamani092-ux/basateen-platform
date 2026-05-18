-- Admin section: students, circles, cumulative transfers, violations

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  name_ar TEXT NOT NULL,
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS circles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  track_id INTEGER,
  name_ar TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 20,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  full_name_ar TEXT NOT NULL,
  national_id TEXT,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- Cumulative placement history (never overwrite — freeze old rows)
CREATE TABLE IF NOT EXISTS student_circle_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  track_id INTEGER,
  teacher_user_id INTEGER,
  from_at TEXT NOT NULL,
  to_at TEXT,
  frozen_at TEXT,
  note TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (teacher_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('notice', 'alert', 'summons')),
  description TEXT,
  final_action TEXT CHECK (final_action IN ('suspension', 'dismissal', 'archive', NULL)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supervisor_scopes (
  user_id INTEGER NOT NULL,
  circle_id INTEGER,
  track_id INTEGER,
  PRIMARY KEY (user_id, circle_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  user_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, circle_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);

-- TV / dashboard snapshot (existing)
CREATE TABLE IF NOT EXISTS daily_attendance_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  present_count INTEGER NOT NULL DEFAULT 0,
  absent_count INTEGER NOT NULL DEFAULT 0,
  active_circles INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name_ar);
CREATE INDEX IF NOT EXISTS idx_history_student ON student_circle_history(student_id);
