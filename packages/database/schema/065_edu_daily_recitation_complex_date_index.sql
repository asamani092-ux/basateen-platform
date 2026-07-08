-- 065: Composite index for edu_daily_recitation lookups by complex + date
CREATE INDEX IF NOT EXISTS idx_edu_daily_recitation_complex_date
  ON edu_daily_recitation(complex_id, recitation_date);
