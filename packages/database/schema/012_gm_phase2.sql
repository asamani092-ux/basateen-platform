-- GM Phase 2: إعدادات الفصل + حضور الموظفين

ALTER TABLE complex_settings ADD COLUMN semester_weeks INTEGER NOT NULL DEFAULT 16;
ALTER TABLE complex_settings ADD COLUMN school_days_json TEXT NOT NULL DEFAULT '["0","1","2","3","4"]';

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
  notes TEXT,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_teacher_marks_date ON teacher_daily_marks(mark_date);
