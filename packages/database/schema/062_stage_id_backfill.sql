-- O(S+G) one-time — إكمال stage_id للطلاب والحلقات من مصدر مشتق (بدون تخمين)
-- 1) حلقات بلا stage_id ← المرحلة الوسطى (2) كافتراضي آمن
UPDATE circles SET stage_id = 2 WHERE stage_id IS NULL;

-- 2) طلاب بلا stage_id ← من حلقتهم الحالية
UPDATE students
SET stage_id = (
  SELECT c.stage_id FROM circles c WHERE c.id = students.current_circle_id LIMIT 1
)
WHERE stage_id IS NULL
  AND current_circle_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM circles c
    WHERE c.id = students.current_circle_id AND c.stage_id IS NOT NULL
  );

-- 3) طلاب بلا stage_id ← من أول مرحلة مرتبطة بمسارهم
UPDATE students
SET stage_id = (
  SELECT ts.stage_id FROM track_stages ts
  WHERE ts.track_id = students.current_track_id
  ORDER BY ts.stage_id
  LIMIT 1
)
WHERE stage_id IS NULL
  AND current_track_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM track_stages ts WHERE ts.track_id = students.current_track_id
  );

-- 4) ما تعذّر اشتقاقه — قائمة مراجعة يدوية (لا تخمين)
CREATE TABLE IF NOT EXISTS stage_id_review_queue (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'circle', 'track')),
  entity_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  flagged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id)
);

INSERT OR IGNORE INTO stage_id_review_queue (entity_type, entity_id, reason)
SELECT 'student', id, 'missing stage_id after backfill'
FROM students WHERE stage_id IS NULL;

INSERT OR IGNORE INTO stage_id_review_queue (entity_type, entity_id, reason)
SELECT 'circle', id, 'missing stage_id after backfill'
FROM circles WHERE stage_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_stage_complex ON students(stage_id, complex_id)
WHERE stage_id IS NOT NULL;
