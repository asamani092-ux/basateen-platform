-- تحضير الطلاب (مشرف تعليمي — طوارئ) — منفصل عن رصد المعلم القرآني

CREATE TABLE IF NOT EXISTS student_daily_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
  source TEXT NOT NULL DEFAULT 'edu_supervisor'
    CHECK (source IN ('edu_supervisor', 'teacher_auto')),
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE (student_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS student_attendance_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'edu_supervisor',
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_daily_att_date
  ON student_daily_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_student_att_log_student
  ON student_attendance_log(student_id, attendance_date);
