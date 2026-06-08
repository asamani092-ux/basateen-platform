PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS students_fix_040;
CREATE TABLE students_fix_040 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  full_name_ar TEXT NOT NULL,
  national_id TEXT UNIQUE NOT NULL,
  phone TEXT,
  nationality TEXT,
  school_name TEXT,
  school_grade TEXT,
  stage_id INTEGER CHECK (stage_id BETWEEN 1 AND 4),
  age INTEGER,
  guardian_phone TEXT NOT NULL,
  guardian_national_id TEXT,
  guardian_work TEXT,
  health_notes TEXT,
  current_circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL,
  current_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'archived')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);
INSERT INTO students_fix_040 (
  id, complex_id, full_name_ar, national_id, phone, nationality, school_name,
  school_grade, stage_id, age, guardian_phone, guardian_national_id, guardian_work,
  health_notes, current_circle_id, current_track_id, account_status, is_active, created_at
)
SELECT
  id, complex_id, full_name_ar, national_id, phone, nationality, school_name,
  school_grade, stage_id, age, guardian_phone, guardian_national_id, guardian_work,
  health_notes, current_circle_id, current_track_id, account_status, is_active, created_at
FROM students;
DROP TABLE IF EXISTS students;
ALTER TABLE students_fix_040 RENAME TO students;
CREATE INDEX IF NOT EXISTS idx_students_placement
  ON students(current_circle_id, current_track_id, account_status);

PRAGMA foreign_keys = ON;
