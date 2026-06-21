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
    activeClass:
      "bg-emerald-600 text-white hover:bg-emerald-600/90 border-emerald-600 ring-2 ring-emerald-500/80 dark:bg-emerald-600 dark:border-emerald-500 dark:hover:bg-emerald-600/90",
    idleClass:
      "border-emerald-500/45 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/40 dark:hover:bg-emerald-500/15",
  },
  {
    value: "excused",
    label: "مستأذن",
    activeVariant: "default",
    idleVariant: "outline",
    activeClass:
      "bg-amber-500 text-white hover:bg-amber-500/90 border-amber-500 ring-2 ring-amber-500/80 dark:bg-amber-500 dark:border-amber-400",
    idleClass:
      "border-amber-500/45 text-amber-800 hover:bg-amber-500/12 dark:text-amber-200 dark:border-amber-400/40 dark:hover:bg-amber-500/15",
  },
  {
    value: "absent",
    label: "غائب",
    activeVariant: "destructive",
    idleVariant: "outline",
    activeClass:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive ring-2 ring-destructive/50",
    idleClass:
      "border-destructive/45 text-destructive hover:bg-destructive/10 dark:border-destructive/50 dark:text-red-300 dark:hover:bg-destructive/15",
  },
];

type Props = {
  value: string;
  onChange: (status: Status) => void;
  disabled?: boolean;
  /** عند false لا يُظهر زر «حاضر» نشطاً قبل الاعتماد */
  highlightSaved?: boolean;
};

export function AttendanceStatusButtons({
  value,
  onChange,
  disabled,
  highlightSaved = true,
}: Props) {
  return (
    <div className="inline-flex flex-nowrap items-center justify-end gap-1 shrink-0">
      {OPTIONS.map((opt) => {
        const isActive = highlightSaved && value === opt.value;
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
