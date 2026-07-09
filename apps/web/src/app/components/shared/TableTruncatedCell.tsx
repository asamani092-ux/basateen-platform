import type { CSSProperties, ReactNode } from "react";
import { TableCell } from "../ui/table";
import { cn } from "../ui/utils";
import { ds } from "../../lib/design-system";

type TableTruncatedCellProps = {
  children: ReactNode;
  title?: string;
  className?: string;
  style?: CSSProperties;
  colSpan?: number;
};

export function TableTruncatedCell({
  children,
  title,
  className,
  style,
  colSpan,
}: TableTruncatedCellProps) {
  const fallbackTitle =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : undefined;

  return (
    <TableCell
      colSpan={colSpan}
      className={cn(ds.table.cell, ds.table.truncateCell, className)}
      style={style}
      title={title ?? fallbackTitle}
    >
      <span className="block truncate">{children}</span>
    </TableCell>
  );
}
