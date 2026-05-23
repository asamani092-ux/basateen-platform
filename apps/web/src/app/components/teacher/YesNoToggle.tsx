import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

export function YesNoToggle({ label, value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm" style={tajawal}>
        {label}
      </span>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={value ? "default" : "outline"}
          className={cn("min-w-[52px]", ds.btnRound)}
          disabled={disabled}
          onClick={() => onChange(true)}
          style={tajawal}
        >
          نعم
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!value ? "secondary" : "outline"}
          className={cn("min-w-[52px]", ds.btnRound)}
          disabled={disabled}
          onClick={() => onChange(false)}
          style={tajawal}
        >
          لا
        </Button>
      </div>
    </div>
  );
}
