import type { Env } from "../types";
import { randomToken } from "../lib/quiz-scoring";
import { demoSetupBlockedResponse } from "../lib/setup-guard";

export async function handleSeedProgExamples(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const blocked = demoSetupBlockedResponse(env);
  if (blocked) return blocked;

  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY ?? "basateen-setup-once";
  if (key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM quizzes WHERE title_ar LIKE '%معاينة برامج%' LIMIT 1`,
  ).first();

  if (existing) {
    return Response.json({
      ok: true,
      skipped: true,
      public_quiz_path: "/quiz/10",
      access_code: "Ramadan2026",
    });
  }

  const ins = await env.DB.prepare(
    `INSERT INTO quizzes (complex_id, title_ar, access_code, status, total_points, created_by_user_id)
     VALUES (1, 'اختبار معرفي — معاينة برامج', 'Ramadan2026', 'published', 3, 3)`,
  ).run();
  const quizId = ins.meta.last_row_id as number;

  await env.DB.prepare(
    `INSERT INTO quiz_questions (quiz_id, prompt_ar, points, correct_answer, question_type, options_json, sort_order)
     VALUES
     (?, 'كم عدد أركان الإسلام؟', 1, '5', 'mcq', '["3","4","5","6"]', 0),
     (?, 'القرآن الكريم هو كلام الله تعالى', 1, 'true', 'true_false', '["صح","خطأ"]', 1),
     (?, 'أكبر سورة في القرآن هي البقرة', 2, 'true', 'true_false', '["صح","خطأ"]', 2)`,
  )
    .bind(quizId, quizId, quizId)
    .run();

  await env.DB.prepare(
    `UPDATE quizzes SET total_points = 4 WHERE id = ?`,
  )
    .bind(quizId)
    .run();

  for (const sid of [1, 4, 5]) {
    const token = randomToken();
    await env.DB.prepare(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_token)
       VALUES (?, ?, ?)
       ON CONFLICT(quiz_id, student_id) DO UPDATE SET attempt_token = excluded.attempt_token`,
    )
      .bind(quizId, sid, token)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO program_activities (complex_id, title_ar, activity_type, starts_at, created_by_user_id)
     VALUES (1, 'رحلة ترفيهية — معاينة', 'trip', date('now'), 3)`,
  ).run();

  const actId = (await env.DB.prepare(
    `SELECT id FROM program_activities WHERE title_ar LIKE '%معاينة%' ORDER BY id DESC LIMIT 1`,
  ).first<{ id: number }>())?.id;

  if (actId) {
    await env.DB.prepare(
      `INSERT INTO program_participation (activity_id, student_id, status, recorded_by_user_id)
       VALUES (?, 1, 'attended', 3), (?, 4, 'attended', 3)`,
    )
      .bind(actId, actId)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO knowledge_vault_items (complex_id, title_ar, description_ar, external_url, file_kind, program_year, tags_json, uploaded_by_user_id)
     VALUES (1, 'حقيبة البرامج — معاينة', 'روابط خارجية', 'https://drive.google.com', 'drive', 2026, '["برامج","معاينة"]', 3)`,
  ).run();

  return Response.json({
    ok: true,
    quiz_id: quizId,
    public_path: `/quiz/${quizId}`,
    access_code: "Ramadan2026",
    demo_token_note: "Use GET /api/prog-supervisor/quizzes/:id/links after login as prog supervisor",
  });
}
