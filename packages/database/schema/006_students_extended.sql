-- حقول إضافية للطلاب + فهرس الهوية (استيراد/تصدير Excel)

ALTER TABLE students ADD COLUMN nationality TEXT;
ALTER TABLE students ADD COLUMN school_name TEXT;
ALTER TABLE students ADD COLUMN school_grade TEXT;
ALTER TABLE students ADD COLUMN memorization_amount TEXT;
ALTER TABLE students ADD COLUMN guardian_phone TEXT;
ALTER TABLE students ADD COLUMN guardian_national_id TEXT;
ALTER TABLE students ADD COLUMN health_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_students_national_id ON students(national_id);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone);
