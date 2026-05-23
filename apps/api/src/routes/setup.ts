import type { Env } from "../types";
import type { UserRole } from "../types";
import { hashPassword } from "../lib/password";

type DemoUser = {
  email: string;
  mobile: string;
  password: string;
  full_name_ar: string;
  role: UserRole;
  sections: readonly ("admin" | "education" | "programs")[];
  circleIds?: number[];
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "manager@basateen.local",
    mobile: "0500000001",
    password: "Basateen123!",
    full_name_ar: "عبدالله — مدير عام",
    role: "general_manager",
    sections: ["admin", "education", "programs"],
  },
  {
    email: "edu@basateen.local",
    mobile: "0500000002",
    password: "Basateen123!",
    full_name_ar: "مشرف تعليمي",
    role: "edu_supervisor",
    sections: ["admin", "education"],
    circleIds: [1, 2],
  },
  {
    email: "programs@basateen.local",
    mobile: "0500000003",
    password: "Basateen123!",
    full_name_ar: "مشرف البرامج",
    role: "prog_supervisor",
    sections: ["programs"],
  },
  {
    email: "general@basateen.local",
    mobile: "0500000004",
    password: "Basateen123!",
    full_name_ar: "مشرف عام",
    role: "general_supervisor",
    sections: ["admin", "education", "programs"],
    circleIds: [1, 2, 3],
  },
  {
    email: "teacher@basateen.local",
    mobile: "0500000005",
    password: "Basateen123!",
    full_name_ar: "معلم حلقة الصديق",
    role: "teacher",
    sections: ["education"],
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
    const supervisorScope =
      demo.role === "edu_supervisor"
        ? "2"
        : demo.role === "general_supervisor" || demo.role === "prog_supervisor"
          ? "global"
          : "global";
    const result = await env.DB.prepare(
      `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role, supervisor_scope)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        demo.email,
        demo.mobile,
        password_hash,
        demo.full_name_ar,
        demo.role,
        supervisorScope,
      )
      .run();

    const userId = result.meta.last_row_id as number;

    for (const section of demo.sections) {
      await env.DB.prepare(
        "INSERT INTO user_sections (user_id, section) VALUES (?, ?)",
      )
        .bind(userId, section)
        .run();
    }

    if (demo.circleIds?.length) {
      for (const circleId of demo.circleIds) {
        if (demo.role === "teacher") {
          await env.DB.prepare(
            "INSERT INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)",
          )
            .bind(userId, circleId)
            .run();
        }
        if (
          demo.role === "edu_supervisor" ||
          demo.role === "general_supervisor"
        ) {
          await env.DB.prepare(
            "INSERT INTO supervisor_scopes (user_id, circle_id, track_id) VALUES (?, ?, NULL)",
          )
            .bind(userId, circleId)
            .run();
        }
      }
    }

    created.push(`${demo.mobile} (${demo.email})`);
  }

  return Response.json({
    ok: true,
    created,
    default_password: "Basateen123!",
    message: "تم إنشاء 5 حسابات تجريبية (جوال + API)",
  });
}
