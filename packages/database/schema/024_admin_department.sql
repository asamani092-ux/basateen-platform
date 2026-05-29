-- Admin Department + Shared Magic Links (v2.6)
-- Requires baseline 023_rebuild_v25.sql

PRAGMA foreign_keys = OFF;

-- ---------------------------------------------------------------------------
-- [NEW] Shared magic links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  token TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  context_data TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deactivated_at TEXT,
  expires_at TEXT,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_shared_tokens_feature_active
  ON shared_access_tokens(complex_id, feature_name, is_active);

CREATE INDEX IF NOT EXISTS idx_shared_tokens_created
  ON shared_access_tokens(created_by_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- student_attendance → unified v2 (admin_supervisor + magic_link)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_attendance_v2 (
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
      'magic_link'
    )
  ),
  circle_id INTEGER,
  shared_token_id INTEGER,
  recorded_by_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE (student_id, attendance_date),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (shared_token_id) REFERENCES shared_access_tokens(id),
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
);

INSERT INTO student_attendance_v2 (
  id,
  complex_id,
  student_id,
  attendance_date,
  status,
  source,
  circle_id,
  shared_token_id,
  recorded_by_user_id,
  recorded_at,
  notes
)
SELECT
  id,
  complex_id,
  student_id,
  attendance_date,
  status,
  CASE source
    WHEN 'general_supervisor' THEN 'admin_supervisor'
    ELSE source
  END,
  NULL,
  NULL,
  recorded_by_user_id,
  recorded_at,
  notes
FROM student_attendance;

DROP TABLE IF EXISTS student_attendance;
ALTER TABLE student_attendance_v2 RENAME TO student_attendance;

CREATE INDEX IF NOT EXISTS idx_student_attendance_date_circle
  ON student_attendance(attendance_date, circle_id);

CREATE INDEX IF NOT EXISTS idx_student_attendance_date_status
  ON student_attendance(attendance_date, status);

-- ---------------------------------------------------------------------------
-- students.admission_status (direct admission — no applications table)
-- ---------------------------------------------------------------------------
-- SQLite: ADD COLUMN is idempotent only if column missing; safe on re-run via app guard.
-- Run once on deploy; duplicate column errors are ignored in wrangler apply scripts.

-- ---------------------------------------------------------------------------
-- complex_settings: pledges + WhatsApp template
-- ---------------------------------------------------------------------------
-- Applied via ALTER below (see migration runner note in README)

-- ---------------------------------------------------------------------------
-- [NEW] Student pledges (cumulative)
-- ---------------------------------------------------------------------------
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
