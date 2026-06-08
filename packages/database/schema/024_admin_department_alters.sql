-- Idempotent ALTERs for 024 (run after 024_admin_department.sql)
-- Separate file because SQLite ALTER limitations on CHECK columns.

ALTER TABLE students ADD COLUMN admission_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE complex_settings ADD COLUMN max_pledges_per_student INTEGER NOT NULL DEFAULT 3;

ALTER TABLE complex_settings ADD COLUMN whatsapp_absence_template_ar TEXT NOT NULL DEFAULT
  'السلام عليكم، نود إبلاغكم بغياب الطالب {{student_name}} عن الحلقة اليوم {{date}}.';
