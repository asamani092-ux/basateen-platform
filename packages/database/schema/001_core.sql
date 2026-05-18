-- Basateen: core tables (complex, users, sessions)
-- Safe to re-run: IF NOT EXISTS

CREATE TABLE IF NOT EXISTS complexes (
  id INTEGER PRIMARY KEY,
  name_ar TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('general_manager', 'supervisor', 'teacher')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS user_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('admin', 'education', 'programs')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO complexes (id, name_ar) VALUES (1, 'مجمع حلقات البساتين');
