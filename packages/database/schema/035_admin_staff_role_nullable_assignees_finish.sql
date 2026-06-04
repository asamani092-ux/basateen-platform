-- Finish 035 after RENAME already succeeded (skip ALTER ADD — columns exist on circles).

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

-- Tracks: nullable supervisor_id (skip if tracks_m035 / RENAME already done)
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
