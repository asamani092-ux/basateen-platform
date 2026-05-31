/** المراحل التعليمية الأربع — مصدر واحد للواجهة والـ API */

export type StageId = 1 | 2 | 3 | 4;

export const SCOPE_GLOBAL = "global" as const;

export const EDUCATIONAL_STAGES: ReadonlyArray<{
  id: StageId;
  name_ar: string;
}> = [
  { id: 1, name_ar: "تلقين" },
  { id: 2, name_ar: "ابتدائي" },
  { id: 3, name_ar: "متوسط" },
  { id: 4, name_ar: "ثانوي" },
];

/** قائمة مبسطة (مشرف عام — استمارة القبول) */
export const STAGE_OPTIONS = EDUCATIONAL_STAGES.map((s) => ({
  id: s.id,
  label: s.name_ar,
}));

export const SUPERVISOR_TYPES = [
  { value: "edu_supervisor", label: "مشرف تعليمي" },
  { value: "programs_supervisor", label: "مشرف برامج" },
  { value: "general_supervisor", label: "مشرف عام" },
] as const;

export function stageLabel(
  id: StageId | number | string | null | undefined,
): string {
  if (id == null || id === "") return "—";
  if (id === SCOPE_GLOBAL || id === "global") return "كل المجمع";
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isFinite(n)) return String(id);
  return EDUCATIONAL_STAGES.find((s) => s.id === n)?.name_ar ?? String(id);
}
