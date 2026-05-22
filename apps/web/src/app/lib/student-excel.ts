import * as XLSX from "xlsx";

/** عناوين Excel الرسمية (بالترتيب) */
export const EXCEL_HEADERS = [
  "الاسم الرباعي",
  "الهوية",
  "الجنسية",
  "رقم الجوال",
  "المدرسة",
  "الصف",
  "مقدار الحفظ",
  "رقم جوال ولي الأمر",
  "هوية ولي الأمر إن وجدت",
  "الحلقة",
  "أعراض صحية إذا وجد",
] as const;

export type StudentExcelRow = {
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

const HEADER_TO_FIELD: Record<string, keyof StudentExcelRow> = {
  "الاسم الرباعي": "full_name_ar",
  الهوية: "national_id",
  الجنسية: "nationality",
  "رقم الجوال": "phone",
  المدرسة: "school_name",
  الصف: "school_grade",
  "مقدار الحفظ": "memorization_amount",
  "رقم جوال ولي الأمر": "guardian_phone",
  "هوية ولي الأمر إن وجدت": "guardian_national_id",
  الحلقة: "circle_name",
  "أعراض صحية إذا وجد": "health_notes",
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function downloadTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...EXCEL_HEADERS],
    [
      "مثال: محمد أحمد سعد العتيبي",
      "1010000099",
      "سعودي",
      "0501234567",
      "مدرسة النور",
      "ثالث متوسط",
      "5 أجزاء",
      "0509876543",
      "",
      "حلقة الصديق",
      "",
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "طلاب");
  XLSX.writeFile(wb, "basateen-students-template.xlsx");
}

export function parseStudentExcel(buffer: ArrayBuffer): StudentExcelRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
  }) as (string | number)[][];

  if (matrix.length < 2) return [];

  const headerRow = matrix[0].map((h) => cellStr(h));
  const colIndex = new Map<keyof StudentExcelRow, number>();
  headerRow.forEach((h, idx) => {
    const field = HEADER_TO_FIELD[h];
    if (field) colIndex.set(field, idx);
  });

  if (!colIndex.has("full_name_ar")) {
    throw new Error("missing_name_column");
  }

  const rows: StudentExcelRow[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.every((c) => !cellStr(c))) continue;

    const row: StudentExcelRow = { full_name_ar: "" };
    for (const [field, idx] of colIndex.entries()) {
      const val = cellStr(line[idx]);
      if (!val) continue;
      (row as Record<string, string>)[field] = val;
    }
    if (!row.full_name_ar) continue;
    rows.push(row);
  }

  return rows;
}

export function exportStudentsToExcel(
  items: StudentExcelRow[],
  filename = "basateen-students-export.xlsx",
): void {
  const data = items.map((s) => [
    s.full_name_ar ?? "",
    s.national_id ?? "",
    s.nationality ?? "",
    s.phone ?? "",
    s.school_name ?? "",
    s.school_grade ?? "",
    s.memorization_amount ?? "",
    s.guardian_phone ?? "",
    s.guardian_national_id ?? "",
    s.circle_name ?? "",
    s.health_notes ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[...EXCEL_HEADERS], ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "طلاب");
  XLSX.writeFile(wb, filename);
}
