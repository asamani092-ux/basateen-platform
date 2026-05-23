export type QuizQuestionRow = {
  id: number;
  question_type: string;
  prompt_ar: string;
  points: number;
  correct_answer: string;
  options_json: string | null;
};

export function scoreQuizAttempt(
  questions: QuizQuestionRow[],
  answers: Record<string, string>,
): { scorePercent: number; earned: number; total: number } {
  let earned = 0;
  let total = 0;
  for (const q of questions) {
    total += Number(q.points) || 0;
    const key = String(q.id);
    const given = (answers[key] ?? answers[q.id] ?? "").trim().toLowerCase();
    const correct = String(q.correct_answer).trim().toLowerCase();
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
