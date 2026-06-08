-- Programs & Display core (quizzes v2 responses, program archives, display media)

ALTER TABLE quizzes ADD COLUMN show_score_instantly INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quizzes ADD COLUMN custom_success_message TEXT;
ALTER TABLE quizzes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS quiz_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  answers_json TEXT NOT NULL DEFAULT '{}',
  total_score REAL NOT NULL DEFAULT 0,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_quiz ON quiz_responses(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_phone ON quiz_responses(quiz_id, student_phone);

CREATE TABLE IF NOT EXISTS program_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('link', 'file')),
  file_url_or_link TEXT NOT NULL,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE INDEX IF NOT EXISTS idx_program_archives_complex ON program_archives(complex_id, created_at);

CREATE TABLE IF NOT EXISTS display_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'gif', 'video')),
  media_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_display_media_active
  ON display_media(complex_id, is_active, display_order);
