-- 039 CORE: drop phantom triggers + nullable tracks.supervisor_id
-- Always safe on v25 (no teacher_assignments required).
-- Full 039 runner: npm run db:remote:039 --prefix apps/api

PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS circles_after_update;
DROP TRIGGER IF EXISTS circles_after_delete;
DROP TRIGGER IF EXISTS circles_before_update;
DROP TRIGGER IF EXISTS circles_before_delete;
DROP TRIGGER IF EXISTS sync_circles_legacy;
DROP TRIGGER IF EXISTS sync_circles_legacy_035;
DROP TRIGGER IF EXISTS trg_circles_is_active;
DROP TRIGGER IF EXISTS trg_circles_soft_delete;
DROP TRIGGER IF EXISTS circles_legacy_sync;
DROP TRIGGER IF EXISTS circles_legacy_035_sync;

DROP TABLE IF EXISTS tracks_fix_039;
CREATE TABLE tracks_fix_039 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  supervisor_id INTEGER REFERENCES users(id),
  default_capacity INTEGER NOT NULL DEFAULT 20,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);
INSERT INTO tracks_fix_039 (
  id, complex_id, name_ar, supervisor_id, default_capacity, is_active, created_at
)
SELECT
  id,
  complex_id,
  name_ar,
  supervisor_id,
  COALESCE(default_capacity, 20),
  COALESCE(is_active, 1),
  COALESCE(created_at, datetime('now'))
FROM tracks;
DROP TABLE IF EXISTS tracks;
ALTER TABLE tracks_fix_039 RENAME TO tracks;

CREATE TABLE IF NOT EXISTS teacher_assignments (
  user_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, circle_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);

CREATE TABLE IF NOT EXISTS track_circles (
  track_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, circle_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);

CREATE TABLE IF NOT EXISTS supervisor_scopes (
  user_id INTEGER NOT NULL,
  circle_id INTEGER,
  track_id INTEGER,
  PRIMARY KEY (user_id, circle_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

PRAGMA foreign_keys = ON;
