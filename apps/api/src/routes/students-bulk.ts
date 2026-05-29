import type { Env } from "../types";
import { assignStudentCircle } from "../lib/placement";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { canManageCircle } from "../lib/dept-scope";
import { getAuth, requireAuth, requireRoles } from "../middleware/auth";

export type StudentImportRow = {
  full_name_ar: string;
  national_id?: string | null;
  nationality?: string | null;
  phone?: string | null;
  school_name?: string | null;
  school_grade?: string | null;
  memorization_amount?: string | null;
  guardian_phone?: string | null;
  guardian_national_id?: string | null;
  circle_name?: string | null;
  health_notes?: string | null;
};

type ExportRow = {
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  guardian_phone: string | null;
  guardian_national_id: string | null;
  circle_name: string | null;
  health_notes: string | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function trim(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

async function loadCircleMap(
  env: Env,
  complexId: number,
): Promise<Map<string, { id: number; track_id: number | null }>> {
  const result = await env.DB.prepare(
    `SELECT id, name_ar, track_id FROM circles
     WHERE complex_id = ? AND is_active = 1`,
  )
    .bind(complexId)
    .all<{ id: number; name_ar: string; track_id: number | null }>();

  const map = new Map<string, { id: number; track_id: number | null }>();
  for (const c of result.results ?? []) {
    map.set(c.name_ar.trim(), { id: c.id, track_id: c.track_id });
  }
  return map;
}

async function findStudentId(
  env: Env,
  complexId: number,
  nationalId: string | null,
  phone: string | null,
): Promise<number | null> {
  if (nationalId) {
    const row = await env.DB.prepare(
      `SELECT id FROM students WHERE complex_id = ? AND national_id = ? AND is_active = 1`,
    )
      .bind(complexId, nationalId)
      .first<{ id: number }>();
    if (row) return row.id;
  }
  if (phone) {
    const row = await env.DB.prepare(
      `SELECT id FROM students WHERE complex_id = ? AND phone = ? AND is_active = 1`,
    )
      .bind(complexId, phone)
      .first<{ id: number }>();
    if (row) return row.id;
  }
  return null;
}

export async function handleStudentsExport(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  let sql = `
    SELECT
      s.full_name_ar,
      s.national_id,
      s.nationality,
      s.phone,
      s.school_name,
      s.school_grade,
      s.memorization_amount,
      s.guardian_phone,
      s.guardian_national_id,
      s.health_notes,
      c.name_ar AS circle_name
    FROM students s
    LEFT JOIN student_circle_history h
      ON h.student_id = s.id AND h.to_at IS NULL AND h.frozen_at IS NULL
    LEFT JOIN circles c ON c.id = h.circle_id
    WHERE s.complex_id = ? AND s.is_active = 1
  `;
  const binds: (string | number)[] = [auth.complexId];

  if (auth.role === "edu_supervisor") {
    sql += ` AND h.circle_id IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  }

  sql += ` ORDER BY s.full_name_ar LIMIT 2000`;

  const result = await env.DB.prepare(sql).bind(...binds).all<ExportRow>();

  return json({ items: result.results ?? [], count: result.results?.length ?? 0 });
}

export async function handleStudentsBulkImport(
  request: Request,
  env: Env,
): Promise<Response> {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, ADMIN_DATA_ROLES)) {
    return json({ error: "forbidden" }, 403);
  }

  let body: { mode?: string; rows?: StudentImportRow[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const mode = body.mode === "transfer" ? "transfer" : "register";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json({ error: "rows_required" }, 400);
  if (rows.length > 300) return json({ error: "too_many_rows", max: 300 }, 400);

  const circleMap = await loadCircleMap(env, auth.complexId);
  const results: Array<{
    row: number;
    ok: boolean;
    error?: string;
    student_id?: number;
    action?: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i];
    const full_name_ar = trim(r.full_name_ar, 200);
    const national_id = trim(r.national_id, 32);
    const phone = trim(r.phone, 20);
    const circle_name = trim(r.circle_name, 100);

    if (mode === "transfer") {
      if (!national_id && !phone) {
        results.push({ row: rowNum, ok: false, error: "missing_identity" });
        continue;
      }
      if (!circle_name) {
        results.push({ row: rowNum, ok: false, error: "missing_circle" });
        continue;
      }
      const circle = circleMap.get(circle_name);
      if (!circle) {
        results.push({ row: rowNum, ok: false, error: "circle_not_found" });
        continue;
      }
      if (!(await canManageCircle(env, auth, circle.id))) {
        results.push({ row: rowNum, ok: false, error: "forbidden_circle" });
        continue;
      }
      const studentId = await findStudentId(env, auth.complexId, national_id, phone);
      if (!studentId) {
        results.push({ row: rowNum, ok: false, error: "student_not_found" });
        continue;
      }
      try {
        await assignStudentCircle(
          env,
          studentId,
          circle.id,
          circle.track_id,
          "نقل جماعي — Excel",
        );
        results.push({
          row: rowNum,
          ok: true,
          student_id: studentId,
          action: "transferred",
        });
      } catch {
        results.push({ row: rowNum, ok: false, error: "transfer_failed" });
      }
      continue;
    }

    /* register — تسجيل جماعي أو تحديث */
    if (!full_name_ar) {
      results.push({ row: rowNum, ok: false, error: "missing_name" });
      continue;
    }

    let circle: { id: number; track_id: number | null } | undefined;
    if (circle_name) {
      circle = circleMap.get(circle_name);
      if (!circle) {
        results.push({ row: rowNum, ok: false, error: "circle_not_found" });
        continue;
      }
      if (!(await canManageCircle(env, auth, circle.id))) {
        results.push({ row: rowNum, ok: false, error: "forbidden_circle" });
        continue;
      }
    }

    const existingId = await findStudentId(
      env,
      auth.complexId,
      national_id,
      phone,
    );

    const fields = {
      full_name_ar,
      national_id,
      nationality: trim(r.nationality, 80),
      phone,
      school_name: trim(r.school_name, 120),
      school_grade: trim(r.school_grade, 80),
      memorization_amount: trim(r.memorization_amount, 120),
      guardian_phone: trim(r.guardian_phone, 20),
      guardian_national_id: trim(r.guardian_national_id, 32),
      health_notes: trim(r.health_notes, 500),
    };

    try {
      if (existingId) {
        await env.DB.prepare(
          `UPDATE students SET
            full_name_ar = ?,
            national_id = COALESCE(?, national_id),
            nationality = ?,
            phone = COALESCE(?, phone),
            school_name = ?,
            school_grade = ?,
            memorization_amount = ?,
            guardian_phone = ?,
            guardian_national_id = ?,
            health_notes = ?
           WHERE id = ?`,
        )
          .bind(
            fields.full_name_ar,
            fields.national_id,
            fields.nationality,
            fields.phone,
            fields.school_name,
            fields.school_grade,
            fields.memorization_amount,
            fields.guardian_phone,
            fields.guardian_national_id,
            fields.health_notes,
            existingId,
          )
          .run();

        if (circle) {
          await assignStudentCircle(
            env,
            existingId,
            circle.id,
            circle.track_id,
            "تحديث/نقل — استيراد Excel",
          );
        }

        results.push({
          row: rowNum,
          ok: true,
          student_id: existingId,
          action: "updated",
        });
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO students (
            complex_id, full_name_ar, national_id, nationality, phone,
            school_name, school_grade, memorization_amount,
            guardian_phone, guardian_national_id, health_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            auth.complexId,
            fields.full_name_ar,
            fields.national_id,
            fields.nationality,
            fields.phone,
            fields.school_name,
            fields.school_grade,
            fields.memorization_amount,
            fields.guardian_phone,
            fields.guardian_national_id,
            fields.health_notes,
          )
          .run();

        const studentId = ins.meta.last_row_id as number;

        if (circle) {
          await assignStudentCircle(
            env,
            studentId,
            circle.id,
            circle.track_id,
            "تسجيل — استيراد Excel",
          );
        }

        results.push({
          row: rowNum,
          ok: true,
          student_id: studentId,
          action: "created",
        });
      }
    } catch {
      results.push({ row: rowNum, ok: false, error: "save_failed" });
    }
  }

  const okCount = results.filter((x) => x.ok).length;

  return json({
    ok: true,
    mode,
    total: rows.length,
    success: okCount,
    failed: rows.length - okCount,
    results,
  });
}
