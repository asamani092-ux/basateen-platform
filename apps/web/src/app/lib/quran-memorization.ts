export type QuranUnit = "face" | "hizb" | "juz";

/** سقوف القرآن الكريم — الجزء 1–29 = 20 وجهاً، الجزء 30 = 23 وجهاً */
export const QURAN_MAX_JUZ = 30;
export const QURAN_MAX_HIZB = 60;
export const QURAN_MAX_FACES = 604;
export const QURAN_JUZ_FACES = 20;
export const QURAN_JUZ30_FACES = 23;
export const QURAN_JUZ29_TOTAL_FACES = 29 * QURAN_JUZ_FACES;
export const QURAN_TOTAL_FACES =
  QURAN_JUZ29_TOTAL_FACES + QURAN_JUZ30_FACES;

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** O(n) — n = input length */
function normalizeArabicDigits(raw: string): string {
  return raw.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** O(1) */
export function getUnitMax(unit: QuranUnit): number {
  switch (unit) {
    case "juz":
      return QURAN_MAX_JUZ;
    case "hizb":
      return QURAN_MAX_HIZB;
    case "face":
    default:
      return QURAN_MAX_FACES;
  }
}

/** O(1) — clamp structured input before conversion */
export function clampUnitValue(value: number, unit: QuranUnit): number {
  const n = Math.max(0, Number(value) || 0);
  if (!n) return 0;
  return Math.min(n, getUnitMax(unit));
}

/** O(1) — clamp absolute faces to Quran ceiling */
export function clampFaces(faces: number): number {
  const n = Math.max(0, Math.round(Number(faces) || 0));
  return Math.min(n, QURAN_MAX_FACES);
}

/** O(1) — convert structured unit to absolute faces (juz 30 = 23 faces) */
export function convertToFaces(value: number, unit: QuranUnit): number {
  const v = clampUnitValue(value, unit);
  if (!v) return 0;
  switch (unit) {
    case "juz":
      if (v >= QURAN_MAX_JUZ) return clampFaces(QURAN_TOTAL_FACES);
      return clampFaces(v * QURAN_JUZ_FACES);
    case "hizb":
      if (v >= QURAN_MAX_HIZB) return clampFaces(QURAN_TOTAL_FACES);
      return clampFaces(v * 10);
    case "face":
    default:
      return clampFaces(v);
  }
}

/** O(1) — decompose absolute faces to elegant Arabic (respects juz 30 = 23 faces) */
export function formatFacesToText(faces: number): string {
  const total = clampFaces(Math.round(faces));
  if (total === 0) return "";
  if (total >= QURAN_TOTAL_FACES) return "30 جزء";

  const parts: string[] = [];

  if (total > QURAN_JUZ29_TOTAL_FACES) {
    const inJuz30 = total - QURAN_JUZ29_TOTAL_FACES;
    parts.push("29 أجزاء");
    const hizb = Math.floor(inJuz30 / 10);
    const remFaces = inJuz30 % 10;
    if (hizb > 0) parts.push(hizb === 1 ? "1 حزب" : `${hizb} أحزاب`);
    if (remFaces > 0) {
      parts.push(remFaces === 1 ? "1 وجه" : `${remFaces} أوجه`);
    }
    return parts.join(" و ");
  }

  const juz = Math.floor(total / QURAN_JUZ_FACES);
  const remaining = total % QURAN_JUZ_FACES;
  const hizb = Math.floor(remaining / 10);
  const remFaces = remaining % 10;

  if (juz > 0) parts.push(juz === 1 ? "1 جزء" : `${juz} أجزاء`);
  if (hizb > 0) parts.push(hizb === 1 ? "1 حزب" : `${hizb} أحزاب`);
  if (remFaces > 0) parts.push(remFaces === 1 ? "1 وجه" : `${remFaces} أوجه`);
  return parts.join(" و ");
}

/** O(1) — fractional juz equivalent (juz 30 weighted at 23 faces) */
export function facesToJuz(faces: number): number {
  const f = clampFaces(faces);
  if (f >= QURAN_TOTAL_FACES) return QURAN_MAX_JUZ;
  if (f <= QURAN_JUZ29_TOTAL_FACES) {
    return Math.round((f / QURAN_JUZ_FACES) * 100) / 100;
  }
  const inJuz30 = f - QURAN_JUZ29_TOTAL_FACES;
  return Math.round((29 + inJuz30 / QURAN_JUZ30_FACES) * 100) / 100;
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

  if (matched) return clampFaces(total);

  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? convertToFaces(Number(match[1]), "juz") : 0;
}

/** O(1) — pick largest clean unit for structured form defaults */
export function facesToStructuredInput(faces: number): {
  value: string;
  unit: QuranUnit;
} {
  const total = clampFaces(Math.round(faces));
  if (total === 0) return { value: "", unit: "face" };
  if (total >= QURAN_TOTAL_FACES) {
    return { value: String(QURAN_MAX_JUZ), unit: "juz" };
  }
  if (total > QURAN_JUZ29_TOTAL_FACES) {
    return { value: String(total), unit: "face" };
  }
  if (total % QURAN_JUZ_FACES === 0) {
    return { value: String(total / QURAN_JUZ_FACES), unit: "juz" };
  }
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
    const faces = clampFaces(explicitFaces);
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
      const faces = convertToFaces(n, unit);
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
