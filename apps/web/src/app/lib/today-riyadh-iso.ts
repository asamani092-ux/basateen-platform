/** O(1) time, O(1) space — YYYY-MM-DD in Asia/Riyadh (not UTC). */
export function todayRiyadhIso(timeZone = "Asia/Riyadh"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** O(1) — تاريخ هجري أم القرى بجانب الميلادي (بدون مكتبات). */
export function formatHijriUmalqura(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return "";
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dt);
  } catch {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dt);
  }
}

/** O(1) — عرض ميلادي مختصر بالعربية. */
export function formatGregorianAr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dt);
}
