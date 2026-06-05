PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS student_circle_history_fix_042;
CREATE TABLE student_circle_history_fix_042 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL,
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  teacher_user_id INTEGER,
  from_at TEXT NOT NULL,
  to_at TEXT,
  frozen_at TEXT,
  note TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (teacher_user_id) REFERENCES users(id)
);
INSERT INTO student_circle_history_fix_042 (
  id, student_id, circle_id, track_id, teacher_user_id, from_at, to_at, frozen_at, note
)
SELECT
  id, student_id, circle_id, track_id, teacher_user_id, from_at, to_at, frozen_at, note
FROM student_circle_history;
DROP TABLE IF EXISTS student_circle_history;
ALTER TABLE student_circle_history_fix_042 RENAME TO student_circle_history;

PRAGMA foreign_keys = ON;
