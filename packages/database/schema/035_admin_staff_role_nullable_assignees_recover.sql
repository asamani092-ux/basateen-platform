-- Recovery: both circles + circles_m035 exist (035 failed before RENAME).
-- circles_m035 already includes stage_id / default_capacity / track_id — no ALTER ADD.

ALTER TABLE circles RENAME TO circles_legacy_035;
ALTER TABLE circles_m035 RENAME TO circles;

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
