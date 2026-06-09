-- Three-state competition attendance (present / excused / absent)

ALTER TABLE competition_attendance ADD COLUMN status TEXT NOT NULL DEFAULT 'present'
  CHECK (status IN ('present', 'excused', 'absent'));

-- Backfill from legacy present flag
UPDATE competition_attendance SET status = CASE WHEN present = 1 THEN 'present' ELSE 'absent' END
WHERE status IS NULL OR status = '';
