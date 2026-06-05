import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ds, tajawal } from "../../lib/design-system";
import type { AttendanceStatusValue } from "../../lib/attendance-mutations";

export type DailyAttendanceRow = {
  id: number;
  full_name_ar: string;
  subtitle?: string;
  status: string;
};

type Props = {
  rows: DailyAttendanceRow[];
  disabled?: boolean;
  onStatusChange: (id: number, status: AttendanceStatusValue) => void;
};

export function AttendanceDailyTable({
  rows,
  disabled,
  onStatusChange,
}: Props) {
  return (
    <Table className={`${ds.tableMin} border-collapse`}>
      <TableHeader>
        <TableRow>
          <TableHead
            className={`${ds.table.head} w-[min(42%,280px)]`}
            style={tajawal}
          >
            الاسم
          </TableHead>
          <TableHead className={`${ds.table.head}`} style={tajawal}>
            الحالة
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell
              className={`${ds.table.cell} align-top whitespace-normal py-3`}
              style={tajawal}
            >
              <p className="font-medium leading-snug break-words">
                {row.full_name_ar}
              </p>
              {row.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {row.subtitle}
                </p>
              )}
            </TableCell>
            <TableCell className={`${ds.table.cell} align-middle py-3`}>
              <AttendanceStatusButtons
                value={row.status}
                disabled={disabled}
                onChange={(st) => onStatusChange(row.id, st)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
