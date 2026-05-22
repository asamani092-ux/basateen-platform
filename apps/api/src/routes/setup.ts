import type { Env } from "../types";
import { hashPassword } from "../lib/password";

const DEMO_USERS = [
  {
    email: "admin@basateen.local",
    password: "Basateen123!",
    full_name_ar: "عبدالله — مدير عام",
    role: "general_manager" as const,
    sections: ["admin", "education", "programs"] as const,
  },
  {
    email: "supervisor@basateen.local",
    password: "Basateen123!",
    full_name_ar: "مشرف الحلقات",
    role: "supervisor" as const,
    sections: ["admin", "education"] as const,
    circleIds: [1, 2],
  },
  {
    email: "teacher@basateen.local",
    password: "Basateen123!",
    full_name_ar: "معلم حلقة الصديق",
    role: "teacher" as const,
    sections: ["education"] as const,
    circleIds: [1],
  },
];

export async function handleSeedUsers(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY ?? "basateen-setup-once";
  if (key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users",
  ).first<{ c: number }>();

  if (Number(count?.c ?? 0) > 0) {
    return Response.json(
      { error: "users_already_exist", message: "المستخدمون موجودون مسبقاً" },
      { status: 409 },
    );
  }

  const created: string[] = [];

  for (const demo of DEMO_USERS) {
    const password_hash = await hashPassword(demo.password);
    const result = await env.DB.prepare(
      `INSERT INTO users (complex_id, email, password_hash, full_name_ar, role)
       VALUES (1, ?, ?, ?, ?)`,
    )
      .bind(demo.email, password_hash, demo.full_name_ar, demo.role)
      .run();

    const userId = result.meta.last_row_id as number;

    for (const section of demo.sections) {
      await env.DB.prepare(
        "INSERT INTO user_sections (user_id, section) VALUES (?, ?)",
      )
        .bind(userId, section)
        .run();
    }

    if ("circleIds" in demo && demo.circleIds) {
      for (const circleId of demo.circleIds) {
        if (demo.role === "teacher") {
          await env.DB.prepare(
            "INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)",
          )
            .bind(userId, circleId)
            .run();
        }
        if (demo.role === "supervisor") {
          await env.DB.prepare(
            "INSERT INTO supervisor_scopes (user_id, circle_id, track_id) VALUES (?, ?, NULL)",
          )
            .bind(userId, circleId)
            .run();
        }
      }
    }

    created.push(demo.email);
  }

  return Response.json({
    ok: true,
    created,
    default_password: "Basateen123!",
    message: "تم إنشاء حسابات تجريبية",
  });
}
