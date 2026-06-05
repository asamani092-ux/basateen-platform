import type { CSSProperties, ReactNode } from "react";
import { Badge } from "../ui/badge";
import { formatStudentPlacement } from "../../lib/student-placement-display";
import { tajawal } from "../../lib/design-system";
import { TableTruncatedCell } from "./TableTruncatedCell";

type StudentPlacementCellProps = {
  circleName?: string | null;
  trackName?: string | null;
  empty?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function StudentPlacementCell({
  circleName,
  trackName,
  empty = <Badge variant="secondary">غير مسند</Badge>,
  className,
  style,
}: StudentPlacementCellProps) {
  const placement = formatStudentPlacement({ circleName, trackName });

  if (placement.isEmpty) {
    return (
      <TableTruncatedCell className={className} style={{ ...tajawal, ...style }}>
        {empty}
      </TableTruncatedCell>
    );
  }

  return (
    <TableTruncatedCell
      className={className}
      title={placement.title}
      style={{ ...tajawal, ...style }}
    >
      {placement.text}
    </TableTruncatedCell>
  );
}
