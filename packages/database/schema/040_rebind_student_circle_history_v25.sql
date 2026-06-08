PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS student_circle_history_fix_040;
CREATE TABLE student_circle_history_fix_040 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  old_circle_id INTEGER REFERENCES circles(id),
  new_circle_id INTEGER REFERENCES circles(id),
  old_track_id INTEGER REFERENCES tracks(id),
  new_track_id INTEGER REFERENCES tracks(id),
  moved_by_user_id INTEGER REFERENCES users(id),
  moved_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT
);
INSERT INTO student_circle_history_fix_040 (
  id, student_id, old_circle_id, new_circle_id, old_track_id, new_track_id,
  moved_by_user_id, moved_at, reason
)
SELECT
  id, student_id, old_circle_id, new_circle_id, old_track_id, new_track_id,
  moved_by_user_id, moved_at, reason
FROM student_circle_history;
DROP TABLE IF EXISTS student_circle_history;
ALTER TABLE student_circle_history_fix_040 RENAME TO student_circle_history;

PRAGMA foreign_keys = ON;
