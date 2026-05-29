import { Search } from "lucide-react";
import { Input } from "../ui/input";
import { ds, tajawal } from "../../lib/design-system";

type CircleOption = { value: string; label: string };

type Props = {
  nameQuery: string;
  onNameQueryChange: (v: string) => void;
  groupLabel: string;
  groupValue: string;
  onGroupChange: (v: string) => void;
  groupOptions: CircleOption[];
  shownCount: number;
  totalCount: number;
  hiddenDirty?: number;
  /** إخفاء قائمة التجميع (مثلاً عند فلترة الحلقة مسبقاً) */
  hideGroupFilter?: boolean;
};

export function AttendanceFilterBar({
  nameQuery,
  onNameQueryChange,
  groupLabel,
  groupValue,
  onGroupChange,
  groupOptions,
  shownCount,
  totalCount,
  hiddenDirty = 0,
  hideGroupFilter = false,
}: Props) {
  return (
    <div className={`${ds.card} p-4 space-y-3`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="بحث بالاسم…"
            value={nameQuery}
            onChange={(e) => onNameQueryChange(e.target.value)}
            className={`${ds.btnRound} pr-10`}
            style={tajawal}
          />
        </div>
        {!hideGroupFilter && (
          <div className="sm:w-56">
            <label className="text-xs text-muted-foreground block mb-1" style={tajawal}>
              {groupLabel}
            </label>
            <select
              value={groupValue}
              onChange={(e) => onGroupChange(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-background"
              style={tajawal}
            >
              <option value="">الكل</option>
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground" style={tajawal}>
        يعرض {shownCount} من {totalCount}
        {hiddenDirty > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            {" "}
            — {hiddenDirty} تغيير غير معتمد خارج الفلتر
          </span>
        )}
      </p>
    </div>
  );
}
