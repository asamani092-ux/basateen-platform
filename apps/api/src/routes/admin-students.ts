import type { Env } from "../types";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { hasTable } from "../lib/db-schema";
import {
  createStudentWithPlacement,
  processAdminStudentsBulk,
  type AdminBulkStudentRow,
} from "../lib/students-admin";
import {
  studentBulkBodySchema,
  studentBulkRowSchema,
  studentCreateBodySchema,
} from "../../../../packages/types/students-schema";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function normalizeBulkRecord(raw: Record<string, unknown>): AdminBulkStudentRow | null {
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (raw[k] != null && String(raw[k]).trim() !== "") return raw[k];
    }
    return null;
  };

  const parsed = studentBulkRowSchema.safeParse({
    full_name_ar: pick("full_name_ar", "الاسم الرباعي", "الاسم"),
    national_id: pick("national_id", "الهوية الوطنية", "الهوية"),
    nationality: pick("nationality", "الجنسية"),
    phone: pick("phone", "رقم الجوال", "جوال الطالب"),
    guardian_phone: pick("guardian_phone", "جوال ولي الأمر"),
    school_name: pick("school_name", "المدرسة"),
    school_grade: pick("school_grade", "الصف"),
    memorization_amount: pick("memorization_amount", "مقدار الحفظ"),
    guardian_national_id: pick("guardian_national_id", "هوية ولي الأمر"),
    health_notes: pick("health_notes", "أعراض صحية"),
    group_name: pick(
      "group_name",
      "circle_name",
      "اسم الحلقة أو المسار",
      "الحلقة",
      "المسار",
    ),
  });

  if (!parsed.success) return null;

  return {
    full_name_ar: parsed.data.full_name_ar,
    national_id: parsed.data.national_id,
    nationality: parsed.data.nationality ?? "سعودي",
    phone: parsed.data.phone,
    guardian_phone: parsed.data.guardian_phone,
    school_name: parsed.data.school_name ?? null,
    school_grade: parsed.data.school_grade ?? null,
    memorization_amount: parsed.data.memorization_amount ?? null,
    guardian_national_id: parsed.data.guardian_national_id ?? null,
    health_notes: parsed.data.health_notes ?? null,
    group_name:
      parsed.data.group_name ??
      parsed.data.circle_name ??
      parsed.data.track_name ??
      null,
  };
}

export async function handleAdminStudentCreate(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await hasTable(env, "students"))) {
      return json({ error: "migration_required", table: "students" }, 503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const parsed = studentCreateBodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("admin_student_create_validation", parsed.error.flatten());
      return json(
        {
          error: "validation_failed",
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const data = parsed.data;

    try {
      const created = await createStudentWithPlacement(
        env,
        auth.complexId,
        {
          full_name_ar: data.full_name_ar,
          national_id: data.national_id,
          nationality: data.nationality,
          phone: data.phone,
          guardian_phone: data.guardian_phone,
          school_name: data.school_name,
          school_grade: data.school_grade,
          memorization_amount: data.memorization_amount,
          guardian_national_id: data.guardian_national_id,
          health_notes: data.health_notes,
          circle_id: data.circle_id,
          track_id: data.track_id,
        },
        auth,
      );
      return json({ ok: true, id: created.id }, 201);
    } catch (e: unknown) {
      console.error("admin_student_create_inner", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "placement_required") {
        return json({ error: "placement_required" }, 400);
      }
      if (msg === "national_id_exists") {
        return json({ error: "national_id_exists" }, 409);
      }
      if (msg === "circle_not_found" || msg === "track_not_found") {
        return json({ error: msg }, 404);
      }
      if (msg === "forbidden_circle") {
        return json({ error: "forbidden" }, 403);
      }
      throw e;
    }
  } catch (err) {
    console.error("admin_student_create_failed", err);
    return json(
      {
        error: "student_create_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}

export async function handleAdminStudentsBulk(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, [...ADMIN_DATA_ROLES, "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const envelope = studentBulkBodySchema.safeParse(body);
    if (!envelope.success) {
      return json({ error: "rows_required", details: envelope.error.flatten() }, 400);
    }

    const normalized: AdminBulkStudentRow[] = [];
    for (const raw of envelope.data.rows) {
      const row = normalizeBulkRecord(raw);
      if (row) normalized.push(row);
    }

    if (normalized.length === 0) {
      return json({ error: "no_valid_rows" }, 400);
    }

    const result = await processAdminStudentsBulk(
      env,
      auth.complexId,
      auth,
      normalized,
    );

    return json({
      ok: true,
      ...result,
      failed: result.failed,
      success: result.success,
    });
  } catch (err) {
    console.error("admin_students_bulk_failed", err);
    return json(
      {
        error: "students_bulk_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
}
