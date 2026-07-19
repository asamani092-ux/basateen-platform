import { Check, Minus, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../ui/utils";
import {
  defaultInputTypeFromTaskType,
  parseIntegerInputValue,
  type TaskInputType,
} from "../../lib/competition-engine";

export type TaskInputCol = {
  id: number;
  name_ar: string;
  weight: number;
  type: "addition" | "deduction";
  input_type?: TaskInputType | string | null;
};

export function resolveTaskInputType(task: TaskInputCol): TaskInputType {
  const raw = task.input_type;
  if (raw === "boolean" || raw === "numeric" || raw === "counter") return raw;
  return defaultInputTypeFromTaskType(task.type);
}

type Props = {
  task: TaskInputCol;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

/** O(1) render — renders boolean | numeric | counter per task input_type. */
export function TaskInputCell({
  task,
  value,
  onChange,
  disabled,
  compact,
}: Props) {
  const inputType = resolveTaskInputType(task);
  /** مهام قديمة: إضافة + counter تُعرض كإدخال رقمي مباشر */
  const effectiveType: TaskInputType =
    task.type === "addition" && inputType === "counter" ? "numeric" : inputType;
  /** بصرياً أصغر مع هدف لمس ≥ 44px عبر منطقة الضغط */
  const btnClass = compact
    ? "h-7 w-7 min-h-11 min-w-11 rounded-lg p-0"
    : "h-8 w-8 min-h-11 min-w-11 rounded-lg p-0";
  const iconClass = compact ? "size-3" : "size-3.5";

  if (effectiveType === "boolean") {
    const checked = value > 0;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={task.name_ar}
          disabled={disabled}
          onClick={() => onChange(checked ? 0 : 1)}
          className={cn(
            "inline-flex h-7 w-7 min-h-11 min-w-11 items-center justify-center rounded-md border transition-colors touch-manipulation",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background text-muted-foreground hover:border-primary/40",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Check
            className={cn(
              "size-3.5 transition-opacity",
              checked ? "opacity-100" : "opacity-0",
            )}
            strokeWidth={2.5}
          />
        </button>
        {checked && (
          <span className="text-[10px] text-success tabular-nums">+{task.weight}</span>
        )}
      </div>
    );
  }

  if (effectiveType === "numeric") {
    const display = Number.isFinite(value) && Number.isInteger(value) ? String(value) : "0";
    return (
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={display}
        onChange={(e) => {
          const parsed = parseIntegerInputValue(e.target.value);
          if (parsed != null) onChange(parsed);
        }}
        className={`h-8 w-16 mx-auto text-center text-sm tabular-nums ${compact ? "" : "max-w-[5.5rem]"}`}
        aria-label={task.name_ar}
      />
    );
  }

  const count = Math.max(0, Math.round(value));
  const totalPenalty = count * task.weight;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center justify-center gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={btnClass}
          disabled={disabled || count <= 0}
          onClick={() => onChange(count - 1)}
          aria-label="إنقاص"
        >
          <Minus className={iconClass} />
        </Button>
        <span
          className={`text-center font-semibold tabular-nums ${compact ? "w-5 text-xs" : "w-6 text-sm"}`}
        >
          {count}
        </span>
        <Button
          type="button"
          size="icon"
          className={btnClass}
          disabled={disabled}
          onClick={() => onChange(count + 1)}
          aria-label="زيادة"
        >
          <Plus className={iconClass} />
        </Button>
      </div>
      {count > 0 && task.type === "deduction" && (
        <span className="text-[10px] text-destructive tabular-nums">−{totalPenalty}</span>
      )}
    </div>
  );
}
