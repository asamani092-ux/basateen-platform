-- خطط المشرف التعليمي المخصصة لكل طالب (تراكمية — لا تستبدل سجل المعلم)

CREATE TABLE IF NOT EXISTS student_edu_plans (
  student_id INTEGER PRIMARY KEY,
  targets_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  updated_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);
