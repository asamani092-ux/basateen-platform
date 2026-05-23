import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { arSA } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  maxDate?: string;
  className?: string;
};

export function DatePickerField({ value, onChange, maxDate, className }: Props) {
  const selected = useMemo(() => {
    try {
      return parseISO(value);
    } catch {
      return new Date();
    }
  }, [value]);

  const max = maxDate ? parseISO(maxDate) : new Date();
  const label = format(selected, "EEEE d MMMM yyyy", { locale: arSA });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between gap-2 h-11 px-4",
            ds.btnRound,
            className,
          )}
          style={tajawal}
        >
          <span className="truncate">{label}</span>
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, "yyyy-MM-dd"));
          }}
          disabled={(d) => d > max}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
