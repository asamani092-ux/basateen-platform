-- 039: Fix phantom FK refs to circles_legacy_035 + nullable tracks.supervisor_id
-- Run as ONE batch:
--   From repo root:  npm run db:remote:039
--   From apps/api:   npm run db:remote:039

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

-- Rebind teacher_assignments FK → circles (not circles_legacy_035)
DROP TABLE IF EXISTS teacher_assignments_fix_039;
CREATE TABLE teacher_assignments_fix_039 (
  user_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, circle_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);
INSERT INTO teacher_assignments_fix_039 (user_id, circle_id)
SELECT user_id, circle_id FROM teacher_assignments;
DROP TABLE IF EXISTS teacher_assignments;
ALTER TABLE teacher_assignments_fix_039 RENAME TO teacher_assignments;

-- Rebind track_circles FK → circles
DROP TABLE IF EXISTS track_circles_fix_039;
CREATE TABLE track_circles_fix_039 (
  track_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, circle_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);
INSERT INTO track_circles_fix_039 (track_id, circle_id)
SELECT track_id, circle_id FROM track_circles;
DROP TABLE IF EXISTS track_circles;
ALTER TABLE track_circles_fix_039 RENAME TO track_circles;

-- Rebind supervisor_scopes FK → circles
DROP TABLE IF EXISTS supervisor_scopes_fix_039;
CREATE TABLE supervisor_scopes_fix_039 (
  user_id INTEGER NOT NULL,
  circle_id INTEGER,
  track_id INTEGER,
  PRIMARY KEY (user_id, circle_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
INSERT INTO supervisor_scopes_fix_039 (user_id, circle_id, track_id)
SELECT user_id, circle_id, track_id FROM supervisor_scopes;
DROP TABLE IF EXISTS supervisor_scopes;
ALTER TABLE supervisor_scopes_fix_039 RENAME TO supervisor_scopes;

-- tracks.supervisor_id nullable (staff hard-delete must not UPDATE NULL on NOT NULL col)
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

PRAGMA foreign_keys = ON;
