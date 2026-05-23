import type { Env } from "../types";
import { normalizeMobile } from "../lib/mobile";
import { randomToken, scoreQuizAttempt, type QuizQuestionRow } from "../lib/quiz-scoring";
import { writeProgAudit } from "../lib/prog-audit";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function loadQuiz(env: Env, quizId: number) {
  return env.DB.prepare(
    `SELECT id, complex_id, title_ar, access_code, status, total_points
     FROM quizzes WHERE id = ?`,
  )
    .bind(quizId)
    .first<{
      id: number;
      complex_id: number;
      title_ar: string;
      access_code: string | null;
      status: string;
      total_points: number;
    }>();
}

async function loadQuestions(env: Env, quizId: number) {
  const rows = await env.DB.prepare(
    `SELECT id, question_type, prompt_ar, points, correct_answer, options_json, sort_order
     FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC, id ASC`,
  )
    .bind(quizId)
    .all<QuizQuestionRow>();
  return rows.results ?? [];
}

async function resolveAttemptByToken(env: Env, quizId: number, token: string) {
  return env.DB.prepare(
    `SELECT a.id, a.student_id, a.submitted_at, a.score_percent, s.full_name_ar
     FROM quiz_attempts a
     JOIN students s ON s.id = a.student_id
     WHERE a.quiz_id = ? AND a.attempt_token = ?`,
  )
    .bind(quizId, token)
    .first<{
      id: number;
      student_id: number;
      submitted_at: string | null;
      score_percent: number | null;
      full_name_ar: string;
    }>();
}

function questionsForClient(questions: QuizQuestionRow[]) {
  return questions.map((q) => {
    let options: string[] = [];
    if (q.question_type === "true_false") {
      options = ["صح", "خطأ"];
    } else {
      try {
        options = JSON.parse(q.options_json ?? "[]") as string[];
      } catch {
        options = [];
      }
    }
    return {
      id: q.id,
      question_type: q.question_type,
      prompt_ar: q.prompt_ar,
      points: q.points,
      options,
    };
  });
}

export async function handleQuizPublicRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const publicMatch = url.pathname.match(/^\/api\/quiz\/(\d+)\/public$/);
  const gateMatch = url.pathname.match(/^\/api\/quiz\/(\d+)\/gate$/);
  const takeMatch = url.pathname.match(/^\/api\/quiz\/(\d+)\/take$/);
  const submitMatch = url.pathname.match(/^\/api\/quiz\/(\d+)\/submit$/);

  if (publicMatch && request.method === "GET") {
    const quizId = Number(publicMatch[1]);
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || quiz.status === "draft") {
      return json({ error: "not_found" }, 404);
    }
    return json({
      quiz_id: quiz.id,
      title_ar: quiz.title_ar,
      requires_access_code: Boolean(quiz.access_code?.trim()),
      status: quiz.status,
    });
  }

  if (gateMatch && request.method === "POST") {
    const quizId = Number(gateMatch[1]);
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || quiz.status === "draft") {
      return json({ error: "not_found" }, 404);
    }

    let body: { identifier?: string; access_code?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const identifier = body.identifier?.trim() ?? "";
    const code = body.access_code?.trim() ?? "";
    if (!identifier) return json({ error: "identifier_required" }, 400);

    if (quiz.access_code?.trim() && code !== quiz.access_code.trim()) {
      return json({ error: "invalid_access_code" }, 403);
    }

    const mobile = normalizeMobile(identifier);
    let student:
      | { id: number; full_name_ar: string }
      | null
      | undefined;

    if (mobile) {
      student = await env.DB.prepare(
        `SELECT id, full_name_ar FROM students
         WHERE complex_id = ? AND phone = ? AND is_active = 1 LIMIT 1`,
      )
        .bind(quiz.complex_id, mobile)
        .first();
    }

    if (!student) {
      const like = `%${identifier.replace(/\s+/g, "%")}%`;
      student = await env.DB.prepare(
        `SELECT id, full_name_ar FROM students
         WHERE complex_id = ? AND is_active = 1 AND full_name_ar LIKE ?
         ORDER BY length(full_name_ar) ASC LIMIT 1`,
      )
        .bind(quiz.complex_id, like)
        .first();
    }

    if (!student) return json({ error: "student_not_found" }, 404);

    const existing = await env.DB.prepare(
      `SELECT id, attempt_token, submitted_at, score_percent FROM quiz_attempts
       WHERE quiz_id = ? AND student_id = ?`,
    )
      .bind(quizId, student.id)
      .first<{
        id: number;
        attempt_token: string;
        submitted_at: string | null;
        score_percent: number | null;
      }>();

    if (existing?.submitted_at) {
      return json({
        error: "already_submitted",
        score_percent: existing.score_percent,
      }, 409);
    }

    let token = existing?.attempt_token;
    if (!token) {
      token = randomToken();
      await env.DB.prepare(
        `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_token)
         VALUES (?, ?, ?)
         ON CONFLICT(quiz_id, student_id) DO UPDATE SET attempt_token = excluded.attempt_token`,
      )
        .bind(quizId, student.id, token)
        .run();
    }

    return json({
      ok: true,
      session_token: token,
      student_id: student.id,
      full_name_ar: student.full_name_ar,
    });
  }

  if (takeMatch && request.method === "GET") {
    const quizId = Number(takeMatch[1]);
    const token = url.searchParams.get("token")?.trim();
    if (!token) return json({ error: "token_required" }, 400);

    const quiz = await loadQuiz(env, quizId);
    if (!quiz || quiz.status === "draft") {
      return json({ error: "not_found" }, 404);
    }

    const attempt = await resolveAttemptByToken(env, quizId, token);
    if (!attempt) return json({ error: "invalid_token" }, 403);

    if (attempt.submitted_at) {
      return json({
        already_submitted: true,
        score_percent: attempt.score_percent,
        full_name_ar: attempt.full_name_ar,
      });
    }

    const questions = await loadQuestions(env, quizId);
    return json({
      quiz: { id: quiz.id, title_ar: quiz.title_ar },
      student: { id: attempt.student_id, full_name_ar: attempt.full_name_ar },
      questions: questionsForClient(questions),
    });
  }

  if (submitMatch && request.method === "POST") {
    const quizId = Number(submitMatch[1]);
    let body: { token?: string; answers?: Record<string, string> };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const token = body.token?.trim();
    if (!token) return json({ error: "token_required" }, 400);

    const quiz = await loadQuiz(env, quizId);
    if (!quiz) return json({ error: "not_found" }, 404);

    const attempt = await resolveAttemptByToken(env, quizId, token);
    if (!attempt) return json({ error: "invalid_token" }, 403);
    if (attempt.submitted_at) {
      return json({ error: "already_submitted", score_percent: attempt.score_percent }, 409);
    }

    const questions = await loadQuestions(env, quizId);
    const answers = body.answers ?? {};
    const { scorePercent } = scoreQuizAttempt(questions, answers);

    await env.DB.prepare(
      `UPDATE quiz_attempts SET
         answers_json = ?,
         score_percent = ?,
         submitted_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(JSON.stringify(answers), scorePercent, attempt.id)
      .run();

    await writeProgAudit(env, quiz.complex_id, "quiz_attempt", attempt.id, "submit", null, {
      score_percent: scorePercent,
      student_id: attempt.student_id,
    });

    return json({ ok: true, score_percent: scorePercent });
  }

  return null;
}
