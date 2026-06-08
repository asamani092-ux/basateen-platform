PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS student_attendance_fix_042;
CREATE TABLE student_attendance_fix_042 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
  source TEXT NOT NULL DEFAULT 'teacher_auto' CHECK (
    source IN (
      'teacher_auto',
      'edu_supervisor',
      'admin_supervisor',
      'magic_link',
      'general_supervisor'
    )
  ),
  circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL,
  shared_token_id INTEGER,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE (student_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_token_id) REFERENCES shared_access_tokens(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);
INSERT INTO student_attendance_fix_042 (
  id, complex_id, student_id, attendance_date, status, source,
  circle_id, shared_token_id, recorded_by_user_id, recorded_at, notes
)
SELECT
  id, complex_id, student_id, attendance_date, status, source,
  circle_id, shared_token_id, recorded_by_user_id, recorded_at, notes
FROM student_attendance;
DROP TABLE IF EXISTS student_attendance;
ALTER TABLE student_attendance_fix_042 RENAME TO student_attendance;

CREATE INDEX IF NOT EXISTS idx_student_attendance_date_circle
  ON student_attendance(attendance_date, circle_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_date_status
  ON student_attendance(attendance_date, status);

PRAGMA foreign_keys = ON;
