import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../ui/utils";
import { matchesArabicName } from "../../lib/attendance-search";
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
  markedToday?: Set<string>;
  disabled?: boolean;
  placeholder?: string;
};

function entityLabel(entity: AttendanceEntityOption): string {
  return `${entity.name_ar} (${entity.type === "circle" ? "حلقة" : "مسار"})`;
}

export function AttendanceEntityCombobox({
  value,
  onChange,
  circles,
  tracks,
  markedToday,
  disabled,
  placeholder = "ابحث عن حلقة أو مسار…",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

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

  const filteredCircles = useMemo(
    () => circles.filter((c) => matchesArabicName(query, c.name_ar)),
    [circles, query],
  );
  const filteredTracks = useMemo(
    () => tracks.filter((t) => matchesArabicName(query, t.name_ar)),
    [tracks, query],
  );
  const hasResults = filteredCircles.length > 0 || filteredTracks.length > 0;

  useEffect(() => {
    if (value) {
      setQuery(entityLabel(value));
      return;
    }
    if (!open) setQuery("");
  }, [value, open]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      if (value) setQuery(entityLabel(value));
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [value]);

  function pick(entity: AttendanceEntityOption) {
    onChange(entity);
    setQuery(entityLabel(entity));
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleInputChange(text: string) {
    setQuery(text);
    setOpen(true);
    if (value && text !== entityLabel(value)) onChange(null);
  }

  const showList = open && !disabled;

  return (
    <div ref={rootRef} className="relative w-full" data-attendance-entity-search-root="">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          disabled={disabled}
          readOnly={false}
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
            if (e.key === "Enter" && options.length === 1 && open) {
              e.preventDefault();
              pick(options[0]);
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
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("shrink-0", ds.btnRound)}
          disabled={disabled}
          aria-label="فتح القائمة"
          onClick={() => {
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
        >
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </div>

      {showList && (
        <div
          className="absolute z-[9999] mt-1 w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg max-h-56 overflow-y-auto overscroll-contain pointer-events-auto"
          role="listbox"
          data-attendance-entity-search-list=""
          onPointerDown={(e) => e.preventDefault()}
        >
          {!hasResults ? (
            <p className="px-3 py-2 text-sm text-muted-foreground" style={tajawal}>
              لا توجد نتائج
            </p>
          ) : (
            <>
              {filteredCircles.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground" style={tajawal}>
                  الحلقات
                </div>
              )}
              {filteredCircles.map((c) => {
                const marked = markedToday?.has(`circle:${c.id}`);
                return (
                <button
                  key={`circle:${c.id}`}
                  type="button"
                  role="option"
                  aria-selected={value?.type === "circle" && value.id === c.id}
                  className={cn(
                    "w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0",
                    marked && "bg-emerald-500/10",
                  )}
                  style={tajawal}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick({ type: "circle", id: c.id, name_ar: c.name_ar });
                  }}
                >
                  <span
                    className={cn(
                      "font-medium truncate block",
                      marked && "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {marked ? "● " : null}
                    {c.name_ar}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {marked ? "محضّر اليوم — " : ""}حلقة
                  </span>
                </button>
              );
              })}
              {filteredTracks.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground" style={tajawal}>
                  المسارات
                </div>
              )}
              {filteredTracks.map((t) => {
                const marked = markedToday?.has(`track:${t.id}`);
                return (
                <button
                  key={`track:${t.id}`}
                  type="button"
                  role="option"
                  aria-selected={value?.type === "track" && value.id === t.id}
                  className={cn(
                    "w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0",
                    marked && "bg-emerald-500/10",
                  )}
                  style={tajawal}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick({ type: "track", id: t.id, name_ar: t.name_ar });
                  }}
                >
                  <span
                    className={cn(
                      "font-medium truncate block",
                      marked && "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {marked ? "● " : null}
                    {t.name_ar}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {marked ? "محضّر اليوم — " : ""}مسار
                  </span>
                </button>
              );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
