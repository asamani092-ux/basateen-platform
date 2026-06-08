-- One-time: restore staff hidden after failed delete (is_active = 0 only).
-- Run via: npm run db:remote:037:reactivate --prefix apps/api

UPDATE users
SET is_active = 1
WHERE COALESCE(is_active, 1) = 0
  AND (
    COALESCE(is_teacher, 0) = 1
    OR COALESCE(is_track_supervisor, 0) = 1
    OR COALESCE(is_educational, 0) = 1
    OR COALESCE(is_programs, 0) = 1
    OR COALESCE(is_admin, 0) = 1
    OR role IN (
      'teacher',
      'track_supervisor',
      'edu_supervisor',
      'programs_supervisor',
      'prog_supervisor',
      'admin_supervisor',
      'general_supervisor',
      'super_admin'
    )
  );
