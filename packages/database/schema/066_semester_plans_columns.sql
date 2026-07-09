-- 066: أعمدة خطط الفصل الناقصة بعد 023_rebuild_v25 (v25 table lacked lifecycle columns)
-- يُطبَّق عبر migrate-066-remote.mjs مع فحص وجود الأعمدة (idempotent)

ALTER TABLE student_semester_plans ADD COLUMN starts_at TEXT;
ALTER TABLE student_semester_plans ADD COLUMN ends_at TEXT;
ALTER TABLE student_semester_plans ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE student_semester_plans ADD COLUMN created_by_user_id INTEGER;

UPDATE student_semester_plans SET starts_at = date('now') WHERE starts_at IS NULL;
UPDATE student_semester_plans SET is_active = 1 WHERE is_active IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_semester_plan_active
  ON student_semester_plans(student_id)
  WHERE is_active = 1;
