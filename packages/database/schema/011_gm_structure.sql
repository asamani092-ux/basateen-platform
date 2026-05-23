-- GM structure: stages on circles, default_capacity, track_stages, supervisor_scope

ALTER TABLE circles ADD COLUMN stage_id INTEGER NOT NULL DEFAULT 2;
ALTER TABLE circles ADD COLUMN default_capacity INTEGER;

UPDATE circles SET default_capacity = capacity WHERE default_capacity IS NULL;

ALTER TABLE tracks ADD COLUMN default_capacity INTEGER NOT NULL DEFAULT 20;
ALTER TABLE tracks ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users ADD COLUMN supervisor_scope TEXT DEFAULT 'global';

CREATE TABLE IF NOT EXISTS track_stages (
  track_id INTEGER NOT NULL,
  stage_id INTEGER NOT NULL CHECK (stage_id BETWEEN 1 AND 4),
  PRIMARY KEY (track_id, stage_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

CREATE TABLE IF NOT EXISTS track_circles (
  track_id INTEGER NOT NULL,
  circle_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, circle_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (circle_id) REFERENCES circles(id)
);

INSERT OR IGNORE INTO track_stages (track_id, stage_id)
SELECT DISTINCT c.track_id, COALESCE(c.stage_id, 2)
FROM circles c
WHERE c.track_id IS NOT NULL;

INSERT OR IGNORE INTO track_circles (track_id, circle_id)
SELECT DISTINCT track_id, id FROM circles WHERE track_id IS NOT NULL;

UPDATE circles SET stage_id = 2 WHERE stage_id IS NULL;
