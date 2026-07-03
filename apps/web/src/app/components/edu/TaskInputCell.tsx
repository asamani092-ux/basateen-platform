import { Minus, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  defaultInputTypeFromTaskType,
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
  const btnClass = compact ? "h-7 w-7 rounded-full" : "h-12 w-12 rounded-full";
  const iconClass = compact ? "w-3 h-3" : "w-6 h-6";

  if (inputType === "boolean") {
    const checked = value > 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="size-5 rounded border-border cursor-pointer disabled:opacity-50"
          aria-label={task.name_ar}
        />
        {checked && (
          <span className="text-[10px] text-success tabular-nums">+{task.weight}</span>
        )}
      </div>
    );
  }

  if (inputType === "numeric") {
    return (
      <Input
        type="number"
        min={0}
        step={0.1}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`h-8 w-20 mx-auto text-center text-sm tabular-nums ${compact ? "" : "max-w-[6rem]"}`}
        aria-label={task.name_ar}
      />
    );
  }

  const count = Math.max(0, Math.round(value));
  const totalPenalty = count * task.weight;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-1">
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
          className={`text-center font-semibold tabular-nums ${compact ? "w-6 text-sm" : "w-10 text-2xl"}`}
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
