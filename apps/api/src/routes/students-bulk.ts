import type { Env } from "../types";
import { syncStudentPlacementColumns } from "../lib/admin-dept-schema";
import { assignStudentCircle } from "../lib/placement";
import {
  applyStudentPlacement,
  createStudentWithPlacement,
  loadGroupNameMaps,
  parseBulkPasteLines,
  resolveEducationalGroupByName,
  type GroupNameMaps,
} from "../lib/students-admin";
import { ADMIN_DATA_ROLES } from "../lib/roles";
import { canManageCircle } from "../lib/dept-scope";
import { hasTable, tableHasColumn } from "../lib/db-schema";
import { buildStudentPlacementSql } from "../lib/student-list-sql";
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
  track_name?: string | null;
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
  if (typeof v === "number" && Number.isFinite(v)) {
    const digits = String(Math.trunc(v));
    return digits.length > 0 ? digits.slice(0, max) : null;
  }
  let s = String(v).trim();
  if (!s) return null;
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s.slice(0, max);
}

function sanitizeImportRow(r: StudentImportRow): StudentImportRow {
  return {
    full_name_ar: trim(r.full_name_ar, 200) ?? "",
    national_id: trim(r.national_id, 32),
    nationality: trim(r.nationality, 80) ?? "سعودي",
    phone: trim(r.phone, 20),
    school_name: trim(r.school_name, 120),
    school_grade: trim(r.school_grade, 80),
    memorization_amount: trim(r.memorization_amount, 120),
    guardian_phone: trim(r.guardian_phone, 20),
    guardian_national_id: trim(r.guardian_national_id, 32),
    track_name: trim(r.track_name, 100),
    circle_name: trim(r.circle_name, 100),
    health_notes: trim(r.health_notes, 500),
  };
}

async function loadTrackMap(
  env: Env,
  complexId: number,
): Promise<Map<string, number>> {
  if (!(await hasTable(env, "tracks"))) return new Map();
  const result = await env.DB.prepare(
    `SELECT id, name_ar FROM tracks
     WHERE complex_id = ? AND COALESCE(is_active, 1) = 1`,
  )
    .bind(complexId)
    .all<{ id: number; name_ar: string }>();
  const map = new Map<string, number>();
  for (const t of result.results ?? []) {
    map.set(t.name_ar.trim(), t.id);
  }
  return map;
}

function resolveCircleByNames(
  circleMap: Map<string, { id: number; track_id: number | null }>,
  trackMap: Map<string, number>,
  circleName: string | null,
  trackName: string | null,
): { id: number; track_id: number | null } | undefined {
  if (!circleName) return undefined;
  const circle = circleMap.get(circleName);
  if (!circle) return undefined;
  if (trackName) {
    const expectedTrackId = trackMap.get(trackName);
    if (
      expectedTrackId != null &&
      circle.track_id != null &&
      circle.track_id !== expectedTrackId
    ) {
      return undefined;
    }
    if (expectedTrackId != null && circle.track_id == null) {
      return { ...circle, track_id: expectedTrackId };
    }
  }
  return circle;
}

async function loadCircleMap(
  env: Env,
  complexId: number,
): Promise<GroupNameMaps["circles"]> {
  const maps = await loadGroupNameMaps(env, complexId);
  return maps.circles;
}

/** v25 students: national_id + guardian_phone NOT NULL (023_rebuild_v25.sql) */
async function appendRequiredStudentInsertColumns(
  env: Env,
  insertCols: string[],
  insertVals: (string | number | null)[],
  fields: {
    national_id: string | null;
    guardian_phone: string | null;
    phone: string | null;
  },
  rowNum: number,
  complexId: number,
): Promise<void> {
  if (
    (await tableHasColumn(env, "students", "national_id")) &&
    !insertCols.includes("national_id")
  ) {
    const nid =
      fields.national_id?.trim() ||
      `import-${complexId}-${rowNum}-${Date.now()}`;
    insertCols.push("national_id");
    insertVals.push(nid);
  }
  if (
    (await tableHasColumn(env, "students", "guardian_phone")) &&
    !insertCols.includes("guardian_phone")
  ) {
    const gp =
      fields.guardian_phone?.trim() ||
      fields.phone?.trim() ||
      "0000000000";
    insertCols.push("guardian_phone");
    insertVals.push(gp);
  }
}

async function activeStudentFilter(env: Env): Promise<string> {
  return (await tableHasColumn(env, "students", "is_active"))
    ? "AND COALESCE(is_active, 1) = 1"
    : "";
}

async function findStudentId(
  env: Env,
  complexId: number,
  nationalId: string | null,
  phone: string | null,
  guardianPhone: string | null = null,
): Promise<number | null> {
  const active = await activeStudentFilter(env);
  if (nationalId) {
    const row = await env.DB.prepare(
      `SELECT id FROM students WHERE complex_id = ? AND national_id = ? ${active}`,
    )
      .bind(complexId, nationalId)
      .first<{ id: number }>();
    if (row) return row.id;
  }
  for (const candidate of [phone, guardianPhone]) {
    if (!candidate) continue;
    const row = await env.DB.prepare(
      `SELECT id FROM students WHERE complex_id = ? AND phone = ? ${active}`,
    )
      .bind(complexId, candidate)
      .first<{ id: number }>();
    if (row) return row.id;
    if (await tableHasColumn(env, "students", "guardian_phone")) {
      const gRow = await env.DB.prepare(
        `SELECT id FROM students WHERE complex_id = ? AND guardian_phone = ? ${active}`,
      )
        .bind(complexId, candidate)
        .first<{ id: number }>();
      if (gRow) return gRow.id;
    }
  }
  return null;
}

async function dynamicStudentUpdate(
  env: Env,
  studentId: number,
  fields: Record<string, string | null>,
): Promise<void> {
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  for (const [col, val] of Object.entries(fields)) {
    if (!(await tableHasColumn(env, "students", col))) continue;
    if (col === "national_id" || col === "phone") {
      sets.push(`${col} = COALESCE(?, ${col})`);
    } else {
      sets.push(`${col} = ?`);
    }
    binds.push(val);
  }
  if (sets.length === 0) return;
  binds.push(studentId);
  await env.DB.prepare(
    `UPDATE students SET ${sets.join(", ")} WHERE id = ?`,
  )
    .bind(...binds)
    .run();
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

  const placement = await buildStudentPlacementSql(env);
  const active = await activeStudentFilter(env);
  let sql = `
    SELECT
      s.full_name_ar,
      ${(await tableHasColumn(env, "students", "national_id")) ? "s.national_id" : "NULL AS national_id"},
      ${(await tableHasColumn(env, "students", "nationality")) ? "s.nationality" : "NULL AS nationality"},
      ${(await tableHasColumn(env, "students", "phone")) ? "s.phone" : "NULL AS phone"},
      ${(await tableHasColumn(env, "students", "school_name")) ? "s.school_name" : "NULL AS school_name"},
      ${(await tableHasColumn(env, "students", "school_grade")) ? "s.school_grade" : "NULL AS school_grade"},
      ${(await tableHasColumn(env, "students", "memorization_amount")) ? "s.memorization_amount" : "NULL AS memorization_amount"},
      ${(await tableHasColumn(env, "students", "guardian_phone")) ? "s.guardian_phone" : "NULL AS guardian_phone"},
      ${(await tableHasColumn(env, "students", "guardian_national_id")) ? "s.guardian_national_id" : "NULL AS guardian_national_id"},
      ${(await tableHasColumn(env, "students", "health_notes")) ? "s.health_notes" : "NULL AS health_notes"},
      c.name_ar AS circle_name
    FROM students s
    ${placement.historyJoin}
    ${placement.circleJoin}
    WHERE s.complex_id = ? ${active}
  `;
  const binds: (string | number)[] = [auth.complexId];

  if (auth.role === "edu_supervisor" && placement.historyCircleRef) {
    sql += ` AND ${placement.historyCircleRef} IN (
      SELECT circle_id FROM supervisor_scopes WHERE user_id = ?
    )`;
    binds.push(auth.userId);
  } else if (
    auth.role === "edu_supervisor" &&
    (await tableHasColumn(env, "students", "current_circle_id"))
  ) {
    sql += ` AND s.current_circle_id IN (
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
  try {
  const auth = await getAuth(request, env);
  if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
  if (!requireRoles(auth, [...ADMIN_DATA_ROLES, "track_supervisor"])) {
    return json({ error: "forbidden" }, 403);
  }

  let body: { mode?: string; rows?: StudentImportRow[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json", message: "تعذّر قراءة جسم الطلب JSON" }, 400);
  }

  const mode = body.mode === "transfer" ? "transfer" : "register";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return json({ error: "rows_required" }, 400);
  if (rows.length > 300) return json({ error: "too_many_rows", max: 300 }, 400);

  const circleMap = await loadCircleMap(env, auth.complexId);
  const trackMap = await loadTrackMap(env, auth.complexId);
  const results: Array<{
    row: number;
    ok: boolean;
    error?: string;
    student_id?: number;
    action?: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = sanitizeImportRow(rows[i]);
    const full_name_ar = trim(r.full_name_ar, 200);
    const national_id = trim(r.national_id, 32);
    const phone = trim(r.phone, 20) ?? trim(r.guardian_phone, 20);
    const guardian_phone = trim(r.guardian_phone, 20) ?? phone;
    const track_name = trim(r.track_name, 100);
    const circle_name = trim(r.circle_name, 100);

    if (mode === "transfer") {
      if (!national_id && !phone && !guardian_phone) {
        results.push({ row: rowNum, ok: false, error: "missing_identity" });
        continue;
      }
      if (!circle_name) {
        results.push({ row: rowNum, ok: false, error: "missing_circle" });
        continue;
      }
      const circle = resolveCircleByNames(
        circleMap,
        trackMap,
        circle_name,
        track_name,
      );
      if (!circle) {
        results.push({ row: rowNum, ok: false, error: "circle_not_found" });
        continue;
      }
      if (!(await canManageCircle(env, auth, circle.id))) {
        results.push({ row: rowNum, ok: false, error: "forbidden_circle" });
        continue;
      }
      const studentId = await findStudentId(
        env,
        auth.complexId,
        national_id,
        phone,
        guardian_phone,
      );
      if (!studentId) {
        results.push({ row: rowNum, ok: false, error: "student_not_found" });
        continue;
      }
      try {
        await assignStudentCircle(
          env,
          studentId,
          circle.id,
          circle.track_id ?? (track_name ? trackMap.get(track_name) ?? null : null),
          "نقل جماعي — لصق نصي",
        );
        await syncStudentPlacementColumns(
          env,
          studentId,
          circle.id,
          circle.track_id,
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

    const groupMaps = {
      circles: circleMap,
      tracks: trackMap,
    };
    const groupFromName = resolveEducationalGroupByName(
      groupMaps,
      circle_name ?? track_name,
    );
    let circle: { id: number; track_id: number | null } | undefined;
    let circleWarning: string | undefined;
    if (groupFromName?.kind === "circle") {
      circle = { id: groupFromName.id, track_id: groupFromName.track_id };
      if (!(await canManageCircle(env, auth, circle.id))) {
        results.push({ row: rowNum, ok: false, error: "forbidden_circle" });
        continue;
      }
    } else if (groupFromName?.kind === "track") {
      circleWarning = "track_only";
    } else if (circle_name || track_name) {
      circleWarning = "group_not_found";
    }

    const existingId = await findStudentId(
      env,
      auth.complexId,
      national_id,
      phone,
      guardian_phone,
    );

    const fields = {
      full_name_ar,
      national_id,
      nationality: trim(r.nationality, 80),
      phone: phone ?? guardian_phone,
      school_name: trim(r.school_name, 120),
      school_grade: trim(r.school_grade, 80),
      memorization_amount: trim(r.memorization_amount, 120),
      guardian_phone,
      guardian_national_id: trim(r.guardian_national_id, 32),
      health_notes: trim(r.health_notes, 500),
    };

    try {
      if (existingId) {
        await dynamicStudentUpdate(env, existingId, {
          full_name_ar: fields.full_name_ar,
          national_id: fields.national_id,
          nationality: fields.nationality,
          phone: fields.phone,
          school_name: fields.school_name,
          school_grade: fields.school_grade,
          memorization_amount: fields.memorization_amount,
          guardian_phone: fields.guardian_phone,
          guardian_national_id: fields.guardian_national_id,
          health_notes: fields.health_notes,
        });

        if (circle) {
          await assignStudentCircle(
            env,
            existingId,
            circle.id,
            circle.track_id,
            "تحديث/نقل — استيراد Excel",
          );
          await syncStudentPlacementColumns(
            env,
            existingId,
            circle.id,
            circle.track_id,
          );
        }

        results.push({
          row: rowNum,
          ok: true,
          student_id: existingId,
          action: circleWarning ? "updated_no_circle" : "updated",
          ...(circleWarning ? { error: circleWarning } : {}),
        });
      } else {
        if (!groupFromName) {
          results.push({ row: rowNum, ok: false, error: "placement_required" });
          continue;
        }
        const insertCols = ["complex_id", "full_name_ar"];
        const insertVals: (string | number | null)[] = [
          auth.complexId,
          fields.full_name_ar,
        ];
        const optionalCols: Array<[string, string | null]> = [
          ["national_id", fields.national_id],
          ["nationality", fields.nationality],
          ["phone", fields.phone],
          ["school_name", fields.school_name],
          ["school_grade", fields.school_grade],
          ["memorization_amount", fields.memorization_amount],
          ["guardian_phone", fields.guardian_phone],
          ["guardian_national_id", fields.guardian_national_id],
          ["health_notes", fields.health_notes],
        ];
        for (const [col, val] of optionalCols) {
          if (await tableHasColumn(env, "students", col)) {
            insertCols.push(col);
            insertVals.push(val);
          }
        }
        await appendRequiredStudentInsertColumns(
          env,
          insertCols,
          insertVals,
          {
            national_id: fields.national_id,
            guardian_phone: fields.guardian_phone,
            phone: fields.phone,
          },
          rowNum,
          auth.complexId,
        );
        const placeholders = insertCols.map(() => "?").join(", ");
        const insertStmt = env.DB.prepare(
          `INSERT INTO students (${insertCols.join(", ")}) VALUES (${placeholders})`,
        ).bind(...insertVals);
        const batchResult = await env.DB.batch([insertStmt]);
        const studentId = Number(batchResult[0]?.meta?.last_row_id ?? 0);
        if (!studentId) {
          results.push({ row: rowNum, ok: false, error: "save_failed" });
          continue;
        }

        if (groupFromName) {
          await applyStudentPlacement(
            env,
            studentId,
            groupFromName,
            "تسجيل — استيراد جماعي",
          );
        }

        results.push({
          row: rowNum,
          ok: true,
          student_id: studentId,
          action: "created",
        });
      }
    } catch (rowErr: unknown) {
      console.error("students_bulk_row_failed", rowNum, rowErr);
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
  } catch (error: unknown) {
    console.error("students_bulk_import_failed", error);
    return json(
      {
        error: "students_bulk_import_failed",
        message:
          error instanceof Error ? error.message : "فشل استيراد ملف الطلاب",
        items: [],
      },
      500,
    );
  }
}

export async function handleStudentsBulkPaste(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = await getAuth(request, env);
    if (!requireAuth(auth)) return json({ error: "unauthorized" }, 401);
    if (!requireRoles(auth, [...ADMIN_DATA_ROLES, "track_supervisor"])) {
      return json({ error: "forbidden" }, 403);
    }

    let body: { text?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const text = typeof body.text === "string" ? body.text : "";
    const parsed = parseBulkPasteLines(text);
    if (parsed.length === 0) {
      return json({ ok: true, total: 0, success: 0, skipped: 0 });
    }
    if (parsed.length > 300) {
      return json({ error: "too_many_rows", max: 300 }, 400);
    }

    const maps = await loadGroupNameMaps(env, auth.complexId);
    let success = 0;
    let skipped = 0;

    for (const row of parsed) {
      const national_id = row.national_id;
      const phone = row.phone;
      const guardian_phone = row.guardian_phone ?? phone;
      if (
        !row.full_name_ar ||
        !national_id ||
        !row.nationality ||
        !phone ||
        !guardian_phone
      ) {
        skipped += 1;
        continue;
      }

      const placement = resolveEducationalGroupByName(maps, row.group_name);
      if (!placement) {
        skipped += 1;
        continue;
      }

      if (placement.kind === "circle") {
        if (!(await canManageCircle(env, auth, placement.id))) {
          skipped += 1;
          continue;
        }
      }

      const existingId = await findStudentId(
        env,
        auth.complexId,
        national_id,
        phone,
        guardian_phone,
      );

      try {
        if (existingId) {
          await dynamicStudentUpdate(env, existingId, {
            full_name_ar: row.full_name_ar,
            national_id,
            nationality: row.nationality,
            phone,
            guardian_phone,
            school_name: row.school_name,
            school_grade: row.school_grade,
          });
          await applyStudentPlacement(
            env,
            existingId,
            placement,
            "تحديث — لصق جماعي",
          );
          success += 1;
        } else {
          await createStudentWithPlacement(
            env,
            auth.complexId,
            {
              full_name_ar: row.full_name_ar,
              national_id,
              nationality: row.nationality,
              phone,
              guardian_phone,
              school_name: row.school_name,
              school_grade: row.school_grade,
              circle_id: placement.kind === "circle" ? placement.id : null,
              track_id:
                placement.kind === "track"
                  ? placement.id
                  : placement.track_id,
            },
            auth,
          );
          success += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    return json({
      ok: true,
      total: parsed.length,
      success,
      skipped,
    });
  } catch (error: unknown) {
    console.error("students_bulk_paste_failed", error);
    return json(
      {
        error: "students_bulk_paste_failed",
        message:
          error instanceof Error ? error.message : "فشل الاستيراد الجماعي",
      },
      500,
    );
  }
}
