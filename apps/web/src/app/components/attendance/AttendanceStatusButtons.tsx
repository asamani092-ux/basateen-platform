import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { tajawal } from "../../lib/design-system";

type Status = "present" | "absent" | "excused";

const OPTIONS: Array<{
  value: Status;
  label: string;
  activeClass: string;
  idleClass: string;
  activeVariant: "default" | "destructive";
  idleVariant: "outline";
}> = [
  {
    value: "present",
    label: "حاضر",
    activeVariant: "default",
    idleVariant: "outline",
    activeClass: "",
    idleClass: "border-primary/40 text-primary hover:bg-primary/10",
  },
  {
    value: "excused",
    label: "مستأذن",
    activeVariant: "default",
    idleVariant: "outline",
    activeClass:
      "bg-amber-500 text-white hover:bg-amber-500/90 border-amber-500 ring-2 ring-amber-500",
    idleClass:
      "border-amber-500/40 text-foreground hover:bg-amber-500/15",
  },
  {
    value: "absent",
    label: "غائب",
    activeVariant: "destructive",
    idleVariant: "outline",
    activeClass: "",
    idleClass: "border-destructive/40 text-destructive hover:bg-destructive/10",
  },
];

type Props = {
  value: string;
  onChange: (status: Status) => void;
  disabled?: boolean;
};

export function AttendanceStatusButtons({ value, onChange, disabled }: Props) {
  return (
    <div className="inline-flex flex-nowrap items-center justify-end gap-1 shrink-0">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={isActive ? opt.activeVariant : opt.idleVariant}
            disabled={disabled}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap shrink-0",
              isActive ? opt.activeClass : opt.idleClass,
            )}
            style={tajawal}
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
