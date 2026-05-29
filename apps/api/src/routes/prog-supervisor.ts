import type { Env } from "../types";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";
import { PROG_ROLES } from "../lib/roles";
import {
  loadUserScope,
  parseStageScope,
  stageFilterBinds,
  stageFilterWhere,
  studentsInScopeBinds,
  studentsInScopeWhere,
  STAGE_LABELS,
} from "../lib/dept-scope";
import { randomToken } from "../lib/quiz-scoring";
import { writeProgAudit } from "../lib/prog-audit";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function scopeLabel(scope: Awaited<ReturnType<typeof loadUserScope>>): string {
  if (scope.type === "global") return "كل المجمع";
  return scope.stageIds.map((id) => STAGE_LABELS[id]).join("، ");
}

async function recomputeQuizPoints(env: Env, quizId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(points), 0) AS total FROM quiz_questions WHERE quiz_id = ?`,
  )
    .bind(quizId)
    .first<{ total: number }>();
  const total = Number(row?.total ?? 0);
  await env.DB.prepare(
    `UPDATE quizzes SET total_points = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(total, quizId)
    .run();
  return total;
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

  const scope = await loadUserScope(env, auth.userId);
  const method = request.method;

  if (method === "GET" && path === "/api/prog-supervisor/scope") {
    const row = await env.DB.prepare(
      `SELECT supervisor_scope FROM users WHERE id = ?`,
    )
      .bind(auth.userId)
      .first<{ supervisor_scope: string | null }>();
    return json({
      supervisor_scope: row?.supervisor_scope ?? "global",
      scope,
      scope_label: scopeLabel(scope),
    });
  }

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
    const stageWhere = stageFilterWhere(scope, "q.stage_id");
    const rows = await env.DB.prepare(
      `SELECT q.id, q.title_ar, q.status, q.access_code, q.total_points, q.created_at,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
              (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL) AS attempts_count
       FROM quizzes q
       WHERE q.complex_id = ? AND (${stageWhere} OR q.stage_id IS NULL)
       ORDER BY q.created_at DESC LIMIT 100`,
    )
      .bind(auth.complexId, ...stageFilterBinds(scope))
      .all();
    return json({ items: rows.results ?? [] });
  }

  if (method === "POST" && path === "/api/prog-supervisor/quizzes") {
    let body: { title_ar?: string; access_code?: string | null; stage_id?: number | null };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body.title_ar?.trim()) {
      return json({ error: "title_required" }, 400);
    }

    const ins = await env.DB.prepare(
      `INSERT INTO quizzes (complex_id, title_ar, access_code, status, stage_id, total_points, created_by_user_id)
       VALUES (?, ?, ?, 'draft', ?, 0, ?)`,
    )
      .bind(
        auth.complexId,
        body.title_ar.trim(),
        body.access_code?.trim() || null,
        body.stage_id ?? null,
        auth.userId,
      )
      .run();

    const id = ins.meta.last_row_id as number;
    await writeProgAudit(env, auth.complexId, "quiz", id, "create", auth.userId, body);
    return json({ ok: true, id });
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
      };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      await env.DB.prepare(
        `UPDATE quizzes SET
           title_ar = COALESCE(?, title_ar),
           access_code = ?,
           status = COALESCE(?, status),
           stage_id = COALESCE(?, stage_id),
           updated_at = datetime('now')
         WHERE id = ? AND complex_id = ?`,
      )
        .bind(
          body.title_ar?.trim() ?? null,
          body.access_code?.trim() ?? quiz.access_code,
          body.status ?? null,
          body.stage_id ?? null,
          quizId,
          auth.complexId,
        )
        .run();

      await writeProgAudit(env, auth.complexId, "quiz", quizId, "patch", auth.userId, body);
      return json({ ok: true });
    }
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

    let body: {
      questions?: Array<{
        id?: number;
        question_type?: string;
        prompt_ar?: string;
        points?: number;
        correct_answer?: string;
        options?: string[];
        sort_order?: number;
      }>;
    };
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    await env.DB.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(quizId).run();

    const list = body.questions ?? [];
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (!q.prompt_ar?.trim()) continue;
      const qType =
        q.question_type === "true_false" ? "true_false" : "mcq";
      let correct = (q.correct_answer ?? "").trim();
      if (qType === "true_false") {
        correct = correct === "خطأ" || correct === "false" ? "false" : "true";
      }
      const optionsJson =
        qType === "mcq" ? JSON.stringify(q.options ?? []) : JSON.stringify(["صح", "خطأ"]);

      await env.DB.prepare(
        `INSERT INTO quiz_questions (quiz_id, prompt_ar, points, correct_answer, question_type, options_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          quizId,
          q.prompt_ar.trim(),
          Number(q.points) || 1,
          correct,
          qType,
          optionsJson,
          q.sort_order ?? i,
        )
        .run();
    }

    const total = await recomputeQuizPoints(env, quizId);
    await writeProgAudit(env, auth.complexId, "quiz", quizId, "questions_save", auth.userId, {
      count: list.length,
    });
    return json({ ok: true, total_points: total });
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

    await env.DB.prepare(
      `UPDATE quizzes SET status = 'published', updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(quizId)
      .run();

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

    await writeProgAudit(env, auth.complexId, "quiz", quizId, "publish", auth.userId, {
      link_count: links.length,
    });

    return json({
      ok: true,
      public_path: `/quiz/${quizId}`,
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
}

async function handleAnalytics(
  env: Env,
  complexId: number,
  scope: Awaited<ReturnType<typeof loadUserScope>>,
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
