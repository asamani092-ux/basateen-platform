-- فصل دراسي نشط (تشغيل/إيقاف) — بدون تواريخ مسبقة

ALTER TABLE complex_settings ADD COLUMN semester_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE complex_settings ADD COLUMN semester_start_date TEXT;
ALTER TABLE complex_settings ADD COLUMN semester_end_date TEXT;
