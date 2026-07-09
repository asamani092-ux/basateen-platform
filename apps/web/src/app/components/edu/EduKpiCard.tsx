import {
  Card,
  CardContent,
} from "../ui/card";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
  compact?: boolean;
};

/** بطاقة مؤشر موحّدة — مطابقة لتبويب المؤشرات الإدارية */
export function EduKpiCard({ icon, label, value, sub, highlight, compact }: Props) {
  return (
    <Card
      className={`${ds.kpiCard}${highlight ? " border-warning/50 bg-warning-surface/30" : ""}${compact ? " !py-0" : ""}`}
    >
      <CardContent className={compact ? "p-0 pt-2" : "p-0 pt-3.5"}>
        <div
          className={`${compact ? "text-[11px] font-semibold text-muted-foreground" : ds.kpiLabel} flex items-center gap-1.5 mb-0.5`}
          style={tajawal}
        >
          {icon}
          {label}
        </div>
        <p
          className={compact ? "text-lg font-bold leading-tight text-primary" : ds.kpiValue}
          style={tajawal}
        >
          {value}
          {sub && (
            <span
              className={`text-[13px] font-bold ms-1.5 ${
                highlight ? "text-warning-foreground" : "text-success"
              }`}
            >
              {sub}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
