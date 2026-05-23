-- المعلم: خطط فصلية لكل طالب + رصد يومي مفصّل

ALTER TABLE teacher_daily_marks ADD COLUMN metrics_json TEXT;

CREATE TABLE IF NOT EXISTS student_semester_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  student_id INTEGER NOT NULL,
  plan_kind TEXT NOT NULL DEFAULT 'combined'
    CHECK (plan_kind IN ('hifz_new', 'muraja', 'tilawa', 'combined')),
  daily_hifz_pages REAL NOT NULL DEFAULT 0,
  daily_muraja_pages REAL NOT NULL DEFAULT 0,
  daily_rabt_faces INTEGER NOT NULL DEFAULT 0,
  repeat_target INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  wizard_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_semester_plan_active
  ON student_semester_plans(student_id)
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_student_plans_student
  ON student_semester_plans(student_id);
