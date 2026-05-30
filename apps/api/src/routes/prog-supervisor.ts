import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { PROG_ROLES } from "../lib/roles";
import {
  safeLoadUserScope,
  readSupervisorScopeString,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  STAGE_LABELS,
  type ScopeMode,
} from "../lib/dept-scope";
import { randomToken } from "../lib/quiz-scoring";
import { writeProgAudit } from "../lib/prog-audit";
import { hasTable, tableHasColumn } from "../lib/db-schema";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function criticalQuizError(err: unknown, context: string): Response {
  console.error("[CRITICAL QUIZ ERROR]:", context, err);
  const e = err instanceof Error ? err : new Error(String(err));
  return json(
    {
      error: e.message || String(err),
      stack: e.stack ?? null,
      context,
    },
    500,
  );
}

function asSqliteBool(value: unknown, defaultOne = true): number {
  if (value === false || value === 0 || value === "0") return 0;
  if (value === true || value === 1 || value === "1") return 1;
  return defaultOne ? 1 : 0;
}

function scopeLabel(scope: ScopeMode): string {
  if (scope.type === "global") return "كل المجمع";
  return scope.stageIds.map((id) => STAGE_LABELS[id]).join("، ");
}

async function safeWriteProgAudit(
  env: Env,
  complexId: number,
  entityType: string,
  entityId: number,
  action: string,
  actorUserId: number | null,
  payload?: unknown,
): Promise<void> {
  try {
    if (!(await hasTable(env, "prog_audit_trail"))) return;
    await writeProgAudit(env, complexId, entityType, entityId, action, actorUserId, payload);
  } catch (err) {
    console.warn("[CRITICAL QUIZ ERROR] prog audit skipped:", err);
  }
}

function coerceOptionsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((o) => String(o).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((o) => String(o).trim()).filter(Boolean);
      }
    } catch {
      return [raw.trim()];
    }
  }
  return [];
}

async function recomputeQuizPoints(env: Env, quizId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(points), 0) AS total FROM quiz_questions WHERE quiz_id = ?`,
  )
    .bind(quizId)
    .first<{ total: number }>();
  const total = Number(row?.total ?? 0);
  const hasUpdated = await tableHasColumn(env, "quizzes", "updated_at");
  if (hasUpdated) {
    await env.DB.prepare(
      `UPDATE quizzes SET total_points = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(total, quizId)
      .run();
  } else {
    await env.DB.prepare(`UPDATE quizzes SET total_points = ? WHERE id = ?`)
      .bind(total, quizId)
      .run();
  }
  return total;
}

type QuizQuestionInput = {
  question_type?: string;
  prompt_ar?: string;
  points?: number;
  correct_answer?: string;
  options?: string[];
  sort_order?: number;
};

function normalizeQuestionInput(
  q: QuizQuestionInput,
  index: number,
): {
  prompt_ar: string;
  question_type: string;
  points: number;
  correct_answer: string;
  options_json: string;
  sort_order: number;
} | null {
  const prompt = String(q.prompt_ar ?? "").trim();
  if (!prompt) return null;
  const qType =
    q.question_type === "true_false"
      ? "true_false"
      : q.question_type === "text"
        ? "text"
        : "mcq";
  let correct = String(q.correct_answer ?? "").trim();
  if (qType === "true_false") {
    correct = correct === "خطأ" || correct === "false" ? "false" : "true";
  }
  const optionList = coerceOptionsArray(q.options);
  const optionsJson =
    qType === "mcq"
      ? JSON.stringify(optionList)
      : qType === "text"
        ? "[]"
        : JSON.stringify(["صح", "خطأ"]);
  return {
    prompt_ar: prompt,
    question_type: qType,
    points: Number(q.points) > 0 ? Number(q.points) : 1,
    correct_answer: correct,
    options_json: optionsJson,
    sort_order: Number.isFinite(q.sort_order) ? Number(q.sort_order) : index,
  };
}

async function insertOneQuizQuestion(
  env: Env,
  quizId: number,
  norm: {
    prompt_ar: string;
    question_type: string;
    points: number;
    correct_answer: string;
    options_json: string;
    sort_order: number;
  },
): Promise<void> {
  const hasType = await tableHasColumn(env, "quiz_questions", "question_type");
  const hasOptsJson = await tableHasColumn(env, "quiz_questions", "options_json");
  const hasOptsLegacy = await tableHasColumn(env, "quiz_questions", "options");
  const optsCol = hasOptsJson ? "options_json" : hasOptsLegacy ? "options" : null;
  const hasSort = await tableHasColumn(env, "quiz_questions", "sort_order");

  if (hasType && optsCol && hasSort) {
    await env.DB.prepare(
      `INSERT INTO quiz_questions (quiz_id, prompt_ar, points, correct_answer, question_type, ${optsCol}, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        quizId,
        norm.prompt_ar,
        norm.points,
        norm.correct_answer,
        norm.question_type,
        norm.options_json,
        norm.sort_order,
      )
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO quiz_questions (quiz_id, prompt_ar, points, correct_answer)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(quizId, norm.prompt_ar, norm.points, norm.correct_answer)
    .run();
}

async function replaceQuizQuestions(
  env: Env,
  quizId: number,
  questions: QuizQuestionInput[],
): Promise<number> {
  await env.DB.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(quizId).run();

  let inserted = 0;
  for (let i = 0; i < questions.length; i++) {
    const norm = normalizeQuestionInput(questions[i], i);
    if (!norm) continue;
    await insertOneQuizQuestion(env, quizId, norm);
    inserted += 1;
  }

  if (inserted === 0) {
    throw new Error("no_valid_questions_after_normalize");
  }

  return recomputeQuizPoints(env, quizId);
}

function quizListScopeSql(
  scope: ScopeMode,
  hasQuizStageId: boolean,
): { where: string; binds: number[] } {
  if (!hasQuizStageId) {
    return { where: "q.complex_id = ?", binds: [] };
  }
  const stageWhere = stageFilterWhere(scope, "q.stage_id");
  return {
    where: `q.complex_id = ? AND (${stageWhere} OR q.stage_id IS NULL)`,
    binds: stageFilterBinds(scope),
  };
}

async function markQuizPublished(env: Env, quizId: number): Promise<void> {
  const hasActive = await tableHasColumn(env, "quizzes", "is_active");
  const hasUpdated = await tableHasColumn(env, "quizzes", "updated_at");
  if (hasActive && hasUpdated) {
    await env.DB.prepare(
      `UPDATE quizzes SET status = 'published', is_active = 1, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(quizId)
      .run();
  } else if (hasActive) {
    await env.DB.prepare(
      `UPDATE quizzes SET status = 'published', is_active = 1 WHERE id = ?`,
    )
      .bind(quizId)
      .run();
  } else if (hasUpdated) {
    await env.DB.prepare(
      `UPDATE quizzes SET status = 'published', updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(quizId)
      .run();
  } else {
    await env.DB.prepare(`UPDATE quizzes SET status = 'published' WHERE id = ?`)
      .bind(quizId)
      .run();
  }
}

async function insertQuizHeader(
  env: Env,
  auth: { complexId: number; userId: number },
  body: {
    title_ar: string;
    access_code: string;
    stage_id?: number | null;
    show_score_instantly?: boolean;
    custom_success_message?: string | null;
  },
): Promise<number> {
  const showScore = asSqliteBool(body.show_score_instantly, true);
  const customMsg =
    body.custom_success_message === undefined || body.custom_success_message === null
      ? null
      : String(body.custom_success_message).trim() || null;

  const cols = ["complex_id", "title_ar", "total_points", "created_by_user_id"];
  const vals: (string | number | null)[] = [
    auth.complexId,
    body.title_ar,
    0,
    auth.userId,
  ];

  if (await tableHasColumn(env, "quizzes", "access_code")) {
    cols.push("access_code");
    vals.push(body.access_code);
  }
  if (await tableHasColumn(env, "quizzes", "status")) {
    cols.push("status");
    vals.push("published");
  }
  if (await tableHasColumn(env, "quizzes", "stage_id")) {
    cols.push("stage_id");
    vals.push(body.stage_id ?? null);
  }
  if (await tableHasColumn(env, "quizzes", "show_score_instantly")) {
    cols.push("show_score_instantly");
    vals.push(showScore);
  }
  if (await tableHasColumn(env, "quizzes", "custom_success_message")) {
    cols.push("custom_success_message");
    vals.push(customMsg);
  }
  if (await tableHasColumn(env, "quizzes", "is_active")) {
    cols.push("is_active");
    vals.push(1);
  }

  const placeholders = cols.map(() => "?").join(", ");
  const ins = await env.DB.prepare(
    `INSERT INTO quizzes (${cols.join(", ")}) VALUES (${placeholders})`,
  )
    .bind(...vals)
    .run();

  return Number(ins.meta.last_row_id);
}

export async function handleProgSupervisorRouter(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/prog-supervisor/")) return null;

  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, PROG_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  const method = request.method;

  if (method === "GET" && path === "/api/prog-supervisor/scope") {
    try {
      const scope = await safeLoadUserScope(env, auth.userId);
      const supervisor_scope = await readSupervisorScopeString(env, auth.userId);
      return json({
        supervisor_scope,
        scope,
        scope_label: scopeLabel(scope),
      });
    } catch (err) {
      return criticalQuizError(err, "GET /api/prog-supervisor/scope");
    }
  }

  let scope: ScopeMode = { type: "global" };
  try {
    scope = await safeLoadUserScope(env, auth.userId);
  } catch (err) {
    console.error("prog-supervisor scope preload:", err);
  }

  try {

  if (method === "GET" && path === "/api/prog-supervisor/target-options") {
    const students = await env.DB.prepare(
      `SELECT s.id, s.full_name_ar, s.stage_id, s.phone, c.name_ar AS circle_name
       FROM students s
       LEFT JOIN student_circle_history h
         ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
       LEFT JOIN circles c ON c.id = h.circle_id
       WHERE ${studentsInScopeWhere(scope)}
       ORDER BY s.full_name_ar LIMIT 300`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope))
      .all();

    const circles = await env.DB.prepare(
      `SELECT c.id, c.name_ar, c.stage_id FROM circles c
       WHERE c.complex_id = ? AND c.is_active = 1
         AND (${stageFilterWhere(scope, "c.stage_id")})
       ORDER BY c.name_ar`,
    )
      .bind(auth.complexId, ...stageFilterBinds(scope))
      .all();

    return json({
      students: students.results ?? [],
      circles: circles.results ?? [],
      scope,
    });
  }

  if (method === "GET" && path === "/api/prog-supervisor/dashboard") {
    return handleAnalytics(env, auth.complexId, scope, url);
  }

  if (method === "GET" && path === "/api/prog-supervisor/analytics") {
    return handleAnalytics(env, auth.complexId, scope, url);
  }

  if (method === "GET" && path === "/api/prog-supervisor/quizzes") {
    const hasQuizStage = await tableHasColumn(env, "quizzes", "stage_id");
    const { where: quizWhere, binds: quizScopeBinds } = quizListScopeSql(scope, hasQuizStage);
    const hasShow = await tableHasColumn(env, "quizzes", "show_score_instantly");
    const extraCols = hasShow
      ? `, COALESCE(q.show_score_instantly, 1) AS show_score_instantly,
         q.custom_success_message,
         COALESCE(q.is_active, 1) AS is_active`
      : "";
    const hasAttempts = await hasTable(env, "quiz_attempts");
    const attemptsSql = hasAttempts
      ? `(SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL)`
      : `0`;
    const hasQuestions = await hasTable(env, "quiz_questions");
    const questionsSql = hasQuestions
      ? `(SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id)`
      : `0`;

    const hasStatus = await tableHasColumn(env, "quizzes", "status");
    const hasAccess = await tableHasColumn(env, "quizzes", "access_code");
    const statusCol = hasStatus ? "q.status" : `'published' AS status`;
    const accessCol = hasAccess ? "q.access_code" : `NULL AS access_code`;

    const rows = await env.DB.prepare(
      `SELECT q.id, q.title_ar, ${statusCol}, ${accessCol}, q.total_points, q.created_at${extraCols},
              ${questionsSql} AS question_count,
              ${attemptsSql} AS attempts_count
       FROM quizzes q
       WHERE ${quizWhere}
       ORDER BY q.created_at DESC LIMIT 100`,
    )
      .bind(auth.complexId, ...quizScopeBinds)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (method === "POST" && path === "/api/prog-supervisor/quizzes") {
    let body: {
      title_ar?: string;
      access_code?: string | null;
      stage_id?: number | null;
      show_score_instantly?: boolean;
      custom_success_message?: string | null;
      questions?: QuizQuestionInput[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const title = String(body.title_ar ?? "").trim();
    const accessCode = String(body.access_code ?? "").trim();
    if (!title) return json({ error: "title_required" }, 400);
    if (!accessCode) return json({ error: "access_code_required" }, 400);

    const questionList = Array.isArray(body.questions) ? body.questions : [];
    const normalized = questionList
      .map((q, i) => normalizeQuestionInput(q, i))
      .filter((q): q is NonNullable<typeof q> => q != null);
    if (normalized.length === 0) {
      return json({ error: "questions_required" }, 400);
    }

    let quizId = 0;
    try {
      quizId = await insertQuizHeader(env, auth, {
        title_ar: title,
        access_code: accessCode,
        stage_id: body.stage_id ?? null,
        show_score_instantly: body.show_score_instantly,
        custom_success_message: body.custom_success_message,
      });

      const totalPoints = await replaceQuizQuestions(env, quizId, questionList);
      if (totalPoints <= 0) {
        await env.DB.prepare(`DELETE FROM quizzes WHERE id = ?`).bind(quizId).run();
        return json({ error: "questions_save_failed" }, 500);
      }

      await markQuizPublished(env, quizId);
      await safeWriteProgAudit(env, auth.complexId, "quiz", quizId, "create", auth.userId, {
        title_ar: title,
        question_count: normalized.length,
      });
      return json({ ok: true, id: quizId, total_points: totalPoints });
    } catch (err) {
      if (quizId > 0) {
        try {
          await env.DB.prepare(`DELETE FROM quizzes WHERE id = ?`).bind(quizId).run();
        } catch {
          /* best-effort rollback */
        }
      }
      return criticalQuizError(err, "POST /api/prog-supervisor/quizzes");
    }
  }

  const quizMatch = path.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)$/);
  if (quizMatch) {
    const quizId = Number(quizMatch[1]);
    const quiz = await env.DB.prepare(
      `SELECT * FROM quizzes WHERE id = ? AND complex_id = ?`,
    )
      .bind(quizId, auth.complexId)
      .first<Record<string, unknown>>();

    if (!quiz) return json({ error: "not_found" }, 404);

    if (method === "GET") {
      const questions = await env.DB.prepare(
        `SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC, id ASC`,
      )
        .bind(quizId)
        .all();

      const attempts = await env.DB.prepare(
        `SELECT a.student_id, a.score_percent, a.submitted_at, a.attempt_token, s.full_name_ar
         FROM quiz_attempts a
         JOIN students s ON s.id = a.student_id
         WHERE a.quiz_id = ?
         ORDER BY a.submitted_at DESC`,
      )
        .bind(quizId)
        .all();

      return json({
        quiz,
        questions: questions.results ?? [],
        attempts: attempts.results ?? [],
      });
    }

    if (method === "PATCH") {
      let body: {
        title_ar?: string;
        access_code?: string | null;
        status?: string;
        stage_id?: number | null;
        show_score_instantly?: boolean;
        custom_success_message?: string | null;
        is_active?: number;
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const showScore =
        body.show_score_instantly === undefined
          ? null
          : body.show_score_instantly
            ? 1
            : 0;

      await env.DB.prepare(
        `UPDATE quizzes SET
           title_ar = COALESCE(?, title_ar),
           access_code = ?,
           status = COALESCE(?, status),
           stage_id = COALESCE(?, stage_id),
           show_score_instantly = COALESCE(?, show_score_instantly),
           custom_success_message = COALESCE(?, custom_success_message),
           is_active = COALESCE(?, is_active),
           updated_at = datetime('now')
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          body.title_ar?.trim() ?? null,
          body.access_code !== undefined ? body.access_code?.trim() || null : quiz.access_code,
          body.status ?? null,
          body.stage_id ?? null,
          showScore,
          body.custom_success_message !== undefined
            ? body.custom_success_message?.trim() || null
            : null,
          body.is_active ?? null,
          quizId,
          auth.complexId,
        )
        .run();

      await safeWriteProgAudit(env, auth.complexId, "quiz", quizId, "patch", auth.userId, body);
      return json({ ok: true });
    }

    if (method === "DELETE") {
      await env.DB.prepare(`DELETE FROM quizzes WHERE id = ? AND complex_id = ?`)
        .bind(quizId, auth.complexId)
        .run();
      await safeWriteProgAudit(env, auth.complexId, "quiz", quizId, "delete", auth.userId, {});
      return json({ ok: true });
    }
  }

  const responsesMatch = path.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/responses$/);
  if (responsesMatch && method === "GET") {
    const quizId = Number(responsesMatch[1]);
    const quiz = await env.DB.prepare(
      `SELECT id FROM quizzes WHERE id = ? AND complex_id = ?`,
    )
      .bind(quizId, auth.complexId)
      .first();
    if (!quiz) return json({ error: "not_found" }, 404);

    const items: Array<Record<string, unknown>> = [];

    if (await hasTable(env, "quiz_responses")) {
      const respRows = await env.DB.prepare(
        `SELECT id, student_name, student_phone, total_score, submitted_at
         FROM quiz_responses
         WHERE quiz_id = ? AND submitted_at IS NOT NULL
         ORDER BY submitted_at DESC`,
      )
        .bind(quizId)
        .all();
      for (const r of respRows.results ?? []) {
        items.push({
          source: "public",
          student_name: r.student_name,
          student_phone: r.student_phone,
          total_score: r.total_score,
          score_percent: null,
          submitted_at: r.submitted_at,
        });
      }
    }

    const attemptRows = await env.DB.prepare(
      `SELECT s.full_name_ar, s.phone, a.score_percent, a.submitted_at
       FROM quiz_attempts a
       JOIN students s ON s.id = a.student_id
       WHERE a.quiz_id = ? AND a.submitted_at IS NOT NULL
       ORDER BY a.submitted_at DESC`,
    )
      .bind(quizId)
      .all();

    for (const r of attemptRows.results ?? []) {
      items.push({
        source: "student",
        student_name: r.full_name_ar,
        student_phone: r.phone,
        total_score: null,
        score_percent: r.score_percent,
        submitted_at: r.submitted_at,
      });
    }

    return json({ items });
  }

  const questionsMatch = path.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/questions$/);
  if (questionsMatch && method === "PUT") {
    const quizId = Number(questionsMatch[1]);
    const exists = await env.DB.prepare(
      `SELECT id FROM quizzes WHERE id = ? AND complex_id = ?`,
    )
      .bind(quizId, auth.complexId)
      .first();
    if (!exists) return json({ error: "not_found" }, 404);

    let body: { questions?: QuizQuestionInput[] };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    try {
      const list = body.questions ?? [];
      const total = await replaceQuizQuestions(env, quizId, list);
      if (total <= 0) {
        return json({ error: "questions_required" }, 400);
      }
      await markQuizPublished(env, quizId);
      await safeWriteProgAudit(env, auth.complexId, "quiz", quizId, "questions_save", auth.userId, {
        count: list.length,
      });
      return json({ ok: true, total_points: total });
    } catch (err) {
      return criticalQuizError(err, "PUT /api/prog-supervisor/quizzes/:id/questions");
    }
  }

  const publishMatch = path.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/publish$/);
  if (publishMatch && method === "POST") {
    const quizId = Number(publishMatch[1]);
    const quiz = await env.DB.prepare(
      `SELECT id, access_code FROM quizzes WHERE id = ? AND complex_id = ?`,
    )
      .bind(quizId, auth.complexId)
      .first<{ id: number; access_code: string | null }>();
    if (!quiz) return json({ error: "not_found" }, 404);

    const qCount = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id = ?`,
    )
      .bind(quizId)
      .first<{ c: number }>();
    if (Number(qCount?.c ?? 0) === 0) {
      return json({ error: "no_questions" }, 400);
    }

    await markQuizPublished(env, quizId);

    const students = await env.DB.prepare(
      `SELECT s.id FROM students s WHERE ${studentsInScopeWhere(scope)}`,
    )
      .bind(...studentsInScopeBinds(auth.complexId, scope))
      .all<{ id: number }>();

    const links: Array<{
      student_id: number;
      full_name_ar: string;
      token: string;
      path: string;
    }> = [];

    for (const st of students.results ?? []) {
      const existing = await env.DB.prepare(
        `SELECT attempt_token FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?`,
      )
        .bind(quizId, st.id)
        .first<{ attempt_token: string }>();

      const token = existing?.attempt_token ?? randomToken();
      await env.DB.prepare(
        `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_token)
         VALUES (?, ?, ?)
         ON CONFLICT(quiz_id, student_id) DO UPDATE SET attempt_token = excluded.attempt_token`,
      )
        .bind(quizId, st.id, token)
        .run();

      const row = await env.DB.prepare(
        `SELECT full_name_ar FROM students WHERE id = ?`,
      )
        .bind(st.id)
        .first<{ full_name_ar: string }>();

      links.push({
        student_id: st.id,
        full_name_ar: row?.full_name_ar ?? "",
        token,
        path: `/quiz/${quizId}?token=${token}`,
      });
    }

    await safeWriteProgAudit(env, auth.complexId, "quiz", quizId, "publish", auth.userId, {
      link_count: links.length,
    });

    return json({
      ok: true,
      public_path: `/public/quiz/${quizId}`,
      legacy_path: `/quiz/${quizId}`,
      access_code: quiz.access_code,
      student_links: links,
    });
  }

  const linksMatch = path.match(/^\/api\/prog-supervisor\/quizzes\/(\d+)\/links$/);
  if (linksMatch && method === "GET") {
    const quizId = Number(linksMatch[1]);
    const quiz = await env.DB.prepare(
      `SELECT title_ar, access_code FROM quizzes WHERE id = ? AND complex_id = ?`,
    )
      .bind(quizId, auth.complexId)
      .first<{ title_ar: string; access_code: string | null }>();
    if (!quiz) return json({ error: "not_found" }, 404);

    const rows = await env.DB.prepare(
      `SELECT a.attempt_token, a.submitted_at, s.id AS student_id, s.full_name_ar, s.phone, s.guardian_phone
       FROM quiz_attempts a
       JOIN students s ON s.id = a.student_id
       WHERE a.quiz_id = ?
       ORDER BY s.full_name_ar`,
    )
      .bind(quizId)
      .all();

    return json({
      title_ar: quiz.title_ar,
      public_path: `/quiz/${quizId}`,
      access_code: quiz.access_code,
      items: (rows.results ?? []).map((r: Record<string, unknown>) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        phone: r.phone,
        guardian_phone: r.guardian_phone,
        token: r.attempt_token,
        path: `/quiz/${quizId}?token=${r.attempt_token}`,
        submitted: Boolean(r.submitted_at),
      })),
    });
  }

  if (method === "GET" && path === "/api/prog-supervisor/activities") {
    const rows = await env.DB.prepare(
      `SELECT * FROM program_activities
       WHERE complex_id = ? AND is_active = 1
       ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(auth.complexId)
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (method === "POST" && path === "/api/prog-supervisor/activities") {
    let body: {
      title_ar?: string;
      activity_type?: string;
      starts_at?: string;
      ends_at?: string;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body.title_ar?.trim()) return json({ error: "title_required" }, 400);

    const ins = await env.DB.prepare(
      `INSERT INTO program_activities (complex_id, title_ar, activity_type, starts_at, ends_at, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        auth.complexId,
        body.title_ar.trim(),
        body.activity_type ?? "workshop",
        body.starts_at ?? null,
        body.ends_at ?? null,
        body.notes ?? null,
        auth.userId,
      )
      .run();

    return json({ ok: true, id: ins.meta.last_row_id });
  }

  if (method === "POST" && path === "/api/prog-supervisor/participation") {
    let body: {
      activity_id?: number;
      student_id?: number;
      circle_id?: number;
      status?: string;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body.activity_id || !body.student_id) {
      return json({ error: "activity_and_student_required" }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO program_participation (activity_id, student_id, circle_id, status, recorded_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        body.activity_id,
        body.student_id,
        body.circle_id ?? null,
        body.status ?? "attended",
        auth.userId,
      )
      .run();

    return json({ ok: true });
  }

  if (method === "GET" && path === "/api/prog-supervisor/program-archives") {
    if (!(await hasTable(env, "program_archives"))) {
      return json({ error: "migration_required", table: "program_archives" }, 503);
    }
    const q = url.searchParams.get("q")?.trim() ?? "";
    const typeFilter = url.searchParams.get("type")?.trim() ?? "";
    const tag = url.searchParams.get("tag")?.trim() ?? "";
    let sql = `SELECT * FROM program_archives WHERE complex_id = ?`;
    const binds: (string | number)[] = [auth.complexId];
    if (q) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)`;
      const like = `%${q}%`;
      binds.push(like, like, like);
    }
    if (typeFilter === "link" || typeFilter === "file") {
      sql += ` AND type = ?`;
      binds.push(typeFilter);
    }
    if (tag) {
      sql += ` AND tags LIKE ?`;
      binds.push(`%${tag}%`);
    }
    sql += ` ORDER BY created_at DESC LIMIT 300`;
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: rows.results ?? [] });
  }

  if (method === "POST" && path === "/api/prog-supervisor/program-archives") {
    if (!(await hasTable(env, "program_archives"))) {
      return json({ error: "migration_required", table: "program_archives" }, 503);
    }
    let body: {
      title?: string;
      type?: string;
      file_url_or_link?: string;
      description?: string;
      tags?: string[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const title = String(body.title ?? "").trim();
    const itemType = body.type === "file" ? "file" : "link";
    const urlValue = String(body.file_url_or_link ?? "").trim();
    if (!title || !urlValue) return json({ error: "title_and_url_required" }, 400);
    if (urlValue.length > 500_000) return json({ error: "payload_too_large" }, 400);

    const ins = await env.DB.prepare(
      `INSERT INTO program_archives (complex_id, title, type, file_url_or_link, description, tags, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        auth.complexId,
        title,
        itemType,
        urlValue,
        body.description?.trim() ?? null,
        JSON.stringify(body.tags ?? []),
        auth.userId,
      )
      .run();
    return json({ ok: true, id: ins.meta.last_row_id });
  }

  const archiveMatch = path.match(/^\/api\/prog-supervisor\/program-archives\/(\d+)$/);
  if (archiveMatch) {
    if (!(await hasTable(env, "program_archives"))) {
      return json({ error: "migration_required", table: "program_archives" }, 503);
    }
    const archiveId = Number(archiveMatch[1]);
    if (method === "DELETE") {
      await env.DB.prepare(`DELETE FROM program_archives WHERE id = ? AND complex_id = ?`)
        .bind(archiveId, auth.complexId)
        .run();
      return json({ ok: true });
    }
    if (method === "PATCH") {
      let body: {
        title?: string;
        type?: string;
        file_url_or_link?: string;
        description?: string;
        tags?: string[];
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const row = await env.DB.prepare(
        `SELECT title, type, file_url_or_link, description, tags FROM program_archives WHERE id = ? AND complex_id = ?`,
      )
        .bind(archiveId, auth.complexId)
        .first<{
          title: string;
          type: string;
          file_url_or_link: string;
          description: string | null;
          tags: string;
        }>();
      if (!row) return json({ error: "not_found" }, 404);
      const urlValue = body.file_url_or_link?.trim() ?? row.file_url_or_link;
      if (urlValue.length > 500_000) return json({ error: "payload_too_large" }, 400);
      await env.DB.prepare(
        `UPDATE program_archives SET
           title = ?,
           type = ?,
           file_url_or_link = ?,
           description = ?,
           tags = ?
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          body.title?.trim() ?? row.title,
          body.type === "file" ? "file" : body.type === "link" ? "link" : row.type,
          urlValue,
          body.description !== undefined ? body.description?.trim() ?? null : row.description,
          body.tags ? JSON.stringify(body.tags) : row.tags,
          archiveId,
          auth.complexId,
        )
        .run();
      return json({ ok: true });
    }
  }

  if (method === "GET" && path === "/api/prog-supervisor/vault") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    let sql = `SELECT * FROM knowledge_vault_items WHERE complex_id = ? AND is_active = 1`;
    const binds: (string | number)[] = [auth.complexId];
    if (q) {
      sql += ` AND (title_ar LIKE ? OR description_ar LIKE ? OR tags_json LIKE ?)`;
      const like = `%${q}%`;
      binds.push(like, like, like);
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({ items: rows.results ?? [], q: q || null });
  }

  if (method === "POST" && path === "/api/prog-supervisor/vault") {
    let body: {
      title_ar?: string;
      description_ar?: string;
      external_url?: string;
      file_kind?: string;
      program_year?: number;
      tags?: string[];
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body.title_ar?.trim() || !body.external_url?.trim()) {
      return json({ error: "title_and_url_required" }, 400);
    }

    const ins = await env.DB.prepare(
      `INSERT INTO knowledge_vault_items
       (complex_id, title_ar, description_ar, external_url, file_kind, program_year, tags_json, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        auth.complexId,
        body.title_ar.trim(),
        body.description_ar?.trim() ?? null,
        body.external_url.trim(),
        body.file_kind ?? "link",
        body.program_year ?? new Date().getFullYear(),
        JSON.stringify(body.tags ?? []),
        auth.userId,
      )
      .run();

    await writeProgAudit(env, auth.complexId, "vault", ins.meta.last_row_id as number, "create", auth.userId, body);
    return json({ ok: true, id: ins.meta.last_row_id });
  }

  const vaultPatch = path.match(/^\/api\/prog-supervisor\/vault\/(\d+)$/);
  if (vaultPatch && method === "PATCH") {
    const id = Number(vaultPatch[1]);
    let body: { is_active?: number };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (body.is_active === 0) {
      await env.DB.prepare(
        `UPDATE knowledge_vault_items SET is_active = 0 WHERE id = ? AND complex_id = ?`,
      )
        .bind(id, auth.complexId)
        .run();
    }
    return json({ ok: true });
  }

    return json({ error: "Not Found", path }, 404);
  } catch (err) {
    return criticalQuizError(err, `prog-supervisor ${method} ${path}`);
  }
}

async function handleAnalytics(
  env: Env,
  complexId: number,
  scope: ScopeMode,
  url: URL,
): Promise<Response> {
  const scopeStudentWhere = studentsInScopeWhere(scope);
  const scopeBinds = studentsInScopeBinds(complexId, scope);

  const pendingQuizzes = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM quizzes WHERE complex_id = ? AND status = 'published'`,
  )
    .bind(complexId)
    .first<{ c: number }>();

  const attempts = await env.DB.prepare(
    `SELECT AVG(a.score_percent) AS avg_score, COUNT(*) AS c
     FROM quiz_attempts a
     JOIN students s ON s.id = a.student_id
     WHERE a.submitted_at IS NOT NULL AND ${scopeStudentWhere}`,
  )
    .bind(...scopeBinds)
    .first<{ avg_score: number | null; c: number }>();

  const topStudents = await env.DB.prepare(
    `SELECT s.id, s.full_name_ar, AVG(a.score_percent) AS avg_score, COUNT(a.id) AS quiz_count
     FROM quiz_attempts a
     JOIN students s ON s.id = a.student_id
     WHERE a.submitted_at IS NOT NULL AND ${scopeStudentWhere}
     GROUP BY s.id
     ORDER BY avg_score DESC, quiz_count DESC
     LIMIT 10`,
  )
    .bind(...scopeBinds)
    .all();

  const topCircles = await env.DB.prepare(
    `SELECT c.id, c.name_ar,
            COUNT(DISTINCT pp.student_id) AS participants,
            COUNT(pp.id) AS participation_events
     FROM program_participation pp
     JOIN students s ON s.id = pp.student_id
     JOIN student_circle_history h ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     JOIN circles c ON c.id = h.circle_id
     WHERE ${scopeStudentWhere}
     GROUP BY c.id
     ORDER BY participants DESC
     LIMIT 10`,
  )
    .bind(...scopeBinds)
    .all();

  const circleQuizAvg = await env.DB.prepare(
    `SELECT c.id, c.name_ar, AVG(a.score_percent) AS avg_score, COUNT(a.id) AS attempts
     FROM quiz_attempts a
     JOIN students s ON s.id = a.student_id
     JOIN student_circle_history h ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
     JOIN circles c ON c.id = h.circle_id
     WHERE a.submitted_at IS NOT NULL AND ${scopeStudentWhere}
     GROUP BY c.id
     ORDER BY avg_score DESC
     LIMIT 10`,
  )
    .bind(...scopeBinds)
    .all();

  return json({
    scope_label: scopeLabel(scope),
    kpis: {
      published_quizzes: Number(pendingQuizzes?.c ?? 0),
      quiz_attempts_submitted: Number(attempts?.c ?? 0),
      average_quiz_score: Math.round(Number(attempts?.avg_score ?? 0) * 10) / 10,
    },
    top_students: topStudents.results ?? [],
    top_circles_participation: topCircles.results ?? [],
    circle_quiz_averages: circleQuizAvg.results ?? [],
  });
}
