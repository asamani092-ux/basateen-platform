import { UsersRound } from "lucide-react";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  circleName: string;
  className?: string;
};

/** شارة «حلقة» — تظهر لطلاب المسار بجانب اسم الحلقة الأساسية */
export function StudentCircleBadge({ circleName, className }: Props) {
  const label = circleName.trim();
  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
        "border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15",
        className,
      )}
      style={tajawal}
      title={`حلقة: ${label}`}
    >
      <UsersRound className="size-3 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">حلقة: {label}</span>
    </span>
  );
}
