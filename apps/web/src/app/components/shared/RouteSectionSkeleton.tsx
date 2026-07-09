import { Skeleton } from "../ui/skeleton";
import { ds, tajawal } from "../../lib/design-system";

/** Skeleton fallback for lazy-loaded route sections */
export function RouteSectionSkeleton() {
  return (
    <div className="space-y-6 max-w-[1400px]" dir="rtl" role="status" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-4 w-72 max-w-full rounded-lg" />
      </div>
      <div className={`${ds.card} p-4 space-y-4`}>
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-9 w-full max-w-xs rounded-xl" />
          <Skeleton className="h-9 w-full max-w-xs rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
      <span className="sr-only" style={tajawal}>
        جاري تحميل الصفحة…
      </span>
    </div>
  );
}
