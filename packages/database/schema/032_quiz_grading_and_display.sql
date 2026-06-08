-- Quiz manual text grading + display carousel timing

ALTER TABLE quiz_responses ADD COLUMN grading_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quiz_responses ADD COLUMN auto_score REAL;

-- Optional: may fail if column exists — safe on migrate script
ALTER TABLE complex_settings ADD COLUMN display_slide_seconds INTEGER NOT NULL DEFAULT 12;
