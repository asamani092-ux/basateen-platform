-- General Supervisor: admissions queue, placement, disciplinary, staff excused

ALTER TABLE students ADD COLUMN stage_id INTEGER;
ALTER TABLE students ADD COLUMN admission_status TEXT;
ALTER TABLE students ADD COLUMN age INTEGER;
ALTER TABLE students ADD COLUMN guardian_work TEXT;
ALTER TABLE students ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS student_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  full_name_ar TEXT NOT NULL,
  phone TEXT NOT NULL,
  national_id TEXT NOT NULL,
  school_grade TEXT NOT NULL,
  stage_id INTEGER NOT NULL CHECK (stage_id BETWEEN 1 AND 4),
  age INTEGER,
  guardian_phone TEXT NOT NULL,
  guardian_national_id TEXT,
  guardian_work TEXT,
  health_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  student_id INTEGER,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  processed_by_user_id INTEGER,
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_applications_status
  ON student_applications(status, stage_id);

CREATE TABLE IF NOT EXISTS student_disciplinary_state (
  student_id INTEGER PRIMARY KEY,
  notice_count INTEGER NOT NULL DEFAULT 0,
  escalation_level TEXT NOT NULL DEFAULT 'none'
    CHECK (escalation_level IN ('none', 'notice_1', 'notice_2', 'summons')),
  pledge_archived INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS staff_attendance_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late', 'leave')),
  notes TEXT,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO staff_attendance_new (
  id, complex_id, user_id, attendance_date, status, notes, recorded_by_user_id, recorded_at
)
SELECT
  id,
  complex_id,
  user_id,
  attendance_date,
  CASE WHEN status = 'leave' THEN 'excused' ELSE status END,
  notes,
  recorded_by_user_id,
  recorded_at
FROM staff_attendance;

DROP TABLE IF EXISTS staff_attendance;
ALTER TABLE staff_attendance_new RENAME TO staff_attendance;

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_status, stage_id);
