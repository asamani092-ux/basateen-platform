-- Historical grading snapshots: freeze task weights/input types at save time.

ALTER TABLE edu_daily_recitation ADD COLUMN tasks_snapshot TEXT;

ALTER TABLE competition_logs ADD COLUMN tasks_snapshot TEXT;
