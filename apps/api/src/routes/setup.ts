import type { Env } from "../types";
import type { UserRole } from "../types";
import { hashPassword } from "../lib/password";
import { hardPurgeStaffUser } from "../lib/admin-staff";
import { r2Available, uploadDataUrlToR2 } from "../lib/display-media-r2";

const SOVEREIGN_EMAIL = "admin@basateen.win";
const SOVEREIGN_MOBILE = "966500000000";
const SOVEREIGN_NAME = "المشرف العام";
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
  const setupKey = env.SETUP_KEY;
  if (!setupKey || key !== setupKey) {
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
    `INSERT OR IGNORE INTO complexes (id, name_ar) VALUES (1, 'مجمع حلقات بساتين')`,
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
      "تم حقن المشرف العام وتصفير الجلسات — استخدم هذا الحساب لاختبار الاتصال",
  });
}

/** ترحيل صف واحد من data: إلى R2 عبر ربط Worker — لسكربت 073 فقط */
export async function handleMigrateDisplayMediaRow(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY;
  if (!setupKey || key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }
  if (!r2Available(env)) {
    return Response.json({ error: "r2_not_configured" }, { status: 503 });
  }

  let body: { dataUrl?: string; complexId?: number; id?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const dataUrl = String(body.dataUrl ?? "");
  const complexId = Number(body.complexId ?? 1);
  const id = Number(body.id ?? 0);
  if (!dataUrl || !id) {
    return Response.json({ error: "dataUrl_and_id_required" }, { status: 400 });
  }

  const uploaded = await uploadDataUrlToR2(env, request, complexId, dataUrl);
  if (!uploaded) {
    return Response.json({ error: "invalid_data_url" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    id,
    url: uploaded.url,
    key: uploaded.r2_key,
    media_type: uploaded.media_type,
  });
}

/** حذف فعلي لمنسوب تجريبي — يفرّغ FK ثم يحذف الصف (SETUP_KEY) */
export async function handlePurgeUser(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const key = url.searchParams.get("key");
  const setupKey = env.SETUP_KEY;
  if (!setupKey || key !== setupKey) {
    return Response.json({ error: "invalid_setup_key" }, { status: 401 });
  }

  const userId = Number(url.searchParams.get("id") ?? 0);
  const complexId = Number(url.searchParams.get("complex_id") ?? 1);
  if (!Number.isFinite(userId) || userId <= 1) {
    return Response.json(
      {
        error: "invalid_user_id",
        message: "حدّد id منسوب (>1) — لا يمكن حذف المشرف العام",
      },
      { status: 400 },
    );
  }

  try {
    await hardPurgeStaffUser(env, userId, complexId);
    return Response.json({ ok: true, purged_user_id: userId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "staff_not_found") {
      return Response.json({ error: "staff_not_found" }, { status: 404 });
    }
    if (msg === "cannot_delete_sovereign_user") {
      return Response.json({ error: "cannot_delete_sovereign_user" }, { status: 403 });
    }
    return Response.json(
      {
        error: "purge_failed",
        message: msg,
      },
      { status: 500 },
    );
  }
}
