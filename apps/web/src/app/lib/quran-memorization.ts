export type QuranUnit = "face" | "hizb" | "juz";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** O(n) — n = input length */
function normalizeArabicDigits(raw: string): string {
  return raw.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** O(1) */
export function convertToFaces(value: number, unit: QuranUnit): number {
  if (!value || isNaN(value)) return 0;
  switch (unit) {
    case "juz":
      return value * 20;
    case "hizb":
      return value * 10;
    case "face":
    default:
      return value;
  }
}

/** O(1) */
export function formatFacesToText(faces: number): string {
  const totalFaces = Math.max(0, Math.round(faces));
  if (totalFaces === 0) return "";
  const juz = Math.floor(totalFaces / 20);
  const remainingAfterJuz = totalFaces % 20;
  const hizb = Math.floor(remainingAfterJuz / 10);
  const remainderFaces = remainingAfterJuz % 10;
  const parts: string[] = [];
  if (juz > 0) parts.push(juz === 1 ? "1 جزء" : `${juz} أجزاء`);
  if (hizb > 0) parts.push(hizb === 1 ? "1 حزب" : `${hizb} أحزاب`);
  if (remainderFaces > 0) {
    parts.push(
      remainderFaces === 1 ? "1 وجه" : `${remainderFaces} أوجه`,
    );
  }
  return parts.join(" و ");
}

/** O(1) */
export function facesToJuz(faces: number): number {
  const n = Math.max(0, Number(faces) || 0);
  return Math.round((n / 20) * 100) / 100;
}

/** O(n) on string length — parse juz/hizb/face Arabic patterns + legacy numeric juz */
export function parseMemorizationTextToFaces(
  raw: string | null | undefined,
): number {
  if (!raw?.trim()) return 0;
  const normalized = normalizeArabicDigits(raw.trim());

  let total = 0;
  let matched = false;

  const juzRe =
    /(\d+(?:\.\d+)?)\s*(?:ج(?:ز(?:ء|ئ)?(?:ان)?|زء)|أجزاء|اجزاء)/gi;
  for (const m of normalized.matchAll(juzRe)) {
    total += convertToFaces(Number(m[1]), "juz");
    matched = true;
  }

  const hizbRe =
    /(\d+(?:\.\d+)?)\s*(?:ح(?:ز(?:ب|ب)?(?:ان)?|زب)|أحزاب|احزاب)/gi;
  for (const m of normalized.matchAll(hizbRe)) {
    total += convertToFaces(Number(m[1]), "hizb");
    matched = true;
  }

  const faceRe =
    /(\d+(?:\.\d+)?)\s*(?:و(?:ج(?:ه|ه)?(?:ان)?|جه)|أوجه|وجه)/gi;
  for (const m of normalized.matchAll(faceRe)) {
    total += convertToFaces(Number(m[1]), "face");
    matched = true;
  }

  if (matched) return total;

  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? convertToFaces(Number(match[1]), "juz") : 0;
}

/** O(1) — pick largest clean unit for structured form defaults */
export function facesToStructuredInput(faces: number): {
  value: string;
  unit: QuranUnit;
} {
  const total = Math.max(0, Math.round(faces));
  if (total === 0) return { value: "", unit: "face" };
  if (total % 20 === 0) return { value: String(total / 20), unit: "juz" };
  if (total % 10 === 0) return { value: String(total / 10), unit: "hizb" };
  return { value: String(total), unit: "face" };
}

export function parseQuranUnit(raw: unknown): QuranUnit {
  if (raw === "juz" || raw === "hizb" || raw === "face") return raw;
  return "face";
}

/** O(1) — resolve faces + display text from structured or legacy fields */
export function resolveMemorizationFields(input: {
  memorization_faces?: unknown;
  memorization_value?: unknown;
  memorization_unit?: unknown;
  memorization_amount?: unknown;
}): { faces: number | null; text: string | null } {
  const explicitFaces = Number(input.memorization_faces);
  if (Number.isFinite(explicitFaces) && explicitFaces >= 0) {
    const faces = Math.round(explicitFaces);
    return {
      faces: faces > 0 ? faces : null,
      text: formatFacesToText(faces) || null,
    };
  }

  const valueStr = String(input.memorization_value ?? "").trim();
  const unit = parseQuranUnit(input.memorization_unit);
  if (valueStr) {
    const n = Number(valueStr);
    if (Number.isFinite(n) && n > 0) {
      const faces = Math.round(convertToFaces(n, unit));
      return {
        faces: faces > 0 ? faces : null,
        text: formatFacesToText(faces) || null,
      };
    }
  }

  const rawText = String(input.memorization_amount ?? "").trim();
  if (rawText) {
    const faces = parseMemorizationTextToFaces(rawText);
    return {
      faces: faces > 0 ? faces : null,
      text: formatFacesToText(faces) || rawText,
    };
  }

  return { faces: null, text: null };
}
