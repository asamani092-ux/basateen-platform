-- فصل مصدر المنافسة: قسم التعليم vs حلقة المعلم (نفس جدول competitions)

ALTER TABLE competitions ADD COLUMN competition_source TEXT NOT NULL DEFAULT 'edu_dept'
  CHECK (competition_source IN ('edu_dept', 'teacher_circle'));

-- تعبئة من rules_json.ownership للصفوف الحالية
UPDATE competitions
SET competition_source = 'teacher_circle'
WHERE json_extract(rules_json, '$.ownership') = 'teacher_circle';

CREATE INDEX IF NOT EXISTS idx_competitions_complex_source
  ON competitions(complex_id, competition_source);
