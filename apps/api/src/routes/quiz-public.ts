import type { Env } from "../types";
import { normalizeMobile } from "../lib/mobile";
import { randomToken, scoreQuizAttempt, type QuizQuestionRow } from "../lib/quiz-scoring";
import { writeProgAudit } from "../lib/prog-audit";
import { hasTable } from "../lib/db-schema";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

type QuizRow = {
  id: number;
  complex_id: number;
  title_ar: string;
  access_code: string | null;
  status: string;
  total_points: number;
  show_score_instantly: number;
  custom_success_message: string | null;
  is_active: number;
};

async function loadQuiz(env: Env, quizId: number): Promise<QuizRow | null> {
  return env.DB.prepare(
    `SELECT id, complex_id, title_ar, access_code, status, total_points,
            COALESCE(show_score_instantly, 1) AS show_score_instantly,
            custom_success_message,
            COALESCE(is_active, 1) AS is_active
     FROM quizzes WHERE id = ?`,
  )
    .bind(quizId)
    .first<QuizRow>();
}

function quizIsOpen(quiz: QuizRow): boolean {
  if (quiz.status === "draft") return false;
  if (quiz.is_active === 0) return false;
  return quiz.status === "published" || quiz.is_active === 1;
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

async function resolveResponseByToken(env: Env, quizId: number, token: string) {
  if (!(await hasTable(env, "quiz_responses"))) return null;
  return env.DB.prepare(
    `SELECT id, student_name, student_phone, submitted_at, total_score, answers_json
     FROM quiz_responses WHERE quiz_id = ? AND session_token = ?`,
  )
    .bind(quizId, token)
    .first<{
      id: number;
      student_name: string;
      student_phone: string;
      submitted_at: string | null;
      total_score: number;
      answers_json: string;
    }>();
}

function questionsForClient(questions: QuizQuestionRow[]) {
  return questions.map((q) => {
    let options: string[] = [];
    if (q.question_type === "true_false") {
      options = ["صح", "خطأ"];
    } else if (q.question_type !== "text") {
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

function resultPayload(quiz: QuizRow, scorePercent: number, earned: number, total: number) {
  const showScore = quiz.show_score_instantly === 1;
  const defaultThanks = "شكراً لك على مشاركتك في الاختبار.";
  return {
    show_score: showScore,
    score_percent: showScore ? scorePercent : null,
    total_score: showScore ? earned : null,
    max_score: showScore ? total : null,
    message: showScore
      ? quiz.custom_success_message?.trim() ||
        `أحسنت! درجتك ${scorePercent}% (${earned} من ${total})`
      : quiz.custom_success_message?.trim() || defaultThanks,
  };
}

function parseQuizAction(pathname: string) {
  const m = pathname.match(/^\/api\/(?:public\/)?quiz\/(\d+)\/(public|gate|take|submit)$/);
  if (!m) return null;
  return {
    quizId: Number(m[1]),
    action: m[2] as "public" | "gate" | "take" | "submit",
    useResponses: pathname.startsWith("/api/public/"),
  };
}

export async function handleQuizPublicRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const parsed = parseQuizAction(url.pathname);
  if (!parsed) return null;

  const { quizId, action, useResponses } = parsed;

  if (action === "public" && request.method === "GET") {
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || !quizIsOpen(quiz)) {
      return json({ error: "not_found" }, 404);
    }
    return json({
      quiz_id: quiz.id,
      title_ar: quiz.title_ar,
      requires_access_code: Boolean(quiz.access_code?.trim()),
      status: quiz.status,
      show_score_instantly: quiz.show_score_instantly === 1,
    });
  }

  if (action === "gate" && request.method === "POST") {
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || !quizIsOpen(quiz)) {
      return json({ error: "not_found" }, 404);
    }

    let body: {
      identifier?: string;
      student_name?: string;
      student_phone?: string;
      access_code?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const code = body.access_code?.trim() ?? "";
    if (quiz.access_code?.trim() && code !== quiz.access_code.trim()) {
      return json({ error: "invalid_access_code" }, 403);
    }

    if (useResponses) {
      if (!(await hasTable(env, "quiz_responses"))) {
        return json({ error: "migration_required" }, 503);
      }
      const name = body.student_name?.trim() ?? "";
      const phoneRaw = body.student_phone?.trim() ?? "";
      if (!name || !phoneRaw) {
        return json({ error: "name_and_phone_required" }, 400);
      }
      const phone = normalizeMobile(phoneRaw) || phoneRaw;

      const existing = await env.DB.prepare(
        `SELECT session_token, submitted_at, total_score FROM quiz_responses
         WHERE quiz_id = ? AND student_phone = ?`,
      )
        .bind(quizId, phone)
        .first<{
          session_token: string;
          submitted_at: string | null;
          total_score: number;
        }>();

      if (existing?.submitted_at) {
        return json({ error: "already_submitted", total_score: existing.total_score }, 409);
      }

      let token = existing?.session_token;
      if (!token) {
        token = randomToken();
        await env.DB.prepare(
          `INSERT INTO quiz_responses (quiz_id, student_name, student_phone, session_token)
           VALUES (?, ?, ?, ?)`,
        )
          .bind(quizId, name, phone, token)
          .run();
      } else {
        await env.DB.prepare(
          `UPDATE quiz_responses SET student_name = ? WHERE quiz_id = ? AND session_token = ?`,
        )
          .bind(name, quizId, token)
          .run();
      }

      return json({
        ok: true,
        session_token: token,
        student_name: name,
      });
    }

    const identifier = body.identifier?.trim() ?? "";
    if (!identifier) return json({ error: "identifier_required" }, 400);

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
      return json(
        { error: "already_submitted", score_percent: existing.score_percent },
        409,
      );
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

  if (action === "take" && request.method === "GET") {
    const token = url.searchParams.get("token")?.trim();
    if (!token) return json({ error: "token_required" }, 400);

    const quiz = await loadQuiz(env, quizId);
    if (!quiz || !quizIsOpen(quiz)) {
      return json({ error: "not_found" }, 404);
    }

    if (useResponses) {
      const response = await resolveResponseByToken(env, quizId, token);
      if (!response) return json({ error: "invalid_token" }, 403);
      if (response.submitted_at) {
        return json({
          already_submitted: true,
          total_score: response.total_score,
          student_name: response.student_name,
          ...resultPayload(quiz, 0, response.total_score, quiz.total_points),
        });
      }
      const questions = await loadQuestions(env, quizId);
      let savedAnswers: Record<string, string> = {};
      try {
        savedAnswers = JSON.parse(response.answers_json || "{}") as Record<string, string>;
      } catch {
        savedAnswers = {};
      }
      return json({
        quiz: { id: quiz.id, title_ar: quiz.title_ar },
        student: { full_name_ar: response.student_name },
        questions: questionsForClient(questions),
        saved_answers: savedAnswers,
      });
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

  if (action === "submit" && request.method === "POST") {
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

    const questions = await loadQuestions(env, quizId);
    const answers = body.answers ?? {};
    const { scorePercent, earned, total } = scoreQuizAttempt(questions, answers);

    if (useResponses) {
      const response = await resolveResponseByToken(env, quizId, token);
      if (!response) return json({ error: "invalid_token" }, 403);
      if (response.submitted_at) {
        return json({ error: "already_submitted", total_score: response.total_score }, 409);
      }

      await env.DB.prepare(
        `UPDATE quiz_responses SET
           answers_json = ?,
           total_score = ?,
           submitted_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(JSON.stringify(answers), earned, response.id)
        .run();

      return json({
        ok: true,
        ...resultPayload(quiz, scorePercent, earned, total),
      });
    }

    const attempt = await resolveAttemptByToken(env, quizId, token);
    if (!attempt) return json({ error: "invalid_token" }, 403);
    if (attempt.submitted_at) {
      return json({ error: "already_submitted", score_percent: attempt.score_percent }, 409);
    }

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

    return json({
      ok: true,
      ...resultPayload(quiz, scorePercent, earned, total),
      score_percent: scorePercent,
    });
  }

  return null;
}
