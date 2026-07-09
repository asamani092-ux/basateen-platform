import { Route } from "lucide-react";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  trackName: string;
  className?: string;
};

/** شارة «في مسار» — تظهر للطلاب المسجّلين في مسار بجانب حلقتهم */
export function StudentTrackBadge({ trackName, className }: Props) {
  const label = trackName.trim();
  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
        ds.trackBadge,
        className,
      )}
      style={tajawal}
      title={`في مسار: ${label}`}
    >
      <Route className="size-3 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">في مسار: {label}</span>
    </span>
  );
}
