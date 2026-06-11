"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "./utils";

export type QuranicUnit = "face" | "hizb" | "juz" | "line" | "ayah";

const UNIT_LABELS: Record<QuranicUnit, string> = {
  face: "وجه",
  hizb: "حزب",
  juz: "جزء",
  line: "سطر",
  ayah: "آية",
};

const UNITS: QuranicUnit[] = ["face", "hizb", "juz", "line", "ayah"];

type QuranicInputCellProps = {
  value: number;
  unit?: QuranicUnit;
  onValueChange: (value: number) => void;
  onUnitChange?: (unit: QuranicUnit) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
};

/** O(1) — حقل رقمي مدمج مع اختيار وحدة قرآنية (جوال أولاً). */
export function QuranicInputCell({
  value,
  unit = "face",
  onValueChange,
  onUnitChange,
  disabled,
  min = 0,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: QuranicInputCellProps) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return (
    <div
      dir="rtl"
      className={cn(
        "flex items-stretch overflow-hidden rounded-xl border border-input bg-input-background shadow-none transition-colors focus-within:ring-2 focus-within:ring-ring/50",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        disabled={disabled}
        value={safeValue}
        onChange={(e) => onValueChange(Number(e.target.value) || 0)}
        aria-label={ariaLabel}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-3 text-center text-sm tabular-nums text-foreground outline-none"
      />
      <Select
        value={unit}
        onValueChange={(v) => onUnitChange?.(v as QuranicUnit)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-9 w-[4.75rem] shrink-0 rounded-none border-0 border-r border-input bg-secondary/40 px-2 text-xs font-medium text-secondary-foreground focus:ring-0 focus-visible:ring-0"
          aria-label="وحدة القياس"
        >
          <SelectValue>{UNIT_LABELS[unit]}</SelectValue>
        </SelectTrigger>
        <SelectContent dir="rtl" align="end">
          {UNITS.map((u) => (
            <SelectItem key={u} value={u} className="text-sm">
              {UNIT_LABELS[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
