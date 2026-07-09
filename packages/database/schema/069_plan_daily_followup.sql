-- 069: متابعة يومية للخطة + أيام العطلة (rest_days)
-- O(1) DDL — الجداول/الأعمدة تُنشأ مع فحص وجود في migrate-069-remote.mjs

ALTER TABLE student_semester_plans ADD COLUMN rest_days TEXT NOT NULL DEFAULT 'friday_saturday'
  CHECK (rest_days IN ('friday', 'saturday', 'friday_saturday'));

CREATE TABLE IF NOT EXISTS student_plan_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  day_date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  recorded_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES student_semester_plans(id) ON DELETE CASCADE,
  UNIQUE(plan_id, day_date)
);

CREATE INDEX IF NOT EXISTS idx_student_plan_days_plan ON student_plan_days(plan_id);
