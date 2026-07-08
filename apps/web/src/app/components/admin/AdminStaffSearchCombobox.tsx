import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

export type AdminStaffOption = {
  id: number;
  full_name_ar: string;
  role: string | null;
};

type Props = {
  value: number | null;
  onChange: (staffId: number | null, staff?: AdminStaffOption) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
};

export function AdminStaffSearchCombobox({
  value,
  onChange,
  disabled,
  placeholder = "اكتب اسم المنسوب للبحث…",
  id = "admin-staff-search",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<AdminStaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminStaffOption | null>(null);

  useEffect(() => {
    if (!canUseApi()) return;
    setLoading(true);
    api
      .adminDeptStaff()
      .then((res) => {
        setRoster(
          (res.items ?? []).map((r) => ({
            id: r.user_id,
            full_name_ar: r.full_name_ar,
            role: r.role ?? null,
          })),
        );
      })
      .catch(() => setRoster([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = roster.filter((r) => {
    const q = query.trim();
    if (!q) return true;
    return r.full_name_ar.includes(q);
  });

  const syncSelected = useCallback(
    (staffId: number) => {
      const hit = roster.find((r) => r.id === staffId);
      if (hit) {
        setSelected(hit);
        setQuery(hit.full_name_ar);
      }
    },
    [roster],
  );

  useEffect(() => {
    if (value == null) {
      setSelected(null);
      if (!open) setQuery("");
      return;
    }
    if (selected?.id === value) return;
    syncSelected(value);
  }, [value, selected?.id, open, syncSelected]);

  return (
    <div ref={rootRef} className="relative" data-staff-search-root id={id}>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected && e.target.value !== selected.full_name_ar) {
              setSelected(null);
              onChange(null);
            }
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled || loading}
          placeholder={loading ? "جاري تحميل المنسوبين…" : placeholder}
          className={ds.field}
          style={tajawal}
          autoComplete="off"
        />
        {value != null && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={ds.btnRound}
            disabled={disabled}
            onClick={() => {
              setSelected(null);
              setQuery("");
              onChange(null);
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {open && !disabled && (
        <ul
          data-staff-search-list
          className={cn(
            "absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-popover shadow-md py-1",
          )}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground" style={tajawal}>
              {loading ? "جاري التحميل…" : "لا توجد نتائج"}
            </li>
          ) : (
            filtered.slice(0, 30).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-right px-3 py-2 text-sm hover:bg-muted"
                  style={tajawal}
                  onClick={() => {
                    setSelected(r);
                    setQuery(r.full_name_ar);
                    setOpen(false);
                    onChange(r.id, r);
                  }}
                >
                  {r.full_name_ar}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
