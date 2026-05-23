import { Minus, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  disabled?: boolean;
};

export function CounterField({
  label,
  value,
  onChange,
  max = 99,
  disabled,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground" style={tajawal}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn("size-8", ds.btnRound)}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn("size-8", ds.btnRound)}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
