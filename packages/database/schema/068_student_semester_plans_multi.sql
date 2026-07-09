-- 068: خطط فصل متعددة نشطة لكل طالب + مدة بالأسابيع
-- يُفضَّل التطبيق عبر migrate-068-remote.mjs (فحص الفهارس وإعادة البناء عند UNIQUE student_id)

DROP INDEX IF EXISTS idx_student_semester_plan_active;

CREATE INDEX IF NOT EXISTS idx_student_semester_plans_student_active
  ON student_semester_plans(student_id, is_active);

ALTER TABLE student_semester_plans ADD COLUMN duration_weeks INTEGER;
