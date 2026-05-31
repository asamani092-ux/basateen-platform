import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
  /** معرّف لمنع إغلاق Dialog عند التفاعل مع القائمة */
  id?: string;
};

/**
 * بحث طلاب حي — حقل إدخال + قائمة (بدون Popover) ليعمل داخل Dialog دون focus trap.
 */
export function AdminStudentSearchCombobox({
  value,
  onChange,
  disabled,
  placeholder = "اكتب اسم الطالب للبحث…",
  id = "admin-student-search",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminStudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminStudentOption | null>(null);

  const syncSelected = useCallback(async (id: number) => {
    if (!canUseApi()) return;
    try {
      const detail = await api.studentDetail(id);
      const hit: AdminStudentOption = {
        id: detail.student.id,
        full_name_ar: detail.student.full_name_ar,
        circle_name: detail.current?.circle_name ?? null,
      };
      setSelected(hit);
      setQuery(hit.full_name_ar);
    } catch {
      /* keep placeholder id */
    }
  }, []);

  useEffect(() => {
    if (value == null) {
      setSelected(null);
      if (!open) setQuery("");
      return;
    }
    if (selected?.id === value) return;
    void syncSelected(value);
  }, [value, selected?.id, open, syncSelected]);

  useEffect(() => {
    if (!canUseApi()) {
      setItems([]);
      return;
    }
    const q = query.trim();
    if (!open || q.length < 1) {
      setItems([]);
      return;
    }
    if (selected && q === selected.full_name_ar) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.adminDeptStudentsSearch(q);
        setItems(res.items);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, open, selected]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      if (selected) setQuery(selected.full_name_ar);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected]);

  function pick(student: AdminStudentOption) {
    setSelected(student);
    setQuery(student.full_name_ar);
    onChange(student.id, student);
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    setSelected(null);
    setQuery("");
    onChange(null);
    setItems([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleInputChange(text: string) {
    setQuery(text);
    setOpen(true);
    if (selected && text !== selected.full_name_ar) {
      setSelected(null);
      onChange(null);
    }
  }

  const showList =
    open &&
    !disabled &&
    (loading || items.length > 0 || (query.trim().length > 0 && !selected));

  return (
    <div
      ref={rootRef}
      id={id}
      data-student-search-root=""
      className="relative w-full space-y-1"
    >
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("flex-1 text-right", ds.btnRound)}
          style={tajawal}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "Enter" && items.length === 1 && open) {
              e.preventDefault();
              pick(items[0]);
            }
          }}
        />
        {value != null && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("shrink-0", ds.btnRound)}
            disabled={disabled}
            onClick={clear}
            title="مسح"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showList && (
        <div
          className="absolute z-[9999] mt-1 w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg max-h-56 overflow-y-auto overscroll-contain pointer-events-auto"
          role="listbox"
          data-student-search-list=""
          onPointerDown={(e) => e.preventDefault()}
        >
          {loading && (
            <p
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
              style={tajawal}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري البحث…
            </p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground" style={tajawal}>
              لا يوجد طالب مطابق
            </p>
          )}
          {!loading &&
            items.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                className="w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
                style={tajawal}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(s);
                }}
              >
                <span className="font-medium">{s.full_name_ar}</span>
                {s.circle_name && (
                  <span className="text-xs text-muted-foreground mr-2">
                    — {s.circle_name}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
