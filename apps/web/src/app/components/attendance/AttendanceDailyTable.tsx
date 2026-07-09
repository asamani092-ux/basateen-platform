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
  has_record?: boolean;
  isDirty?: boolean;
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
    <div className={ds.tableWrap}>
      <Table className={ds.tableMin}>
        <TableHeader className="print:table-header-group">
          <TableRow className="print:break-inside-avoid">
            <TableHead className={ds.table.head} style={tajawal}>
              الاسم
            </TableHead>
            <TableHead
              className={`${ds.table.head} ${ds.table.colStatusBtns}`}
              style={tajawal}
            >
              الحالة
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="print:break-inside-avoid">
              <TableCell className={`${ds.table.cell} min-w-0`} style={tajawal}>
                <p className="font-medium truncate">{row.full_name_ar}</p>
                {row.subtitle ? (
                  <p className="text-xs text-muted-foreground truncate">
                    {row.subtitle}
                  </p>
                ) : null}
              </TableCell>
              <TableCell
                className={`${ds.table.cell} ${ds.table.colStatusBtns} align-middle`}
              >
                <AttendanceStatusButtons
                  value={row.status}
                  disabled={disabled}
                  highlightSaved={Boolean(row.has_record || row.isDirty)}
                  onChange={(st) => onStatusChange(row.id, st)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
