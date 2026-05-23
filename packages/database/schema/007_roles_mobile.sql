-- Wave-1: five RBAC roles + optional mobile on users
-- Safe on fresh DB; on existing DB migrates supervisor -> edu_supervisor

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name_ar TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'teacher',
      'edu_supervisor',
      'prog_supervisor',
      'general_supervisor',
      'general_manager'
    )
  ),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

INSERT INTO users_new (
  id, complex_id, email, mobile, password_hash, full_name_ar, role, is_active, created_at
)
SELECT
  id,
  complex_id,
  email,
  NULL,
  password_hash,
  full_name_ar,
  CASE role
    WHEN 'supervisor' THEN 'edu_supervisor'
    ELSE role
  END,
  is_active,
  created_at
FROM users
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users');

DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
