-- 036 RECOVER: use ONLY when `circles` is missing but `circles_legacy_035` still exists.
-- If you get "no such table: circles_legacy_035", skip this file — legacy is already gone.
-- Use instead: npm run db:remote:036:circles  OR  npm run db:remote:038
-- Run as ONE batch via wrangler (not D1 UI statement-by-statement):
--   From repo root:  npm run db:remote:036:recover
--   From apps/api:   npm run db:remote:036:recover   (no --prefix)

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS circles_fix_036;

CREATE TABLE circles_fix_036 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id),
  stage TEXT CHECK (
    stage IS NULL OR stage IN ('tlaqeen', 'primary', 'middle', 'secondary')
  ),
  stage_id INTEGER,
  capacity INTEGER NOT NULL DEFAULT 20,
  default_capacity INTEGER,
  track_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

INSERT INTO circles_fix_036 (
  id,
  complex_id,
  name_ar,
  teacher_id,
  stage,
  capacity,
  is_active,
  created_at
)
SELECT
  id,
  complex_id,
  name_ar,
  teacher_id,
  stage,
  capacity,
  is_active,
  created_at
FROM circles_legacy_035;

UPDATE circles_fix_036
SET stage_id = CASE stage
  WHEN 'tlaqeen' THEN 1
  WHEN 'primary' THEN 2
  WHEN 'middle' THEN 3
  WHEN 'secondary' THEN 4
  ELSE 2
END
WHERE stage_id IS NULL;

UPDATE circles_fix_036
SET default_capacity = capacity
WHERE default_capacity IS NULL;

DROP TABLE IF EXISTS circles;
DROP TABLE IF EXISTS circles_legacy_035;
DROP TABLE IF EXISTS circles_m035;
DROP TABLE IF EXISTS circles_canonical;
DROP TABLE IF EXISTS circles_active;

ALTER TABLE circles_fix_036 RENAME TO circles;

PRAGMA foreign_keys = ON;
