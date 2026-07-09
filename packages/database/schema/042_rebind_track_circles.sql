PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS track_circles_fix_042;
CREATE TABLE track_circles_fix_042 (
  track_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, circle_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
);
INSERT INTO track_circles_fix_042 (track_id, circle_id)
SELECT track_id, circle_id FROM track_circles;
DROP TABLE IF EXISTS track_circles;
ALTER TABLE track_circles_fix_042 RENAME TO track_circles;

PRAGMA foreign_keys = ON;
