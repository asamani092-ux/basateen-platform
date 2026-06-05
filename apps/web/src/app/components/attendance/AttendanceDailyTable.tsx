import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
import { TableTruncatedCell } from "../shared/TableTruncatedCell";
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
            className={`${ds.table.head} ${ds.table.colName}`}
            style={tajawal}
          >
            الاسم
          </TableHead>
          <TableHead
            className={`${ds.table.head} ${ds.table.colStatusCompact}`}
            style={tajawal}
          >
            الحالة
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableTruncatedCell className="font-medium" style={tajawal}>
              {row.subtitle
                ? `${row.full_name_ar} — ${row.subtitle}`
                : row.full_name_ar}
            </TableTruncatedCell>
            <TableCell
              className={`${ds.table.cell} ${ds.table.colStatusCompact} align-middle`}
            >
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
