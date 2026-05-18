-- Education: tasks, daily logs, competition, yom al-himma

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('core', 'optional')),
  title_ar TEXT NOT NULL,
  weight_points INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  student_id INTEGER,
  circle_id INTEGER,
  assigned_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  score REAL,
  logged_by_user_id INTEGER NOT NULL,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  attendance_marked INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (logged_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS competition_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  title_ar TEXT NOT NULL,
  timeframe TEXT NOT NULL CHECK (timeframe IN ('weekly', 'monthly', 'semester')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS himma_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  session_date TEXT NOT NULL,
  required_tasks_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS himma_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  juz_count REAL NOT NULL DEFAULT 0,
  hizb_count REAL NOT NULL DEFAULT 0,
  penalties_json TEXT,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES himma_sessions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
