import { useMemo, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
import { ds, tajawal } from "../../lib/design-system";

export type AttendanceRow = {
  id: number;
  title: string;
  subtitle?: string;
  status: string;
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
              <AttendanceStatusButtons
                value={r.status}
                disabled={committing}
                onChange={(st) => onStatusPick(r.id, st)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
