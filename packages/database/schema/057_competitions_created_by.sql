-- Teacher unified competitions: ownership column missing from v25 (023) and 048.
-- Required before useUnifiedTeacherCompetitions() can use the platform competitions table.

ALTER TABLE competitions ADD COLUMN created_by_user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_competitions_created_by
  ON competitions(created_by_user_id);
