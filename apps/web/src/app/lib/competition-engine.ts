export type CompetitionCategory =
  | "recitation"
  | "review"
  | "new_memorization"
  | "other";

export type TargetScope = {
  circle_ids: number[];
  track_ids: number[];
  stage_ids: number[];
};

export type PreviewStudent = {
  student_id: number;
  full_name_ar: string;
  circle_name: string | null;
  stage_id: number | null;
  current_memorization: number;
  memorization_amount: string | null;
};

export type StudentTargetRow = {
  student_id: number;
  full_name_ar: string;
  current_memorization: number;
  target_amount: number;
};

export const COMPETITION_CATEGORIES: Array<{
  value: CompetitionCategory;
  label: string;
}> = [
  { value: "recitation", label: "سرد" },
  { value: "review", label: "مراجعة" },
  { value: "new_memorization", label: "حفظ جديد" },
  { value: "other", label: "أخرى" },
];

/** مراحل الاستهداف في المنافسات — ابتدائي، متوسط، ثانوي فقط */
export const COMPETITION_STAGE_OPTIONS = [
  { id: 2, label: "ابتدائي" },
  { id: 3, label: "متوسط" },
  { id: 4, label: "ثانوي" },
] as const;

export function categoryLabel(
  category: string | undefined,
  custom?: string | null,
): string {
  if (category === "other" && custom?.trim()) return custom.trim();
  return (
    COMPETITION_CATEGORIES.find((c) => c.value === category)?.label ?? category ?? "—"
  );
}

export function isAdditiveCategory(category: CompetitionCategory): boolean {
  return category === "new_memorization";
}

export function defaultTargetForCategory(
  category: CompetitionCategory,
  currentMemorization: number,
): number {
  if (isAdditiveCategory(category)) return 1;
  return currentMemorization;
}
