import { useEffect, useState } from "react";
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
import { api, type StudentRow } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../ui/utils";
import { formatStudentPlacement } from "../../lib/student-placement-display";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  value: number | null;
  onChange: (studentId: number | null, student?: StudentRow) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function StudentSearchSelect({
  value,
  onChange,
  disabled,
  placeholder = "ابحث باسم الطالب…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    if (!canUseApi() || !value) {
      setSelectedLabel("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await api.studentDetail(value);
        if (!cancelled) setSelectedLabel(detail.student.full_name_ar);
      } catch {
        if (!cancelled) setSelectedLabel("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!canUseApi()) {
      setItems([]);
      return;
    }
    const q = query.trim();
    if (q.length < 1) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.students(q);
        setItems(res.items);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function pick(student: StudentRow) {
    onChange(student.id, student);
    setSelectedLabel(student.full_name_ar);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null);
    setSelectedLabel("");
  }

  const display =
    selectedLabel ||
    (value ? `طالب #${value}` : placeholder);

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
          <span className="truncate">{display}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="اكتب جزءاً من الاسم…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty style={tajawal}>
              {loading
                ? "جاري البحث…"
                : query.trim()
                  ? "لا يوجد طالب مطابق"
                  : "ابدأ الكتابة للبحث"}
            </CommandEmpty>
            <CommandGroup>
              {items.map((s) => (
                <CommandItem
                  key={s.id}
                  value={String(s.id)}
                  onSelect={() => pick(s)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === s.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate block" style={tajawal}>
                    {s.full_name_ar}
                  </span>
                  {(s.circle_name || s.track_name) && (
                    <span className="text-xs text-muted-foreground mr-2 truncate block">
                      {
                        formatStudentPlacement({
                          circleName: s.circle_name,
                          trackName: s.track_name,
                          emptyLabel: "—",
                        }).text
                      }
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {value != null && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={clear}
              style={tajawal}
            >
              مسح الاختيار
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
