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

type UsersColumns = {
  hasRole: boolean;
  hasSupervisorScope: boolean;
  hasFlatFlags: boolean;
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

async function usersColumns(env: Env): Promise<UsersColumns> {
  const info = await env.DB.prepare("PRAGMA table_info(users)").all<{
    name: string;
  }>();
  const names = new Set((info.results ?? []).map((c) => c.name));
  return {
    hasRole: names.has("role"),
    hasSupervisorScope: names.has("supervisor_scope"),
    hasFlatFlags:
      names.has("is_admin") &&
      names.has("is_educational") &&
      names.has("is_programs") &&
      names.has("is_teacher") &&
      names.has("is_track_supervisor"),
  };
}

function flatFlagsForRole(role: UserRole): {
  isAdmin: number;
  isEducational: number;
  isPrograms: number;
  isTeacher: number;
  isTrackSupervisor: number;
  stageScope: string;
} {
  switch (role) {
    case "general_manager":
      return {
        isAdmin: 1,
        isEducational: 1,
        isPrograms: 1,
        isTeacher: 0,
        isTrackSupervisor: 0,
        stageScope: "global",
      };
    case "edu_supervisor":
      return {
        isAdmin: 0,
        isEducational: 1,
        isPrograms: 0,
        isTeacher: 0,
        isTrackSupervisor: 0,
        stageScope: "primary",
      };
    case "prog_supervisor":
      return {
        isAdmin: 0,
        isEducational: 0,
        isPrograms: 1,
        isTeacher: 0,
        isTrackSupervisor: 0,
        stageScope: "global",
      };
    case "general_supervisor":
      return {
        isAdmin: 1,
        isEducational: 1,
        isPrograms: 1,
        isTeacher: 0,
        isTrackSupervisor: 0,
        stageScope: "global",
      };
    case "teacher":
      return {
        isAdmin: 0,
        isEducational: 0,
        isPrograms: 0,
        isTeacher: 1,
        isTrackSupervisor: 0,
        stageScope: "global",
      };
  }
}

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

  try {
    const created: string[] = [];
    const cols = await usersColumns(env);
    const mode = cols.hasRole ? "legacy_role_schema" : "flat_v25_schema";

    for (const demo of DEMO_USERS) {
      const password_hash = await hashPassword(demo.password);

      if (cols.hasRole) {
        const supervisorScope =
          demo.role === "edu_supervisor"
            ? "2"
            : demo.role === "general_supervisor" || demo.role === "prog_supervisor"
              ? "global"
              : "global";
        const result = await env.DB.prepare(
          cols.hasSupervisorScope
            ? `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role, supervisor_scope)
               VALUES (1, ?, ?, ?, ?, ?, ?)`
            : `INSERT INTO users (complex_id, email, mobile, password_hash, full_name_ar, role)
               VALUES (1, ?, ?, ?, ?, ?)`,
        )
          .bind(
            demo.email,
            demo.mobile,
            password_hash,
            demo.full_name_ar,
            demo.role,
            ...(cols.hasSupervisorScope ? [supervisorScope] : []),
          )
          .run();

        const userId = result.meta.last_row_id as number;

        // Legacy compatibility: optional tables might be absent after v2.5 rebuild.
        await env.DB.prepare(
          "INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (?, ?)",
        )
          .bind(userId, demo.sections[0] ?? "education")
          .run()
          .catch(() => null);

        if (demo.circleIds?.length) {
          for (const circleId of demo.circleIds) {
            if (demo.role === "teacher") {
              await env.DB.prepare(
                "INSERT OR IGNORE INTO teacher_assignments (user_id, circle_id) VALUES (?, ?)",
              )
                .bind(userId, circleId)
                .run()
                .catch(() => null);
            }
            if (demo.role === "edu_supervisor" || demo.role === "general_supervisor") {
              await env.DB.prepare(
                "INSERT OR IGNORE INTO supervisor_scopes (user_id, circle_id, track_id) VALUES (?, ?, NULL)",
              )
                .bind(userId, circleId)
                .run()
                .catch(() => null);
            }
          }
        }
      } else if (cols.hasFlatFlags) {
        const f = flatFlagsForRole(demo.role);
        await env.DB.prepare(
          `INSERT INTO users (
             complex_id, email, mobile, password_hash, full_name_ar,
             is_admin, is_educational, is_programs, is_teacher, is_track_supervisor, stage_scope
           ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            demo.email,
            demo.mobile,
            password_hash,
            demo.full_name_ar,
            f.isAdmin,
            f.isEducational,
            f.isPrograms,
            f.isTeacher,
            f.isTrackSupervisor,
            f.stageScope,
          )
          .run();
      } else {
        return Response.json(
          {
            error: "database_error",
            message: "بنية users غير متوافقة مع seed-users (لا role ولا flat flags)",
          },
          { status: 503 },
        );
      }

      created.push(`${demo.mobile} (${demo.email})`);
    }

    return Response.json({
      ok: true,
      created,
      mode,
      default_password: "Basateen123!",
      message: "تم إنشاء 5 حسابات تجريبية (جوال + API)",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error: "database_error",
        message:
          "D1 غير جاهزة — نفّذ db:remote:upgrade ثم wrangler deploy --env production",
        details: message,
      },
      { status: 503 },
    );
  }
}
