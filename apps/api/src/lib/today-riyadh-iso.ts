/** O(1) time, O(1) space — YYYY-MM-DD in Asia/Riyadh (not UTC). */
export function todayRiyadhIso(timeZone = "Asia/Riyadh"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** O(1) — calendar shift on date-only ISO strings (timezone-neutral). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** O(1) — weekday 0=Sun for a calendar ISO date. */
export function weekdayIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
