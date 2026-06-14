import * as XLSX from "xlsx";
import { api, type SemesterExportAllPayload } from "./api-client";

const STATUS_LABELS: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  excused: "مستأذن",
};

/** Time O(n+m+d) for students, summary, and daily rows; Space O(n+m+d). */
export async function downloadSemesterArchiveXlsx(): Promise<void> {
  const data: SemesterExportAllPayload = await api.adminDeptSemesterExportAll();
  const meta = [
    ["نوع التصدير", "الأرشيف الختامي الشامل"],
    ["بداية الفصل", data.semester.start_date ?? "—"],
    ["نهاية الفصل", data.semester.end_date ?? "—"],
    ["أسابيع الفصل", String(data.semester.semester_weeks)],
    ["الخريجون", String(data.semester.graduates_count)],
    ["الحفاظ", String(data.semester.huffadh_count)],
    ["نطاق التصدير", `${data.semester.export_range.start} → ${data.semester.export_range.end}`],
    ["تاريخ التصدير", data.exported_at.slice(0, 19).replace("T", " ")],
  ];

  const studentsSheet = XLSX.utils.aoa_to_sheet([
    ["الاسم", "الهوية", "الجوال", "الصف", "الحلقة", "المسار", "مؤرشف"],
    ...data.students.map((s) => [
      s.full_name_ar,
      s.national_id ?? "",
      s.phone ?? "",
      s.school_grade ?? "",
      s.circle_name ?? "",
      s.track_name ?? "",
      s.is_archived ? "نعم" : "لا",
    ]),
  ]);

  const attendanceSheet = XLSX.utils.aoa_to_sheet([
    ["الاسم", "أيام حضور", "أيام غياب", "أيام عذر"],
    ...data.attendance_summary.map((r) => [
      r.full_name_ar,
      r.present_days,
      r.absent_days,
      r.excused_days,
    ]),
  ]);

  const metaSheet = XLSX.utils.aoa_to_sheet(meta);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, metaSheet, "معلومات الفصل");
  XLSX.utils.book_append_sheet(wb, studentsSheet, "الطلاب");
  XLSX.utils.book_append_sheet(wb, attendanceSheet, "ملخص الحضور");

  if (data.attendance_daily?.length) {
    const dailySheet = XLSX.utils.aoa_to_sheet([
      ["الاسم", "التاريخ", "الحالة"],
      ...data.attendance_daily.map((r) => [
        r.full_name_ar,
        r.attendance_date,
        STATUS_LABELS[r.status] ?? r.status,
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, dailySheet, "الحضور اليومي");
  }

  const stamp = data.semester.start_date ?? data.exported_at.slice(0, 10);
  XLSX.writeFile(wb, `basateen-semester-final-archive-${stamp}.xlsx`);
}
