import { TableIconAction } from "../admin/TableIconAction";
import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
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
  const cellClass = "text-right px-3 py-2.5";
  const compactActionClass = "w-10 px-1 text-center";

  return (
    <Table className={`${ds.tableMin} border-collapse`}>
      <TableHeader>
        <TableRow>
          {showDateColumn && (
            <TableHead className={`${ds.table.head} w-[11%]`} style={tajawal}>
              التاريخ
            </TableHead>
          )}
          <TableHead
            className={`${ds.table.head} w-[min(28%,200px)]`}
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
          <TableHead className={`${ds.table.head}`} style={tajawal}>
            الحالة
          </TableHead>
          <TableHead className={`${ds.table.head} ${compactActionClass}`} style={tajawal}>
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
              className={dirty ? "bg-amber-500/5" : undefined}
            >
              {showDateColumn && (
                <TableCell
                  className={`${cellClass} whitespace-nowrap text-sm`}
                  style={tajawal}
                >
                  {entry.attendance_date}
                </TableCell>
              )}
              <TableCell
                className={`${cellClass} whitespace-normal align-top`}
                style={tajawal}
              >
                <p className="font-medium leading-snug break-words">
                  {entry.full_name_ar}
                </p>
                {dirty && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    غير محفوظ
                  </span>
                )}
              </TableCell>
              {showPlacement && (
                <TableCell
                  className={`${cellClass} text-sm whitespace-normal break-words`}
                  style={tajawal}
                >
                  {placement.text}
                </TableCell>
              )}
              {showRole && (
                <TableCell
                  className={`${cellClass} text-sm whitespace-normal`}
                  style={tajawal}
                >
                  {entry.role ?? "—"}
                </TableCell>
              )}
              <TableCell className={`${cellClass} align-middle`}>
                <AttendanceStatusButtons
                  value={entry.status}
                  disabled={rowBusyKey === entry.rowKey}
                  onChange={(st) =>
                    onStatusChange(entry, st as AttendanceStatusValue)
                  }
                />
              </TableCell>
              <TableCell className={compactActionClass}>
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
  );
}
