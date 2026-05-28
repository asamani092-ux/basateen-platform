import type { Env } from "../types";
import { hashPassword } from "../lib/password";

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
  const sovereignPassword = "Basateen-Sovereign-2026!";
  const password_hash = await hashPassword(sovereignPassword);
  const roleSchema = await hasColumn(env, "users", "role");

  await runIgnore(env.DB.prepare("DELETE FROM sessions"));
  await runIgnore(env.DB.prepare("DELETE FROM user_sections"));
  await runIgnore(env.DB.prepare("DELETE FROM teacher_assignments"));
  await runIgnore(env.DB.prepare("DELETE FROM supervisor_scopes"));
  await runIgnore(env.DB.prepare("DELETE FROM users"));

  if (roleSchema) {
    await env.DB.prepare(
      `INSERT INTO users (
        id, complex_id, email, mobile, password_hash, full_name_ar, role, supervisor_scope, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        1,
        1,
        "admin@basateen.win",
        "966500000000",
        password_hash,
        "المشرف العام السيادي للمجمع",
        "general_manager",
        "global",
        1,
      )
      .run();
    await runIgnore(
      env.DB.prepare("INSERT INTO user_sections (user_id, section) VALUES (1, 'admin')"),
    );
    await runIgnore(
      env.DB.prepare(
        "INSERT INTO user_sections (user_id, section) VALUES (1, 'education')",
      ),
    );
    await runIgnore(
      env.DB.prepare(
        "INSERT INTO user_sections (user_id, section) VALUES (1, 'programs')",
      ),
    );
  } else {
    await env.DB.prepare(
      `INSERT INTO users (
        id, complex_id, email, mobile, password_hash, full_name_ar,
        is_admin, is_educational, is_programs, is_teacher, is_track_supervisor,
        stage_scope, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        1,
        1,
        "admin@basateen.win",
        "966500000000",
        password_hash,
        "المشرف العام السيادي للمجمع",
        1,
        1,
        1,
        1,
        1,
        "global",
        1,
      )
      .run();
  }

  return Response.json({
    ok: true,
    created: ["966500000000 (admin@basateen.win)"],
    sovereign_user: {
      id: 1,
      email: "admin@basateen.win",
      mobile: "966500000000",
      mode: roleSchema ? "role_schema" : "flat_schema",
      sections: ["admin", "education", "programs", "teacher", "track_supervisor"],
    },
    default_password: sovereignPassword,
    message: "Sovereign single-user seed completed after full cleanup",
  });
}
