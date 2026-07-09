-- 053: Link competition_tasks to evaluation criterion ids (unified dynamic standard)

ALTER TABLE competition_tasks ADD COLUMN criterion_id TEXT;

CREATE INDEX IF NOT EXISTS idx_competition_tasks_criterion
  ON competition_tasks(criterion_id);
