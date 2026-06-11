import { formatActiveDayLabel } from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  activeDates: string[];
  selectedDate: string;
  onSelect: (isoDate: string) => void;
  disabled?: boolean;
};

/** أزرار أيام التسميع النشطة فقط — بدون أيام الإجازة */
export function ActiveDayTabs({ activeDates, selectedDate, onSelect, disabled }: Props) {
  if (!activeDates.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {activeDates.map((iso, idx) => (
        <button
          key={iso}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(iso)}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            selectedDate === iso
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border bg-background"
          }`}
          style={tajawal}
          title={iso}
        >
          {formatActiveDayLabel(idx + 1, iso)}
        </button>
      ))}
    </div>
  );
}
