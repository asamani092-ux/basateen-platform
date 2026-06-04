-- 035: role column on v25 flat users + nullable circle/track assignees
-- Uses RENAME swap (no DROP on circles/tracks) so FKs stay valid in D1 console.

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

-- Reset staging from a previous partial run (safe: nothing references circles_m035)
DROP TABLE IF EXISTS circles_m035;

CREATE TABLE circles_m035 (
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

-- Swap: SQLite updates FK references to the new "circles" name (no DROP)
DROP TABLE IF EXISTS circles_legacy_035;
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

-- Tracks: nullable supervisor_id (same RENAME pattern)
DROP TABLE IF EXISTS tracks_m035;

CREATE TABLE tracks_m035 (
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

DROP TABLE IF EXISTS tracks_legacy_035;
ALTER TABLE tracks RENAME TO tracks_legacy_035;
ALTER TABLE tracks_m035 RENAME TO tracks;

DROP TABLE IF EXISTS tracks_legacy_035;
