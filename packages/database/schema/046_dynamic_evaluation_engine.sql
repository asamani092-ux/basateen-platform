-- Dynamic evaluation engine: replace hardcoded task weights with JSON criteria

ALTER TABLE edu_settings ADD COLUMN evaluation_criteria_json TEXT;

ALTER TABLE edu_daily_recitation ADD COLUMN task_scores_json TEXT;
