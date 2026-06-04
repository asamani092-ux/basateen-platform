-- 036: One canonical `circles` table (nullable teacher_id) after 035 RENAME split.
-- Run ONLY as a single file batch — never statement-by-statement in D1 UI.
--
--   npm run db:remote:036 --prefix apps/api
--
-- With FK off, drops both `circles` and `circles_legacy_035`, then recreates `circles`.

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

-- Prefer live `circles` (post-035); fall back to legacy if needed
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
FROM circles;

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
