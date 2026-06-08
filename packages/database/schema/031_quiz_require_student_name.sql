-- Programs quiz: optional student name gate on public access

ALTER TABLE quizzes ADD COLUMN require_student_name INTEGER NOT NULL DEFAULT 0;
