import { TableIconAction } from "../admin/TableIconAction";
import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
import { TableTruncatedCell } from "../shared/TableTruncatedCell";
import { formatStudentPlacement } from "../../lib/student-placement-display";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ds, tajawal } from "../../lib/design-system";
import { staffRoleLabel } from "../../lib/staff-role-label";
import { isEntryDirty, type LedgerEntry } from "../../lib/attendance-ledger";
import type { AttendanceStatusValue } from "../../lib/attendance-mutations";

type Props = {
  entries: LedgerEntry[];
  showDateColumn?: boolean;
  showRole?: boolean;
  showPlacement?: boolean;
  rowBusyKey?: string | null;
  onStatusChange: (entry: LedgerEntry, status: AttendanceStatusValue) => void;
  onDelete: (entry: LedgerEntry) => void;
};

export function AttendanceLedgerTable({
  entries,
  showDateColumn = false,
  showRole = false,
  showPlacement = false,
  rowBusyKey,
  onStatusChange,
  onDelete,
}: Props) {
  return (
    <div className={ds.tableWrap}>
    <Table className={ds.tableMin}>
      <TableHeader>
        <TableRow>
          {showDateColumn && (
            <TableHead className={`${ds.table.head} w-[11%]`} style={tajawal}>
              التاريخ
            </TableHead>
          )}
          <TableHead
            className={`${ds.table.head} ${ds.table.colName}`}
            style={tajawal}
          >
            الاسم
          </TableHead>
          {showPlacement && (
            <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
              الحلقة / المسار
            </TableHead>
          )}
          {showRole && (
            <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
              الدور
            </TableHead>
          )}
          <TableHead
            className={`${ds.table.head} ${ds.table.colStatusBtns}`}
            style={tajawal}
          >
            الحالة
          </TableHead>
          <TableHead className={ds.table.headActions} style={tajawal}>
            <span className="sr-only">حذف</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const dirty = isEntryDirty(entry);
          const placement = formatStudentPlacement({
            circleName: entry.circle_name,
            trackName: entry.track_name,
            emptyLabel: "—",
          });
          return (
            <TableRow
              key={entry.rowKey}
              className={dirty ? "bg-warning-surface/40" : undefined}
            >
              {showDateColumn && (
                <TableCell
                  className={`${ds.table.cell} whitespace-nowrap`}
                  style={tajawal}
                >
                  {entry.attendance_date}
                </TableCell>
              )}
              <TableTruncatedCell className="font-medium" style={tajawal}>
                {dirty
                  ? `${entry.full_name_ar} (غير محفوظ)`
                  : entry.full_name_ar}
              </TableTruncatedCell>
              {showPlacement && (
                <TableTruncatedCell
                  title={placement.title}
                  className={ds.table.colPlacement}
                  style={tajawal}
                >
                  {placement.text}
                </TableTruncatedCell>
              )}
              {showRole && (
                <TableTruncatedCell style={tajawal}>
                  {staffRoleLabel(entry.role)}
                </TableTruncatedCell>
              )}
              <TableCell
                className={`${ds.table.cell} ${ds.table.colStatusBtns} align-middle`}
              >
                <AttendanceStatusButtons
                  value={entry.status}
                  disabled={rowBusyKey === entry.rowKey}
                  onChange={(st) =>
                    onStatusChange(entry, st as AttendanceStatusValue)
                  }
                />
              </TableCell>
              <TableCell className={ds.table.actionsCell}>
                <TableIconAction
                  kind="delete"
                  label="حذف السجل"
                  disabled={rowBusyKey === entry.rowKey || !entry.has_record}
                  onClick={() => onDelete(entry)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
