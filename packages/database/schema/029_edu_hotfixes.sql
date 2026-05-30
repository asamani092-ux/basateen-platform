-- Edu hotfixes: face count for daily recitation reports

ALTER TABLE edu_daily_recitation ADD COLUMN face_count INTEGER NOT NULL DEFAULT 0;
