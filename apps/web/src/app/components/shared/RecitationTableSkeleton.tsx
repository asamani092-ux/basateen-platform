import { Skeleton } from "../ui/skeleton";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  /** Show filter-bar placeholders (date / circle / track) */
  showFilters?: boolean;
  rows?: number;
  columns?: number;
};

/** Skeleton for daily recitation grid / card loading states */
export function RecitationTableSkeleton({
  showFilters = true,
  rows = 6,
  columns = 5,
}: Props) {
  return (
    <div className="space-y-4" dir="rtl" role="status" aria-live="polite">
      {showFilters && (
        <div className={`${ds.card} p-4 flex flex-col md:flex-row flex-wrap gap-4`}>
          <Skeleton className="h-9 w-full md:max-w-xs rounded-xl" />
          <Skeleton className="h-9 w-full md:max-w-xs rounded-xl" />
        </div>
      )}
      <div className={`${ds.card} p-4 space-y-3 overflow-hidden`}>
        <div className="hidden md:flex gap-3 border-b border-border pb-3">
          <Skeleton className="h-4 w-24 rounded-md" />
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 rounded-md" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-3 items-center py-1">
            <Skeleton className="h-8 w-28 shrink-0 rounded-lg" />
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton key={col} className="h-8 flex-1 rounded-lg" />
            ))}
          </div>
        ))}
        <div className="md:hidden space-y-2 pt-2">
          {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      </div>
      <span className="sr-only" style={tajawal}>
        جاري تحميل بيانات الرصد…
      </span>
    </div>
  );
}
