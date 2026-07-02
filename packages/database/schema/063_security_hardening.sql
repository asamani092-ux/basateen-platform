-- إجبار تغيير كلمة المرور الافتراضية للمنسوبين الجدد
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- منسوبون ما زالوا على Basateen123! — يُلزمون بتغييرها عند أول دخول
UPDATE users
SET must_change_password = 1
WHERE id != 1
  AND COALESCE(is_active, 1) = 1
  AND (
    COALESCE(is_teacher, 0) = 1
    OR COALESCE(is_track_supervisor, 0) = 1
    OR COALESCE(is_educational, 0) = 1
    OR COALESCE(is_programs, 0) = 1
    OR role IN ('teacher', 'track_supervisor', 'edu_supervisor', 'programs_supervisor', 'admin_supervisor')
  );
