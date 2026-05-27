import type { Env } from "../types";

export async function handleSeedEduMatrix(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY ?? "basateen-setup-once";
  if (key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  try {
    const teacher = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'teacher' AND is_active = 1 ORDER BY id LIMIT 1`,
    ).first<{ id: number }>();

    const eduSup = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'edu_supervisor' AND is_active = 1 ORDER BY id LIMIT 1`,
    ).first<{ id: number }>();

    if (!teacher || !eduSup) {
      return Response.json(
        { error: "seed_users_first", message: "شغّل seed-users أولاً" },
        { status: 409 },
      );
    }

    await env.DB.prepare(
      `UPDATE users SET is_teacher = 1 WHERE id = ?`,
    )
      .bind(teacher.id)
      .run();

    await env.DB.prepare(
      `UPDATE users SET is_educational = 1, is_track_supervisor = 1 WHERE id = ?`,
    )
      .bind(eduSup.id)
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO edu_matrix_circles (id, name, teacher_id, stage, is_active)
       VALUES (1, 'حلقة البساتين — تجريبي', ?, 'primary', 1)`,
    )
      .bind(teacher.id)
      .run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO edu_matrix_tracks (id, name, supervisor_id, is_active)
       VALUES (1, 'مسار التخصص — تجريبي', ?, 1)`,
    )
      .bind(eduSup.id)
      .run();

    const demoStudents = [
      ["أحمد العتيبي", "1011000001", "0501111001", "primary", "الثالث"],
      ["خالد القحطاني", "1011000002", "0501111002", "primary", "الرابع"],
      ["فهد الشمري", "1011000003", "0501111003", "middle", "الأول"],
      ["سلمان الحربي", "1011000004", "0501111004", "middle", "الثاني"],
      ["يوسف الدوسري", "1011000005", "0501111005", "secondary", "الثالث"],
    ];

    for (const [name, nid, guardian, stage, grade] of demoStudents) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO edu_matrix_students
           (name, national_id, guardian_phone, stage, academic_grade,
            current_circle_id, current_track_id, is_active)
         VALUES (?, ?, ?, ?, ?, 1, NULL, 1)`,
      )
        .bind(name, nid, guardian, stage, grade)
        .run();
    }

    await env.DB.prepare(
      `UPDATE edu_matrix_students SET current_track_id = 1 WHERE national_id = '1011000003'`,
    ).run();

    return Response.json({
      ok: true,
      circle_id: 1,
      track_id: 1,
      teacher_user_id: teacher.id,
      supervisor_user_id: eduSup.id,
      students_seeded: demoStudents.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "seed_failed", message, hint: "npm run db:local:022 أو db:remote:022" },
      { status: 503 },
    );
  }
}
