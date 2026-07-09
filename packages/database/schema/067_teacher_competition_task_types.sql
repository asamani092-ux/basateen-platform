-- 067: مهام منافسات الحلقة — type + input_type (مطابق 051)
-- يُطبَّق عبر migrate-067-remote.mjs مع فحص وجود الأعمدة (idempotent)

ALTER TABLE teacher_competition_tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'addition'
  CHECK (type IN ('addition', 'deduction'));
ALTER TABLE teacher_competition_tasks ADD COLUMN input_type TEXT NOT NULL DEFAULT 'boolean'
  CHECK (input_type IN ('boolean', 'numeric', 'counter'));

UPDATE teacher_competition_tasks SET input_type = 'boolean' WHERE type = 'addition';
UPDATE teacher_competition_tasks SET input_type = 'counter' WHERE type = 'deduction';
