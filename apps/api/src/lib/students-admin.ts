import type { Env } from "../types";
import { parsePositiveIntField } from "./students-schema";
import { syncStudentPlacementColumns } from "./admin-dept-schema";
import { circleExistsInComplex, resolveCircleTrackId } from "./circle-track";
import { canManageCircle } from "./dept-scope";
import { hasTable, tableHasColumn } from "./db-schema";
import { assignStudentCircle } from "./placement";

export type ResolvedGroup =
  | { kind: "circle"; id: number; track_id: number | null }
  | { kind: "track"; id: number };

export type GroupNameMaps = {
  circles: Map<string, { id: number; track_id: number | null }>;
  tracks: Map<string, number>;
};

/** O(C+T) — تحميل خرائط أسماء الحلقات والمسارات */
export async function loadGroupNameMaps(
  env: Env,
  complexId: number,
): Promise<GroupNameMaps> {
  const circles = new Map<string, { id: number; track_id: number | null }>();
  if (await hasTable(env, "circles")) {
    const hasIsActive = await tableHasColumn(env, "circles", "is_active");
    const activeFilter = hasIsActive ? " AND COALESCE(is_active, 1) = 1" : "";
    const result = await env.DB.prepare(
      `SELECT id, name_ar FROM circles WHERE complex_id = ?${activeFilter}`,
    )
      .bind(complexId)
      .all<{ id: number; name_ar: string }>();
    for (const c of result.results ?? []) {
      circles.set(c.name_ar.trim(), { id: c.id, track_id: null });
    }
    if (await hasTable(env, "track_circles")) {
      const links = await env.DB.prepare(
        `SELECT circle_id, track_id FROM track_circles`,
      ).all<{ circle_id: number; track_id: number }>();
      for (const link of links.results ?? []) {
        for (const [name, entry] of circles) {
          if (entry.id === link.circle_id) {
            circles.set(name, { ...entry, track_id: link.track_id });
            break;
          }
        }
      }
    } else if (await tableHasColumn(env, "circles", "track_id")) {
      const result2 = await env.DB.prepare(
        `SELECT id, name_ar, track_id FROM circles WHERE complex_id = ?${activeFilter}`,
      )
        .bind(complexId)
        .all<{ id: number; name_ar: string; track_id: number | null }>();
      for (const c of result2.results ?? []) {
        circles.set(c.name_ar.trim(), {
          id: c.id,
          track_id: c.track_id ?? null,
        });
      }
    }
  }

  const tracks = new Map<string, number>();
  if (await hasTable(env, "tracks")) {
    const hasIsActive = await tableHasColumn(env, "tracks", "is_active");
    const activeFilter = hasIsActive ? " AND COALESCE(is_active, 1) = 1" : "";
    const result = await env.DB.prepare(
      `SELECT id, name_ar FROM tracks WHERE complex_id = ?${activeFilter}`,
    )
      .bind(complexId)
      .all<{ id: number; name_ar: string }>();
    for (const t of result.results ?? []) {
      tracks.set(t.name_ar.trim(), t.id);
    }
  }

  return { circles, tracks };
}

/** O(1) — مطابقة اسم الحلقة/المسار (حلقة أولاً ثم مسار) */
export function resolveEducationalGroupByName(
  maps: GroupNameMaps,
  groupName: string | null | undefined,
): ResolvedGroup | undefined {
  const key = (groupName ?? "").trim();
  if (!key) return undefined;
  const circle = maps.circles.get(key);
  if (circle) return { kind: "circle", id: circle.id, track_id: circle.track_id };
  const trackId = maps.tracks.get(key);
  if (trackId != null) return { kind: "track", id: trackId };
  return undefined;
}

export async function applyStudentPlacement(
  env: Env,
  studentId: number,
  placement: ResolvedGroup,
  note: string,
): Promise<void> {
  if (placement.kind === "circle") {
    try {
      await assignStudentCircle(
        env,
        studentId,
        placement.id,
        placement.track_id,
        note,
      );
    } catch (err) {
      console.error("applyStudentPlacement_assign_failed", studentId, err);
      await syncStudentPlacementColumns(
        env,
        studentId,
        placement.id,
        placement.track_id,
      );
    }
    return;
  }

  const sets: string[] = [];
  const binds: (number | null)[] = [];
  if (await tableHasColumn(env, "students", "current_track_id")) {
    sets.push("current_track_id = ?");
    binds.push(placement.id);
  }
  if (await tableHasColumn(env, "students", "current_circle_id")) {
    sets.push("current_circle_id = NULL");
  }
  if (sets.length === 0) return;
  binds.push(studentId);
  await env.DB.prepare(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
}

const STUDENT_CHILD_TABLES = [
  "quran_daily_ledger",
  "student_attendance",
  "student_semester_plans",
  "student_circle_history",
  "quiz_attempts",
  "student_pledges",
  "student_disciplinary_summary",
  "competition_logs",
  "competition_student_plans",
  "competition_targets",
  "yom_himma_audit",
  "yom_himma_targets",
  "teacher_daily_marks",
  "student_edu_plans",
  "quranic_day_records",
  "quranic_day_students",
  "reciter_daily_marks",
  "reciter_session_students",
] as const;

/** O(k) — k عدد الجداول الفرعية الموجودة */
export async function safeDeleteStudent(env: Env, studentId: number): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  for (const table of STUDENT_CHILD_TABLES) {
    if (!(await hasTable(env, table))) continue;
    if (!(await tableHasColumn(env, table, "student_id"))) continue;
    stmts.push(
      env.DB.prepare(`DELETE FROM ${table} WHERE student_id = ?`).bind(studentId),
    );
  }

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }

  await env.DB.prepare(`DELETE FROM students WHERE id = ?`).bind(studentId).run();
}

export type CreateStudentInput = {
  full_name_ar: string;
  national_id: string;
  nationality: string;
  phone: string;
  guardian_phone: string;
  school_name?: string | null;
  school_grade?: string | null;
  health_notes?: string | null;
  memorization_amount?: string | null;
  guardian_national_id?: string | null;
  guardian_work?: string | null;
  stage_id?: number | null;
  age?: number | null;
  circle_id?: number | null;
  track_id?: number | null;
};

export async function createStudentWithPlacement(
  env: Env,
  complexId: number,
  input: CreateStudentInput,
  auth: { userId: number; role: string; complexId: number },
): Promise<{ id: number }> {
  const circleId = parsePositiveIntField(input.circle_id);
  const trackId = parsePositiveIntField(input.track_id);

  if (!circleId && !trackId) {
    throw new Error("placement_required");
  }

  if (circleId) {
    if (!(await circleExistsInComplex(env, circleId, complexId))) {
      throw new Error("circle_not_found");
    }
    if (!(await canManageCircle(env, auth, circleId))) {
      throw new Error("forbidden_circle");
    }
  }

  if (trackId && !circleId) {
    const track = await env.DB.prepare(
      `SELECT id FROM tracks WHERE id = ? AND complex_id = ?`,
    )
      .bind(trackId, complexId)
      .first();
    if (!track) throw new Error("track_not_found");
  }

  const insertCols = ["complex_id", "full_name_ar"];
  const insertVals: (string | number | null)[] = [complexId, input.full_name_ar.trim()];

  const opt = (v: string | null | undefined): string | null => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };

  const optional: Array<[string, string | number | null]> = [
    ["national_id", input.national_id.trim()],
    ["nationality", input.nationality.trim()],
    ["phone", input.phone.trim()],
    ["guardian_phone", input.guardian_phone.trim()],
    ["school_name", opt(input.school_name)],
    ["school_grade", opt(input.school_grade)],
    ["health_notes", opt(input.health_notes)],
    ["memorization_amount", opt(input.memorization_amount)],
    ["guardian_national_id", opt(input.guardian_national_id)],
    ["guardian_work", opt(input.guardian_work)],
    ["account_status", "active"],
    ["is_active", 1],
  ];
  if (input.stage_id != null) {
    optional.push(["stage_id", input.stage_id]);
  }
  if (input.age != null) {
    optional.push(["age", input.age]);
  }

  for (const [col, val] of optional) {
    if (val === null && col !== "account_status") continue;
    if (await tableHasColumn(env, "students", col)) {
      insertCols.push(col);
      insertVals.push(val);
    }
  }

  const placeholders = insertCols.map(() => "?").join(", ");
  let ins;
  try {
    ins = await env.DB.prepare(
      `INSERT INTO students (${insertCols.join(", ")}) VALUES (${placeholders})`,
    )
      .bind(...insertVals)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("students_insert_failed", msg, insertCols, insertVals);
    if (msg.includes("UNIQUE") && msg.includes("national_id")) {
      throw new Error("national_id_exists");
    }
    throw new Error(msg || "save_failed");
  }

  const studentId = Number(ins.meta.last_row_id ?? 0);
  if (!studentId) throw new Error("save_failed");

  if (circleId) {
    const resolvedTrack = await resolveCircleTrackId(
      env,
      circleId,
      complexId,
      trackId,
    );
    await applyStudentPlacement(
      env,
      studentId,
      { kind: "circle", id: circleId, track_id: resolvedTrack },
      "تسجيل — إضافة فردية",
    );
    if (input.stage_id != null) {
      await syncStudentPlacementColumns(
        env,
        studentId,
        circleId,
        resolvedTrack,
        input.stage_id,
      );
    }
  } else if (trackId) {
    await applyStudentPlacement(
      env,
      studentId,
      { kind: "track", id: trackId },
      "تسجيل — إضافة فردية (مسار)",
    );
  }

  return { id: studentId };
}

export type ParsedBulkRow = {
  full_name_ar: string;
  national_id: string | null;
  nationality: string | null;
  phone: string | null;
  guardian_phone: string | null;
  school_name: string | null;
  school_grade: string | null;
  group_name: string | null;
};

function trimCell(v: string, max: number): string | null {
  const s = v.trim();
  return s.length > 0 ? s.slice(0, max) : null;
}

/** O(n·m) — n أسطر، m أعمدة */
export function parseBulkPasteLines(text: string): ParsedBulkRow[] {
  const rows: ParsedBulkRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const parts = raw.split("\t").map((p) => p.trim());
    while (parts.length < 8) parts.push("");
    const full_name_ar = parts[0] ?? "";
    if (!full_name_ar) continue;
    rows.push({
      full_name_ar: full_name_ar.slice(0, 200),
      national_id: trimCell(parts[1] ?? "", 32),
      nationality: trimCell(parts[2] ?? "", 80) ?? "سعودي",
      phone: trimCell(parts[3] ?? "", 20),
      guardian_phone: trimCell(parts[4] ?? "", 20),
      school_name: trimCell(parts[5] ?? "", 120),
      school_grade: trimCell(parts[6] ?? "", 80),
      group_name: trimCell(parts[7] ?? "", 100),
    });
  }
  return rows;
}

export type AdminBulkStudentRow = {
  full_name_ar: string;
  national_id: string;
  nationality: string;
  phone: string;
  guardian_phone: string;
  school_name: string | null;
  school_grade: string | null;
  memorization_amount: string | null;
  guardian_national_id: string | null;
  health_notes: string | null;
  group_name: string | null;
};

/** O(1) — تحويل قيم Excel إلى نصوص آمنة */
export function sanitizeExcelCell(v: unknown, max = 500): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v) || Math.abs(v - Math.trunc(v)) < 1e-9) {
      return String(Math.trunc(v)).slice(0, max);
    }
    const raw = String(v);
    if (/e\+?/i.test(raw)) {
      return String(Math.trunc(v)).slice(0, max);
    }
    return raw.replace(/\.0+$/, "").slice(0, max);
  }
  let s = String(v).trim();
  if (!s) return null;
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  if (/e\+?/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.trunc(n)).slice(0, max);
  }
  return s.slice(0, max);
}

/** O(n) — معالجة مصفوفة الاستيراد مع تجاوز الصفوف الفاشلة */
export async function processAdminStudentsBulk(
  env: Env,
  complexId: number,
  auth: { userId: number; role: string; complexId: number },
  rows: AdminBulkStudentRow[],
): Promise<{
  successCount: number;
  failedCount: number;
  total: number;
  message: string;
  failedDetails: Array<{
    row: number;
    national_id: string | null;
    full_name_ar: string | null;
    error: string;
  }>;
}> {
  const maps = await loadGroupNameMaps(env, complexId);
  let successCount = 0;
  let failedCount = 0;
  const failedDetails: Array<{
    row: number;
    national_id: string | null;
    full_name_ar: string | null;
    error: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;
    const full_name_ar = sanitizeExcelCell(row.full_name_ar, 200);
    const national_id = sanitizeExcelCell(row.national_id, 32);
    const nationality = sanitizeExcelCell(row.nationality, 80) ?? "سعودي";
    const phone = sanitizeExcelCell(row.phone, 20);
    const guardian_phone =
      sanitizeExcelCell(row.guardian_phone, 20) ?? phone;

    const groupName = sanitizeExcelCell(row.group_name, 100);

    if (
      !full_name_ar ||
      !national_id ||
      !phone ||
      !guardian_phone
    ) {
      failedCount += 1;
      failedDetails.push({
        row: rowNum,
        national_id,
        full_name_ar,
        error: "missing_required_fields",
      });
      continue;
    }

    const placement = resolveEducationalGroupByName(maps, groupName);
    if (!placement) {
      failedCount += 1;
      failedDetails.push({
        row: rowNum,
        national_id,
        full_name_ar,
        error: "group_not_found",
      });
      continue;
    }

    if (placement.kind === "circle") {
      if (!(await canManageCircle(env, auth, placement.id))) {
        failedCount += 1;
        failedDetails.push({
          row: rowNum,
          national_id,
          full_name_ar,
          error: "forbidden_circle",
        });
        continue;
      }
    }

    try {
      await createStudentWithPlacement(env, complexId, {
        full_name_ar,
        national_id,
        nationality,
        phone,
        guardian_phone,
        school_name: sanitizeExcelCell(row.school_name, 120),
        school_grade: sanitizeExcelCell(row.school_grade, 80),
        memorization_amount: sanitizeExcelCell(row.memorization_amount, 120),
        guardian_national_id: sanitizeExcelCell(row.guardian_national_id, 32),
        health_notes: sanitizeExcelCell(row.health_notes, 500),
        circle_id: placement.kind === "circle" ? placement.id : null,
        track_id:
          placement.kind === "track"
            ? placement.id
            : placement.track_id,
      }, auth);
      successCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("admin_students_bulk_row_failed", row.national_id, err);
      failedCount += 1;
      failedDetails.push({
        row: rowNum,
        national_id,
        full_name_ar,
        error: msg,
      });
    }
  }

  return {
    successCount,
    failedCount,
    total: rows.length,
    failedDetails,
    message: `تمت إضافة ${successCount} طالب بنجاح، وفشل ${failedCount}`,
  };
}
