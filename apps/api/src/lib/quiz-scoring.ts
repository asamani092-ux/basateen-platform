export type QuizQuestionRow = {
  id: number;
  question_type: string;
  prompt_ar: string;
  points: number;
  correct_answer: string;
  options_json: string | null;
};

export function normalizeQuizAnswer(value: unknown, questionType: string): string {
  const raw = String(value ?? "").trim();
  if (questionType === "true_false") {
    const lower = raw.toLowerCase();
    if (lower === "صح" || lower === "true" || lower === "1") return "true";
    if (lower === "خطأ" || lower === "false" || lower === "0") return "false";
  }
  return raw;
}

export function scoreQuizAttempt(
  questions: QuizQuestionRow[],
  answers: Record<string, string>,
): { scorePercent: number; earned: number; total: number } {
  let earned = 0;
  let total = 0;
  for (const q of questions) {
    total += Number(q.points) || 0;
    const key = String(q.id);
    const givenRaw = answers[key] ?? answers[q.id] ?? "";
    const given = normalizeQuizAnswer(givenRaw, q.question_type);
    const correct = normalizeQuizAnswer(q.correct_answer, q.question_type);
    if (given && given === correct) {
      earned += Number(q.points) || 0;
    }
  }
  const scorePercent = total > 0 ? Math.round((earned / total) * 1000) / 10 : 0;
  return { scorePercent, earned, total };
}

export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** D1-safe upsert without ON CONFLICT (unique index may be missing on older schemas). */
export async function upsertQuizAttemptToken(
  db: D1Database,
  quizId: number,
  studentId: number,
  token: string,
): Promise<void> {
  const existing = await db
    .prepare(`SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?`)
    .bind(quizId, studentId)
    .first();
  if (existing) {
    await db
      .prepare(
        `UPDATE quiz_attempts SET attempt_token = ? WHERE quiz_id = ? AND student_id = ?`,
      )
      .bind(token, quizId, studentId)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_token) VALUES (?, ?, ?)`,
    )
    .bind(quizId, studentId, token)
    .run();
}
