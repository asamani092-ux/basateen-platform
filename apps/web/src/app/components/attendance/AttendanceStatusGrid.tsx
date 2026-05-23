import { useMemo, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { ds, tajawal } from "../../lib/design-system";

export type AttendanceRow = {
  id: number;
  title: string;
  subtitle?: string;
  status: string;
};

const STATUS_UI: Record<
  string,
  { label: string; active: string; idle: string }
> = {
  present: {
    label: "حاضر",
    active: "bg-primary text-primary-foreground ring-2 ring-primary",
    idle: "bg-primary/15 text-primary border border-primary/30",
  },
  absent: {
    label: "غائب",
    active: "bg-destructive text-destructive-foreground ring-2 ring-destructive",
    idle: "bg-destructive/10 text-destructive border border-destructive/30",
  },
  excused: {
    label: "معتذر",
    active: "bg-amber-600 text-white ring-2 ring-amber-600",
    idle: "bg-amber-50 text-amber-900 border border-amber-300",
  },
};

type Props = {
  /** كل الصفوف (لحساب التغييرات غير المعتمدة) */
  rows: AttendanceRow[];
  /** صفوف العرض بعد الفلتر — الافتراضي: rows */
  visibleRows?: AttendanceRow[];
  loading: boolean;
  date: string;
  onDateChange: (date: string) => void;
  onStatusPick: (id: number, status: string) => void;
  onCommit: () => void;
  committing: boolean;
  savedBaseline: Record<number, string>;
  commitLabel?: string;
  hint?: string;
  filterSlot?: ReactNode;
};

export function AttendanceStatusGrid({
  rows,
  visibleRows,
  loading,
  date,
  onDateChange,
  onStatusPick,
  onCommit,
  committing,
  savedBaseline,
  commitLabel = "اعتماد التحضير",
  hint,
  filterSlot,
}: Props) {
  const display = visibleRows ?? rows;
  const dirtyCount = useMemo(
    () =>
      rows.filter((r) => (savedBaseline[r.id] ?? "present") !== r.status).length,
    [rows, savedBaseline],
  );

  return (
    <div className="space-y-4">
      {hint && (
        <p className={ds.alert.info} style={tajawal}>
          {hint}
        </p>
      )}

      {filterSlot}

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground" style={tajawal}>
            تاريخ التحضير
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="block w-full max-w-xs rounded-xl border border-border px-3 py-2 mt-1"
          />
        </div>
        <Button
          type="button"
          className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
          disabled={committing || dirtyCount === 0 || loading}
          onClick={onCommit}
          style={tajawal}
        >
          <CheckCircle2 className="w-4 h-4" />
          {committing ? "جاري الاعتماد…" : commitLabel}
          {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm" style={tajawal}>
          جاري التحميل…
        </p>
      ) : display.length === 0 ? (
        <p className={ds.alert.info} style={tajawal}>
          لا توجد سجلات تطابق البحث — غيّر الفلتر أو اسم البحث.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {display.map((r) => (
            <div key={r.id} className={`${ds.card} p-4 space-y-3`}>
              <div>
                <p className="font-semibold text-base" style={tajawal}>
                  {r.title}
                </p>
                {r.subtitle && (
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    {r.subtitle}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["present", "absent", "excused"] as const).map((st) => {
                  const ui = STATUS_UI[st];
                  const isActive = r.status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={committing}
                      onClick={() => onStatusPick(r.id, st)}
                      className={`min-w-[4.5rem] h-11 px-4 rounded-full text-sm font-medium transition touch-manipulation ${isActive ? ui.active : ui.idle}`}
                      style={tajawal}
                    >
                      {ui.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
