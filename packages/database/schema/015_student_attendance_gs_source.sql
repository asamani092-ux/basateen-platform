-- السماح بمصدر تحضير المشرف العام (غياب المعلم — تحضير يومي فقط)

PRAGMA foreign_keys = OFF;

CREATE TABLE student_daily_attendance_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
  source TEXT NOT NULL DEFAULT 'general_supervisor'
    CHECK (source IN ('edu_supervisor', 'teacher_auto', 'general_supervisor')),
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE (student_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);

INSERT INTO student_daily_attendance_new
SELECT * FROM student_daily_attendance;

DROP TABLE student_daily_attendance;

ALTER TABLE student_daily_attendance_new RENAME TO student_daily_attendance;

CREATE INDEX IF NOT EXISTS idx_student_daily_att_date
  ON student_daily_attendance(attendance_date);

PRAGMA foreign_keys = ON;
