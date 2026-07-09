import type { Env } from "../types";
import { hasTable, tableHasColumn } from "./db-schema";
import { fetchSemesterPeriod, semesterQueryRange } from "./semester-period";
import { resolveAttendanceTableName } from "./student-attendance-db";

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cols: unknown[]): string {
  return cols.map(csvEscape).join(",");
}

/** Time O(r); Space O(r) for output string. */
export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [csvRow(headers)];
  for (const row of rows) {
    lines.push(csvRow(headers.map((h) => row[h] ?? "")));
  }
  return lines.join("\r\n");
}

export type SemesterExportBundle = {
  filename: string;
  body: string;
  semesterRange: { start: string; end: string };
};

/**
 * Build multi-section CSV bundle for semester master export.
 * Time O(a+r+c) row scans; Space O(a+r+c) output buffer.
 */
export async function buildSemesterExportCsvBundle(
  env: Env,
  complexId: number,
): Promise<SemesterExportBundle> {
  const semester = await fetchSemesterPeriod(env, complexId);
  const semesterRange = semesterQueryRange(semester);
  const { start, end } = semesterRange;
  const sections: string[] = [];

  const attTable = await resolveAttendanceTableName(env);
  if (attTable) {
    const attRows = await env.DB.prepare(
      `SELECT sa.student_id, s.full_name_ar, sa.attendance_date, sa.status,
              sa.circle_id, sa.track_id, sa.source, sa.recorded_at
       FROM ${attTable} sa
       INNER JOIN students s ON s.id = sa.student_id AND s.complex_id = sa.complex_id
       WHERE sa.complex_id = ? AND sa.attendance_date BETWEEN ? AND ?
       ORDER BY sa.attendance_date, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, start, end)
      .all<Record<string, unknown>>();
    sections.push(
      "# student_attendance",
      rowsToCsv(
        [
          "student_id",
          "full_name_ar",
          "attendance_date",
          "status",
          "circle_id",
          "track_id",
          "source",
          "recorded_at",
        ],
        attRows.results ?? [],
      ),
    );
  } else {
    sections.push("# student_attendance", "student_id,full_name_ar,attendance_date,status");
  }

  if (await hasTable(env, "edu_daily_recitation")) {
    const hasFace = await tableHasColumn(env, "edu_daily_recitation", "face_count");
    const faceCol = hasFace ? "dr.face_count" : "NULL AS face_count";
    const recRows = await env.DB.prepare(
      `SELECT dr.student_id, s.full_name_ar, dr.recitation_date,
              dr.listened, dr.repeated, dr.revised, dr.error_count,
              dr.tune_errors, ${faceCol}, dr.circle_id, dr.notes
       FROM edu_daily_recitation dr
       INNER JOIN students s ON s.id = dr.student_id
       WHERE s.complex_id = ? AND dr.recitation_date BETWEEN ? AND ?
       ORDER BY dr.recitation_date, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, start, end)
      .all<Record<string, unknown>>();
    sections.push(
      "",
      "# edu_daily_recitation",
      rowsToCsv(
        [
          "student_id",
          "full_name_ar",
          "recitation_date",
          "listened",
          "repeated",
          "revised",
          "error_count",
          "tune_errors",
          "face_count",
          "circle_id",
          "notes",
        ],
        recRows.results ?? [],
      ),
    );
  }

  if (await hasTable(env, "competition_targets")) {
    const targetRows = await env.DB.prepare(
      `SELECT ct.competition_id, c.name_ar AS competition_name,
              ct.student_id, s.full_name_ar,
              ct.current_memorization, ct.target_amount, ct.achieved_amount, ct.synced_at, ct.created_at
       FROM competition_targets ct
       INNER JOIN students s ON s.id = ct.student_id
       LEFT JOIN competitions c ON c.id = ct.competition_id
       WHERE s.complex_id = ?
       ORDER BY ct.competition_id, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId)
      .all<Record<string, unknown>>();
    sections.push(
      "",
      "# competition_targets",
      rowsToCsv(
        [
          "competition_id",
          "competition_name",
          "student_id",
          "full_name_ar",
          "current_memorization",
          "target_amount",
          "achieved_amount",
          "synced_at",
          "created_at",
        ],
        targetRows.results ?? [],
      ),
    );
  }

  if (await hasTable(env, "competition_logs")) {
    const hasMetrics = await tableHasColumn(env, "competition_logs", "metrics_json");
    const hasSource = await tableHasColumn(env, "competition_logs", "source");
    const metricsCol = hasMetrics ? "cl.metrics_json" : "NULL AS metrics_json";
    const sourceCol = hasSource ? "cl.source" : "NULL AS source";
    const logRows = await env.DB.prepare(
      `SELECT cl.competition_id, c.name_ar AS competition_name,
              cl.student_id, s.full_name_ar, cl.task_id, cl.log_date,
              cl.points, cl.notes, ${metricsCol}, ${sourceCol}, cl.recorded_at
       FROM competition_logs cl
       INNER JOIN students s ON s.id = cl.student_id
       LEFT JOIN competitions c ON c.id = cl.competition_id
       WHERE s.complex_id = ? AND cl.log_date BETWEEN ? AND ?
       ORDER BY cl.log_date, cl.competition_id, s.full_name_ar
       LIMIT 100000`,
    )
      .bind(complexId, start, end)
      .all<Record<string, unknown>>();
    sections.push(
      "",
      "# competition_logs",
      rowsToCsv(
        [
          "competition_id",
          "competition_name",
          "student_id",
          "full_name_ar",
          "task_id",
          "log_date",
          "points",
          "notes",
          "metrics_json",
          "source",
          "recorded_at",
        ],
        logRows.results ?? [],
      ),
    );
  }

  const bom = "\uFEFF";
  const body = bom + sections.join("\r\n");
  const filename = `semester-export-${start}_to_${end}.csv`;

  return { filename, body, semesterRange: { start, end } };
}

export function semesterExportCsvResponse(bundle: SemesterExportBundle): Response {
  return new Response(bundle.body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
