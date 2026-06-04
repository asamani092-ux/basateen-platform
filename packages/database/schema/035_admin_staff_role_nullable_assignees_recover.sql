-- Recovery: run ONLY if 035 failed after INSERT into circles_m035 (both circles + circles_m035 exist).
-- Completes the RENAME swap without re-copying data.

ALTER TABLE circles RENAME TO circles_legacy_035;
ALTER TABLE circles_m035 RENAME TO circles;

ALTER TABLE circles ADD COLUMN stage_id INTEGER NOT NULL DEFAULT 2;
ALTER TABLE circles ADD COLUMN default_capacity INTEGER;
ALTER TABLE circles ADD COLUMN track_id INTEGER;

UPDATE circles
SET stage_id = CASE stage
  WHEN 'tlaqeen' THEN 1
  WHEN 'primary' THEN 2
  WHEN 'middle' THEN 3
  WHEN 'secondary' THEN 4
  ELSE 2
END
WHERE stage_id IS NULL OR stage_id = 2;

UPDATE circles SET default_capacity = capacity WHERE default_capacity IS NULL;

DROP TABLE IF EXISTS circles_legacy_035;
