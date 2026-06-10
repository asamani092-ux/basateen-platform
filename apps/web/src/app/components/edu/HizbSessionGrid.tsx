import { tajawal } from "../../lib/design-system";

type Props = {
  totalHizbs: number;
  activeHizb: number | null;
  completedHizbs?: Set<number>;
  onSelect: (hizbIndex: number) => void;
};

/** O(H) render — H = total hizb count (typically ≤ 60). */
export function HizbSessionGrid({
  totalHizbs,
  activeHizb,
  completedHizbs,
  onSelect,
}: Props) {
  const count = Math.max(1, Math.round(totalHizbs));
  const items = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(3.25rem, 1fr))",
      }}
    >
      {items.map((hizb) => {
        const done = completedHizbs?.has(hizb);
        const active = activeHizb === hizb;
        return (
          <button
            key={hizb}
            type="button"
            onClick={() => onSelect(hizb)}
            className={`min-h-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors touch-manipulation ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : done
                  ? "bg-emerald-500/15 text-emerald-800 border-emerald-500/40"
                  : "bg-card hover:bg-muted border-border"
            }`}
            style={tajawal}
          >
            {hizb}
          </button>
        );
      })}
    </div>
  );
}
