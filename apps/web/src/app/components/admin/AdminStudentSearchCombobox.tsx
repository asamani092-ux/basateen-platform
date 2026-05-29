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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

export type AdminStudentOption = {
  id: number;
  full_name_ar: string;
  circle_name: string | null;
};

type Props = {
  value: number | null;
  onChange: (studentId: number | null, student?: AdminStudentOption) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function AdminStudentSearchCombobox({
  value,
  onChange,
  disabled,
  placeholder = "ابحث باسم الطالب…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminStudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }
    const found = items.find((s) => s.id === value);
    if (found) setSelectedLabel(found.full_name_ar);
  }, [value, items]);

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
        const res = await api.adminDeptStudentsSearch(q);
        setItems(res.items);
        if (value) {
          const hit = res.items.find((s) => s.id === value);
          if (hit) setSelectedLabel(hit.full_name_ar);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, value]);

  function pick(student: AdminStudentOption) {
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
    selectedLabel || (value ? `طالب #${value}` : placeholder);

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
            "w-full justify-between font-normal text-right",
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
                      "ml-2 h-4 w-4",
                      value === s.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span style={tajawal}>{s.full_name_ar}</span>
                  {s.circle_name && (
                    <span className="text-xs text-muted-foreground mr-2">
                      — {s.circle_name}
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
