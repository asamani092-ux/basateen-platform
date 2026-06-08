export type StudentPlacementInput = {
  circleName?: string | null;
  trackName?: string | null;
  emptyLabel?: string;
};

/** O(1) — نص موحّد: حلقة فقط | مسار فقط | حلقة/مسار */
export function formatStudentPlacement(input: StudentPlacementInput): {
  text: string;
  title: string;
  isEmpty: boolean;
} {
  const circle = input.circleName?.trim() || null;
  const track = input.trackName?.trim() || null;
  const emptyLabel = input.emptyLabel ?? "غير مسند";

  if (circle && track) {
    const text = `${circle} / ${track}`;
    return { text, title: text, isEmpty: false };
  }
  if (circle) {
    return { text: circle, title: circle, isEmpty: false };
  }
  if (track) {
    return { text: track, title: track, isEmpty: false };
  }
  return { text: emptyLabel, title: emptyLabel, isEmpty: true };
}
