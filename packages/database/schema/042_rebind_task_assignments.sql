PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS task_assignments_fix_042;
CREATE TABLE task_assignments_fix_042 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  student_id INTEGER,
  circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL,
  assigned_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
);
INSERT INTO task_assignments_fix_042 (
  id, task_id, student_id, circle_id, assigned_by_user_id, created_at
)
SELECT id, task_id, student_id, circle_id, assigned_by_user_id, created_at
FROM task_assignments;
DROP TABLE IF EXISTS task_assignments;
ALTER TABLE task_assignments_fix_042 RENAME TO task_assignments;

PRAGMA foreign_keys = ON;
