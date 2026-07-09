PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS teacher_assignments_fix_042;
CREATE TABLE teacher_assignments_fix_042 (
  user_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, circle_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
);
INSERT INTO teacher_assignments_fix_042 (user_id, circle_id)
SELECT user_id, circle_id FROM teacher_assignments;
DROP TABLE IF EXISTS teacher_assignments;
ALTER TABLE teacher_assignments_fix_042 RENAME TO teacher_assignments;

PRAGMA foreign_keys = ON;
