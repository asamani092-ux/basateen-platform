/** O(1) time, O(1) space — YYYY-MM-DD in Asia/Riyadh (not UTC). */
export function todayRiyadhIso(timeZone = "Asia/Riyadh"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
