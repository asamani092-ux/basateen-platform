PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS supervisor_scopes_fix_039;
CREATE TABLE supervisor_scopes_fix_039 (
  user_id INTEGER NOT NULL,
  circle_id INTEGER,
  track_id INTEGER,
  PRIMARY KEY (user_id, circle_id, track_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
INSERT INTO supervisor_scopes_fix_039 (user_id, circle_id, track_id)
SELECT user_id, circle_id, track_id FROM supervisor_scopes;
DROP TABLE IF EXISTS supervisor_scopes;
ALTER TABLE supervisor_scopes_fix_039 RENAME TO supervisor_scopes;

PRAGMA foreign_keys = ON;
