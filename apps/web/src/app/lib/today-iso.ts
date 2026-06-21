/** O(1) — تاريخ اليوم بتوقيت المجمع (افتراضي: Asia/Riyadh). */
export function todayIso(timeZone = "Asia/Riyadh"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
