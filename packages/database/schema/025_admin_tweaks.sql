-- Hotfix 025: admin dept + track supervisor (idempotent on production D1)
-- Safe to re-run: duplicate column errors are ignored by d1-remote-migrate.sh

PRAGMA foreign_keys = OFF;

-- Track supervisor (legacy DBs without 023 flat rebuild)
ALTER TABLE tracks ADD COLUMN supervisor_id INTEGER REFERENCES users(id);

-- Flat-style placement columns on legacy students (optional denormalized cache)
ALTER TABLE students ADD COLUMN current_circle_id INTEGER REFERENCES circles(id);
ALTER TABLE students ADD COLUMN current_track_id INTEGER REFERENCES tracks(id);

-- Backfill placement from open history rows (legacy schema)
UPDATE students
SET current_circle_id = (
  SELECT h.circle_id
  FROM student_circle_history h
  WHERE h.student_id = students.id
    AND h.to_at IS NULL
    AND (h.frozen_at IS NULL OR h.frozen_at = '')
  ORDER BY h.id DESC
  LIMIT 1
)
WHERE current_circle_id IS NULL;

UPDATE students
SET current_track_id = (
  SELECT h.track_id
  FROM student_circle_history h
  WHERE h.student_id = students.id
    AND h.to_at IS NULL
    AND (h.frozen_at IS NULL OR h.frozen_at = '')
  ORDER BY h.id DESC
  LIMIT 1
)
WHERE current_track_id IS NULL;

-- Pledges stack (if 024 was not applied)
CREATE TABLE IF NOT EXISTS student_pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  student_id INTEGER NOT NULL,
  reason_ar TEXT NOT NULL,
  pledge_date TEXT NOT NULL,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_pledges_student_date
  ON student_pledges(student_id, pledge_date DESC);

CREATE TABLE IF NOT EXISTS student_disciplinary_summary (
  student_id INTEGER PRIMARY KEY,
  pledge_count INTEGER NOT NULL DEFAULT 0,
  alert_sent_at TEXT,
  account_action TEXT NOT NULL DEFAULT 'none'
    CHECK (account_action IN ('none', 'suspended', 'archived')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

PRAGMA foreign_keys = ON;
