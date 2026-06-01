import * as XLSX from "xlsx";
import { studentCreateBodySchema } from "../../../../../packages/types/students-schema";

export const STUDENT_TEMPLATE_HEADERS = [
  "الاسم الرباعي",
  "الهوية الوطنية",
  "الجنسية",
  "رقم الجوال",
  "جوال ولي الأمر",
  "المدرسة",
  "الصف",
  "مقدار الحفظ",
  "هوية ولي الأمر",
  "أعراض صحية",
  "اسم الحلقة أو المسار",
] as const;

const HEADER_SET = new Set(
  STUDENT_TEMPLATE_HEADERS.map((h) => h.trim()),
);

export type ParsedStudentImportRow = {
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

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v) || Math.abs(v - Math.trunc(v)) < 1e-9) {
      return String(Math.trunc(v));
    }
    return String(v).replace(/\.0+$/, "");
  }
  return String(v).trim();
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? "").trim();
  return HEADER_SET.has(first) || first === "الاسم الرباعي";
}

function rowToRecord(cells: string[]): ParsedStudentImportRow | null {
  while (cells.length < 11) cells.push("");
  const full_name_ar = cellToString(cells[0]);
  if (!full_name_ar || isHeaderRow(cells)) return null;

  const national_id = cellToString(cells[1]);
  const phone = cellToString(cells[3]);
  const guardian_phone = cellToString(cells[4]) || phone;
  const group_name = cellToString(cells[10]);

  if (!national_id || !phone || !guardian_phone || !group_name) return null;

  return {
    full_name_ar,
    national_id,
    nationality: cellToString(cells[2]) || "سعودي",
    phone,
    guardian_phone,
    school_name: cellToString(cells[5]) || null,
    school_grade: cellToString(cells[6]) || null,
    memorization_amount: cellToString(cells[7]) || null,
    guardian_national_id: cellToString(cells[8]) || null,
    health_notes: cellToString(cells[9]) || null,
    group_name,
  };
}

/** O(n·m) — قراءة ملف Excel/CSV في المتصفح */
export async function parseStudentImportFile(
  file: File,
): Promise<ParsedStudentImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {
    type: "array",
    cellText: true,
    raw: false,
  });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  const rows: ParsedStudentImportRow[] = [];
  for (const line of matrix) {
    const cells = (line ?? []).map((c) => cellToString(c));
    const record = rowToRecord(cells);
    if (record) rows.push(record);
  }
  return rows;
}

export function downloadStudentTemplateCsv(): void {
  const headerLine = STUDENT_TEMPLATE_HEADERS.join(",");
  const sample = [
    "محمد أحمد العتيبي",
    "1234567890",
    "سعودي",
    "0501234567",
    "0509876543",
    "مدرسة النور",
    "الثالث متوسط",
    "5 أوجه",
    "",
    "",
    "حلقة الفجر",
  ].join(",");
  const bom = "\uFEFF";
  const blob = new Blob([bom + headerLine + "\n" + sample + "\n"], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, "نموذج-إضافة-الطلاب.csv");
}

export function downloadStudentTemplateXlsx(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...STUDENT_TEMPLATE_HEADERS],
    [
      "محمد أحمد العتيبي",
      "1234567890",
      "سعودي",
      "0501234567",
      "0509876543",
      "مدرسة النور",
      "الثالث متوسط",
      "5 أوجه",
      "",
      "",
      "حلقة الفجر",
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الطلاب");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, "نموذج-إضافة-الطلاب.xlsx");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function validateStudentCreateForm(body: {
  full_name_ar: string;
  national_id: string;
  nationality: string;
  phone: string;
  guardian_phone: string;
  school_name?: string | null;
  school_grade?: string | null;
  memorization_amount?: string | null;
  guardian_national_id?: string | null;
  health_notes?: string | null;
  placement: string;
}) {
  const { circle_id, track_id } = parsePlacementValue(body.placement);
  return studentCreateBodySchema.safeParse({
    ...body,
    circle_id,
    track_id,
    school_name: body.school_name ?? "",
    school_grade: body.school_grade ?? "",
    memorization_amount: body.memorization_amount ?? "",
    guardian_national_id: body.guardian_national_id ?? "",
    health_notes: body.health_notes ?? "",
  });
}

function parsePlacementValue(value: string): {
  circle_id: number | null;
  track_id: number | null;
} {
  if (!value) return { circle_id: null, track_id: null };
  const [kind, idStr] = value.split(":");
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) return { circle_id: null, track_id: null };
  if (kind === "circle") return { circle_id: Math.trunc(id), track_id: null };
  if (kind === "track") return { circle_id: null, track_id: Math.trunc(id) };
  return { circle_id: null, track_id: null };
}
