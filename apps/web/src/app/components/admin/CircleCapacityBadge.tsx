import { Badge } from "../ui/badge";
import type { CircleOption } from "../../lib/api-client";
import { tajawal } from "../../lib/design-system";

type Props = {
  circle: Pick<
    CircleOption,
    | "student_count"
    | "default_capacity"
    | "seats_remaining"
    | "near_capacity"
    | "at_or_over_capacity"
    | "alert_level"
  >;
  showFraction?: boolean;
};

export function CircleCapacityBadge({ circle, showFraction = true }: Props) {
  const dc = circle.default_capacity ?? 0;
  const sc = circle.student_count ?? 0;
  const remaining = circle.seats_remaining ?? dc - sc;

  if (circle.at_or_over_capacity) {
    return (
      <Badge variant="destructive" className="rounded-lg" style={tajawal}>
        مكتملة {showFraction ? `${sc}/${dc}` : ""}
      </Badge>
    );
  }
  if (circle.near_capacity || circle.alert_level === "near") {
    return (
      <Badge
        className="rounded-lg bg-amber-100 text-amber-900 border-amber-300"
        style={tajawal}
      >
        بقي {remaining} مقاعد · {showFraction ? `${sc}/${dc}` : ""}
      </Badge>
    );
  }
  if (showFraction) {
    return (
      <Badge variant="secondary" className="rounded-lg" style={tajawal}>
        {sc}/{dc}
      </Badge>
    );
  }
  return null;
}
