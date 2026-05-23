/** تطبيع نص عربي للبحث المتسامح (بدون تشكيل) */
export function normalizeArabicSearch(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

export function matchesArabicName(query: string, name: string): boolean {
  const q = normalizeArabicSearch(query);
  if (!q) return true;
  const n = normalizeArabicSearch(name);
  const parts = q.split(" ").filter(Boolean);
  return parts.every((p) => n.includes(p));
}
