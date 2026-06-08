import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
      className={`${ds.card}${highlight ? " border-amber-500/50 bg-amber-500/5" : ""}`}
    >
      <CardHeader className="pb-2">
        <CardTitle
          className="text-sm font-medium flex items-center gap-2"
          style={tajawal}
        >
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums" style={tajawal}>
          {value}
        </p>
        {sub && (
          <p
            className={`text-xs mt-1 leading-relaxed ${
              highlight ? "text-amber-700 font-medium" : "text-muted-foreground"
            }`}
            style={tajawal}
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
