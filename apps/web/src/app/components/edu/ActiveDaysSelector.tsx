import {
  DEFAULT_ACTIVE_WEEKDAYS,
  WEEKDAY_OPTIONS,
} from "../../lib/competition-engine";
import { tajawal } from "../../lib/design-system";

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
};

/** أيام التسميع — خانات اختيار من الأحد إلى السبت */
export function ActiveDaysSelector({ value, onChange, disabled }: Props) {
  const selected = new Set(value);

  function toggle(day: number) {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    if (next.size === 0) return;
    onChange([...next].sort((a, b) => a - b));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" style={tajawal}>
        أيام التسميع
      </p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              selected.has(opt.value)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-background text-muted-foreground"
            }`}
            style={tajawal}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" style={tajawal}>
        يُحسب مقدار الحفظ اليومي على عدد أيام التسميع المفعّلة فقط (افتراضياً الأحد–الخميس).
      </p>
    </div>
  );
}

export function defaultActiveWeekdaysState(): number[] {
  return [...DEFAULT_ACTIVE_WEEKDAYS];
}
