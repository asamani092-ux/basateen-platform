-- خطط الفصل + رصد يومي (معلم)

CREATE TABLE IF NOT EXISTS semester_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  circle_id INTEGER,
  track_id INTEGER,
  stage_id INTEGER,
  title_ar TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  daily_target_json TEXT,
  created_by_user_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS teacher_daily_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  plan_id INTEGER,
  mark_date TEXT NOT NULL,
  score REAL,
  notes TEXT,
  logged_by_user_id INTEGER NOT NULL,
  attendance_auto INTEGER NOT NULL DEFAULT 1,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, mark_date, plan_id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (plan_id) REFERENCES semester_plans(id)
);
