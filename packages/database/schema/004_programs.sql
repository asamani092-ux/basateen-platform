-- Programs & quizzes (separate from Quranic grading)

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  title_ar TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 100,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  prompt_ar TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  correct_answer TEXT NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attempt_token TEXT NOT NULL UNIQUE,
  score_percent REAL,
  submitted_at TEXT,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS program_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  program_type TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  year INTEGER,
  links_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);
