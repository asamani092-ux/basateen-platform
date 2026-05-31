import { Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  label?: string;
  className?: string;
  inline?: boolean;
};

/** حالة تحميل موحّدة — system_D */
export function PageLoader({
  label = "جاري التحميل…",
  className,
  inline = false,
}: Props) {
  return (
    <div
      dir="rtl"
      className={cn(
        inline
          ? "flex items-center justify-center gap-2 py-6"
          : "flex min-h-[200px] flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className={cn("text-sm text-muted-foreground", ds.page.description)} style={tajawal}>
        {label}
      </p>
    </div>
  );
}
