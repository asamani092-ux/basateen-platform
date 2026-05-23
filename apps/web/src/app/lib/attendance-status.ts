/** توحيد قيم الحالة من API أو قاعدة البيانات */
export function normalizeAttendanceStatus(raw: string | null | undefined): string {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t || t === "present" || t === "حاضر" || t === "p") return "present";
  if (t === "absent" || t === "غائب" || t === "a") return "absent";
  if (t === "excused" || t === "معتذر" || t === "e" || t === "excuse") {
    return "excused";
  }
  return "present";
}
