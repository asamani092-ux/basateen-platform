-- مشرف البرامج: اختبارات معرفية، أنشطة، بنك معرفة — معزول عن الرصد القرآني

ALTER TABLE quizzes ADD COLUMN access_code TEXT;
ALTER TABLE quizzes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE quizzes ADD COLUMN stage_id INTEGER;
ALTER TABLE quizzes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

ALTER TABLE quiz_questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'mcq';
ALTER TABLE quiz_questions ADD COLUMN options_json TEXT;
ALTER TABLE quiz_questions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE quiz_attempts ADD COLUMN answers_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_student
  ON quiz_attempts (quiz_id, student_id);

CREATE TABLE IF NOT EXISTS program_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  title_ar TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'workshop'
    CHECK (activity_type IN ('trip', 'workshop', 'event', 'other')),
  starts_at TEXT,
  ends_at TEXT,
  stage_id INTEGER,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS program_participation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  circle_id INTEGER,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'attended', 'absent', 'cancelled')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  recorded_by_user_id INTEGER,
  FOREIGN KEY (activity_id) REFERENCES program_activities(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_program_participation_activity
  ON program_participation (activity_id, recorded_at);

CREATE TABLE IF NOT EXISTS knowledge_vault_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  external_url TEXT NOT NULL,
  file_kind TEXT NOT NULL DEFAULT 'link'
    CHECK (file_kind IN ('link', 'drive', 'youtube', 'pdf', 'image', 'other')),
  program_year INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  uploaded_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE INDEX IF NOT EXISTS idx_vault_complex_year
  ON knowledge_vault_items (complex_id, program_year);

CREATE TABLE IF NOT EXISTS prog_audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT,
  actor_user_id INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
