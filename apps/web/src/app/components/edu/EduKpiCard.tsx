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
};

/** بطاقة مؤشر موحّدة — مطابقة لتبويب المؤشرات الإدارية */
export function EduKpiCard({ icon, label, value, sub, highlight }: Props) {
  return (
    <Card
      className={`${ds.kpiCard}${highlight ? " border-warning/50 bg-warning-surface/30" : ""}`}
    >
      <CardContent className="p-0 pt-3.5">
        <div
          className={`${ds.kpiLabel} flex items-center gap-2 mb-1`}
          style={tajawal}
        >
          {icon}
          {label}
        </div>
        <p className={ds.kpiValue} style={tajawal}>
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
