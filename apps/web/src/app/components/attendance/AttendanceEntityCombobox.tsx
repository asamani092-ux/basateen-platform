import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

export type AttendanceEntityOption = {
  type: "circle" | "track";
  id: number;
  name_ar: string;
};

type Props = {
  value: AttendanceEntityOption | null;
  onChange: (entity: AttendanceEntityOption | null) => void;
  circles: Array<{ id: number; name_ar: string }>;
  tracks: Array<{ id: number; name_ar: string }>;
  disabled?: boolean;
  placeholder?: string;
};

export function AttendanceEntityCombobox({
  value,
  onChange,
  circles,
  tracks,
  disabled,
  placeholder = "ابحث عن حلقة أو مسار…",
}: Props) {
  const [open, setOpen] = useState(false);

  const options = useMemo<AttendanceEntityOption[]>(
    () => [
      ...circles.map((c) => ({
        type: "circle" as const,
        id: c.id,
        name_ar: c.name_ar,
      })),
      ...tracks.map((t) => ({
        type: "track" as const,
        id: t.id,
        name_ar: t.name_ar,
      })),
    ],
    [circles, tracks],
  );

  const selectedKey = value ? `${value.type}:${value.id}` : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            ds.btnRound,
            !value && "text-muted-foreground",
          )}
          style={tajawal}
        >
          <span className="truncate">
            {value
              ? `${value.name_ar} (${value.type === "circle" ? "حلقة" : "مسار"})`
              : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث بالاسم…" style={tajawal} />
          <CommandList>
            <CommandEmpty style={tajawal}>لا توجد نتائج</CommandEmpty>
            <CommandGroup heading="الحلقات">
              {circles.map((c) => {
                const key = `circle:${c.id}`;
                return (
                  <CommandItem
                    key={key}
                    value={`${c.name_ar} حلقة`}
                    onSelect={() => {
                      onChange({ type: "circle", id: c.id, name_ar: c.name_ar });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4",
                        selectedKey === key ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span style={tajawal}>{c.name_ar}</span>
                    <span className="text-xs text-muted-foreground mr-2">حلقة</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandGroup heading="المسارات">
              {tracks.map((t) => {
                const key = `track:${t.id}`;
                return (
                  <CommandItem
                    key={key}
                    value={`${t.name_ar} مسار`}
                    onSelect={() => {
                      onChange({ type: "track", id: t.id, name_ar: t.name_ar });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4",
                        selectedKey === key ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span style={tajawal}>{t.name_ar}</span>
                    <span className="text-xs text-muted-foreground mr-2">مسار</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
