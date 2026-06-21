-- إصلاح إسنادات قديمة: منسوب غير معلم ما زال ظاهراً كمعلم حلقة
DELETE FROM teacher_assignments
WHERE user_id IN (
  SELECT u.id FROM users u
  WHERE COALESCE(u.role, '') != 'teacher'
    AND COALESCE(u.is_teacher, 0) = 0
);

UPDATE circles
SET teacher_id = NULL
WHERE teacher_id IN (
  SELECT u.id FROM users u
  WHERE COALESCE(u.role, '') != 'teacher'
    AND COALESCE(u.is_teacher, 0) = 0
);

UPDATE tracks
SET supervisor_id = NULL
WHERE supervisor_id IN (
  SELECT u.id FROM users u
  WHERE COALESCE(u.role, '') NOT IN ('track_supervisor', 'teacher')
    AND COALESCE(u.is_track_supervisor, 0) = 0
);
