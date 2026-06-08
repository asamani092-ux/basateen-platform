-- Transfer audit log + teacher notifications (acknowledgment)

CREATE TABLE IF NOT EXISTS edu_transfer_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  student_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  source TEXT NOT NULL CHECK (source IN ('teacher_request', 'manual', 'direct')),
  teacher_request_id INTEGER,
  old_circle_id INTEGER,
  new_circle_id INTEGER,
  old_track_id INTEGER,
  new_track_id INTEGER,
  old_circle_name TEXT,
  new_circle_name TEXT,
  new_track_name TEXT,
  reason TEXT,
  error_code TEXT,
  error_message TEXT,
  initiated_by_user_id INTEGER,
  resolved_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edu_transfer_events_complex_created
  ON edu_transfer_events(complex_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edu_transfer_events_student
  ON edu_transfer_events(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS edu_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  recipient_user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'transfer',
  title_ar TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  reference_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edu_notifications_recipient
  ON edu_notifications(recipient_user_id, is_read, created_at DESC);
