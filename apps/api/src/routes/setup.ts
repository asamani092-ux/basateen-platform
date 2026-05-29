import type { Env } from "../types";
import type { UserRole } from "../types";
import { hashPassword } from "../lib/password";

const SOVEREIGN_EMAIL = "admin@basateen.win";
const SOVEREIGN_MOBILE = "966500000000";
const SOVEREIGN_NAME = "المشرف العام السيادي";
const SOVEREIGN_PASSWORD = "Basateen-Sovereign-2026!";

async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  const rows = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return (rows.results ?? []).some((r) => r.name === column);
}

async function runIgnore(stmt: D1PreparedStatement): Promise<void> {
  try {
    await stmt.run();
  } catch {
    // emergency reset: ignore absent legacy tables
  }
}

export async function handleSeedUsers(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY ?? "basateen-setup-once";
  if (key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  const password_hash = await hashPassword(SOVEREIGN_PASSWORD);
  const roleSchema = await hasColumn(env, "users", "role");
  const flatSchema = await hasColumn(env, "users", "is_admin");

  await runIgnore(env.DB.prepare("DELETE FROM sessions"));
  await runIgnore(env.DB.prepare("DELETE FROM user_sections"));
  await runIgnore(env.DB.prepare("DELETE FROM teacher_assignments"));
  await runIgnore(env.DB.prepare("DELETE FROM supervisor_scopes"));
  await runIgnore(env.DB.prepare("DELETE FROM users"));

  await env.DB.prepare(
    `INSERT OR IGNORE INTO complexes (id, name_ar) VALUES (1, 'مجمع حلقات البساتين')`,
  ).run();

  if (roleSchema) {
    const hasSupervisorScope = await hasColumn(env, "users", "supervisor_scope");
    if (hasSupervisorScope) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO users (
          id, complex_id, email, mobile, password_hash, full_name_ar, role, supervisor_scope, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          1,
          1,
          SOVEREIGN_EMAIL,
          SOVEREIGN_MOBILE,
          password_hash,
          SOVEREIGN_NAME,
          "super_admin" satisfies UserRole,
          "global",
          1,
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO users (
          id, complex_id, email, mobile, password_hash, full_name_ar, role, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          1,
          1,
          SOVEREIGN_EMAIL,
          SOVEREIGN_MOBILE,
          password_hash,
          SOVEREIGN_NAME,
          "super_admin",
          1,
        )
        .run();
    }

    await runIgnore(
      env.DB.prepare("INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (1, 'admin')"),
    );
    await runIgnore(
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (1, 'education')",
      ),
    );
    await runIgnore(
      env.DB.prepare(
        "INSERT OR IGNORE INTO user_sections (user_id, section) VALUES (1, 'programs')",
      ),
    );
  } else if (flatSchema) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO users (
        id, complex_id, email, mobile, password_hash, full_name_ar,
        is_admin, is_educational, is_programs, is_teacher, is_track_supervisor,
        stage_scope, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        1,
        1,
        SOVEREIGN_EMAIL,
        SOVEREIGN_MOBILE,
        password_hash,
        SOVEREIGN_NAME,
        1,
        1,
        1,
        1,
        1,
        "global",
        1,
      )
      .run();
  } else {
    return Response.json(
      {
        error: "schema_unsupported",
        message: "جدول users لا يحتوي role ولا is_admin — نفّذ migrations أولاً",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    schema: roleSchema ? "role" : "flat",
    sovereign_user: {
      id: 1,
      email: SOVEREIGN_EMAIL,
      mobile: SOVEREIGN_MOBILE,
      full_name_ar: SOVEREIGN_NAME,
      role: "super_admin",
    },
    default_password: SOVEREIGN_PASSWORD,
    message:
      "تم حقن المشرف السيادي الوحيد وتصفير الجلسات — استخدم هذا الحساب لاختبار الاتصال",
  });
}
