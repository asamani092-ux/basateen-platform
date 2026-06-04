-- 035: role column on v25 flat users + nullable circle/track assignees
-- Idempotent where possible; safe to re-run role backfill.

PRAGMA foreign_keys = OFF;

-- Legacy role column (v25 flat matrix had flags only)
ALTER TABLE users ADD COLUMN role TEXT;

UPDATE users
SET role = CASE
  WHEN COALESCE(is_admin, 0) = 1 THEN 'super_admin'
  WHEN COALESCE(is_educational, 0) = 1 THEN 'edu_supervisor'
  WHEN COALESCE(is_programs, 0) = 1 THEN 'programs_supervisor'
  WHEN COALESCE(is_track_supervisor, 0) = 1 THEN 'track_supervisor'
  WHEN COALESCE(is_teacher, 0) = 1 THEN 'teacher'
  ELSE role
END
WHERE role IS NULL;

-- Rebuild circles so teacher_id may be NULL (orphan-safe deletes)
CREATE TABLE IF NOT EXISTS circles_m035 (
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

-- v2.5 baseline (023): circles.stage TEXT is present
INSERT INTO circles_m035 (
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
  c.id,
  c.complex_id,
  c.name_ar,
  c.teacher_id,
  c.stage,
  c.capacity,
  c.is_active,
  c.created_at
FROM circles c;

DROP TABLE IF EXISTS circles;
ALTER TABLE circles_m035 RENAME TO circles;

-- Restore legacy denormalized columns (011 / GM) if missing after rebuild
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

-- Rebuild tracks so supervisor_id may be NULL
CREATE TABLE IF NOT EXISTS tracks_m035 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  supervisor_id INTEGER REFERENCES users(id),
  default_capacity INTEGER NOT NULL DEFAULT 20,
  capacity INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

INSERT INTO tracks_m035 (
  id,
  complex_id,
  name_ar,
  supervisor_id,
  default_capacity,
  is_active,
  created_at
)
SELECT
  t.id,
  t.complex_id,
  t.name_ar,
  t.supervisor_id,
  t.default_capacity,
  t.is_active,
  t.created_at
FROM tracks t;

DROP TABLE IF EXISTS tracks;
ALTER TABLE tracks_m035 RENAME TO tracks;

PRAGMA foreign_keys = ON;
