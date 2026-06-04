-- 036b: One canonical `tracks` table (nullable supervisor_id). Single batch only.
-- Run after 036_circles_consolidate_single_table.sql if tracks swap was partial.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS tracks_fix_036;

CREATE TABLE tracks_fix_036 (
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

INSERT INTO tracks_fix_036 (
  id,
  complex_id,
  name_ar,
  supervisor_id,
  default_capacity,
  is_active,
  created_at
)
SELECT
  id,
  complex_id,
  name_ar,
  supervisor_id,
  default_capacity,
  is_active,
  created_at
FROM tracks;

INSERT OR IGNORE INTO tracks_fix_036 (
  id,
  complex_id,
  name_ar,
  supervisor_id,
  default_capacity,
  is_active,
  created_at
)
SELECT
  id,
  complex_id,
  name_ar,
  supervisor_id,
  default_capacity,
  is_active,
  created_at
FROM tracks_legacy_035;

DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS tracks_legacy_035;
DROP TABLE IF EXISTS tracks_m035;

ALTER TABLE tracks_fix_036 RENAME TO tracks;

PRAGMA foreign_keys = ON;
