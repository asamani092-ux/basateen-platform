import type { Env } from "../types";
import { normalizeMobile } from "../lib/mobile";
import { randomToken, scoreQuizAttempt, upsertQuizAttemptToken, type QuizQuestionRow } from "../lib/quiz-scoring";
import { writeProgAudit } from "../lib/prog-audit";
import { hasTable, tableHasColumn } from "../lib/db-schema";

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
  require_student_name: number;
};

async function loadQuiz(env: Env, quizId: number): Promise<QuizRow | null> {
  const base = await env.DB.prepare(
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

  if (!base) return null;

  let show_score_instantly = 1;
  let custom_success_message: string | null = null;
  let is_active = 1;
  let require_student_name = 0;

  if (await tableHasColumn(env, "quizzes", "show_score_instantly")) {
    const extra = await env.DB.prepare(
      `SELECT show_score_instantly, custom_success_message,
              COALESCE(is_active, 1) AS is_active
       FROM quizzes WHERE id = ?`,
    )
      .bind(quizId)
      .first<{
        show_score_instantly: number;
        custom_success_message: string | null;
        is_active: number;
      }>();
    if (extra) {
      show_score_instantly = Number(extra.show_score_instantly ?? 1);
      custom_success_message = extra.custom_success_message;
      is_active = Number(extra.is_active ?? 1);
    }
  }

  if (await tableHasColumn(env, "quizzes", "require_student_name")) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(require_student_name, 0) AS require_student_name FROM quizzes WHERE id = ?`,
    )
      .bind(quizId)
      .first<{ require_student_name: number }>();
    if (row) require_student_name = Number(row.require_student_name ?? 0);
  }

  return {
    ...base,
    show_score_instantly,
    custom_success_message,
    is_active,
    require_student_name,
  };
}

/** متاح للعامة: رمز مرور معرّف، نشط، ومنشور (ليس draft) */
function quizIsOpen(quiz: QuizRow): boolean {
  if (!quiz.access_code?.trim()) return false;
  if (quiz.is_active === 0) return false;
  if (quiz.status === "draft") return false;
  return true;
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

async function resolveResponseByToken(env: Env, quizId: number, token: string) {
  if (!(await hasTable(env, "quiz_responses"))) return null;
  return env.DB.prepare(
    `SELECT id, student_name, submitted_at, total_score, answers_json
     FROM quiz_responses WHERE quiz_id = ? AND session_token = ?`,
  )
    .bind(quizId, token)
    .first<{
      id: number;
      student_name: string;
      submitted_at: string | null;
      total_score: number;
      answers_json: string;
    }>();
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
    isPublicApi: pathname.startsWith("/api/public/"),
  };
}

async function gatePublicQuiz(
  env: Env,
  quiz: QuizRow,
  quizId: number,
  code: string,
  studentName?: string,
) {
  const expected = quiz.access_code?.trim() ?? "";
  if (!expected) {
    return json({ error: "quiz_not_configured" }, 503);
  }
  if (code !== expected) {
    return json({ error: "invalid_access_code", message: "رمز المرور غير صحيح" }, 403);
  }

  if (!(await hasTable(env, "quiz_responses"))) {
    return json({ error: "migration_required" }, 503);
  }

  const needsName = quiz.require_student_name === 1;
  const name = String(studentName ?? "").trim();
  if (needsName && !name) {
    return json(
      { error: "student_name_required", message: "اسم الطالب مطلوب" },
      400,
    );
  }

  const token = randomToken();
  const displayName = needsName ? name : "مشارك";
  await env.DB.prepare(
    `INSERT INTO quiz_responses (quiz_id, student_name, student_phone, session_token)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(quizId, displayName, token, token)
    .run();

  return json({ ok: true, session_token: token, student_name: displayName });
}

export async function handleQuizPublicRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const parsed = parseQuizAction(url.pathname);
  if (!parsed) return null;

  const { quizId, action, isPublicApi } = parsed;

  if (action === "public" && request.method === "GET") {
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || !quizIsOpen(quiz)) {
      return json({ error: "not_found", message: "الاختبار غير متاح" }, 404);
    }
    return json({
      quiz_id: quiz.id,
      title_ar: quiz.title_ar,
      requires_access_code: true,
      require_student_name: quiz.require_student_name === 1,
      status: quiz.status,
      show_score_instantly: quiz.show_score_instantly === 1,
    });
  }

  if (action === "gate" && request.method === "POST") {
    const quiz = await loadQuiz(env, quizId);
    if (!quiz || !quizIsOpen(quiz)) {
      return json({ error: "not_found", message: "الاختبار غير متاح" }, 404);
    }

    let body: { access_code?: string; identifier?: string; student_name?: string; student_phone?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const code = body.access_code?.trim() ?? "";

    if (isPublicApi) {
      if (!code) {
        return json({ error: "access_code_required", message: "رمز المرور مطلوب" }, 400);
      }
      return gatePublicQuiz(env, quiz, quizId, code, body.student_name);
    }

    // مسار قديم /api/quiz — يبقى للتوافق مع الطلاب المسجّلين
    if (quiz.access_code?.trim() && code !== quiz.access_code.trim()) {
      return json({ error: "invalid_access_code", message: "رمز المرور غير صحيح" }, 403);
    }

    const identifier = body.identifier?.trim() ?? "";
    if (!identifier) return json({ error: "identifier_required" }, 400);

    const mobile = normalizeMobile(identifier);
    let student = mobile
      ? await env.DB.prepare(
          `SELECT id, full_name_ar FROM students
           WHERE complex_id = ? AND phone = ? AND is_active = 1 LIMIT 1`,
        )
          .bind(quiz.complex_id, mobile)
          .first<{ id: number; full_name_ar: string }>()
      : null;

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
      await upsertQuizAttemptToken(env.DB, quizId, student.id, token);
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
      return json({ error: "not_found", message: "الاختبار غير متاح" }, 404);
    }

    if (isPublicApi) {
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
      if (questions.length === 0) {
        return json({ error: "no_questions", message: "لا توجد أسئلة في هذا الاختبار" }, 404);
      }
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

    if (isPublicApi) {
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
