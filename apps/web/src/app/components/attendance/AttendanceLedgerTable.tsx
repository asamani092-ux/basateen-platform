import { TableIconAction } from "../admin/TableIconAction";
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
import { isEntryDirty, type LedgerEntry } from "../../lib/attendance-ledger";
import type { AttendanceStatusValue } from "../../lib/attendance-mutations";

type Props = {
  entries: LedgerEntry[];
  showDateColumn?: boolean;
  showRole?: boolean;
  rowBusyKey?: string | null;
  onStatusChange: (entry: LedgerEntry, status: AttendanceStatusValue) => void;
  onDelete: (entry: LedgerEntry) => void;
};

export function AttendanceLedgerTable({
  entries,
  showDateColumn = false,
  showRole = false,
  rowBusyKey,
  onStatusChange,
  onDelete,
}: Props) {
  const cellClass = "text-right px-4 py-3";
  const actionCellClass = `${cellClass} whitespace-nowrap`;

  return (
    <Table className={`${ds.tableMin} border-collapse`}>
      <TableHeader>
        <TableRow>
          {showDateColumn && (
            <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
              التاريخ
            </TableHead>
          )}
          <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
            الاسم
          </TableHead>
          {showRole && (
            <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
              الدور
            </TableHead>
          )}
          <TableHead className={actionCellClass} style={tajawal}>
            الحالة
          </TableHead>
          <TableHead className={actionCellClass} style={tajawal}>
            إجراء
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const dirty = isEntryDirty(entry);
          return (
            <TableRow
              key={entry.rowKey}
              className={dirty ? "bg-amber-500/5" : undefined}
            >
              {showDateColumn && (
                <TableCell className={`${cellClass} whitespace-nowrap`} style={tajawal}>
                  {entry.attendance_date}
                </TableCell>
              )}
              <TableCell className={`${cellClass} max-w-0`} style={tajawal}>
                <p className="font-medium truncate" title={entry.full_name_ar}>
                  {entry.full_name_ar}
                </p>
                {dirty && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    تغيير غير محفوظ
                  </span>
                )}
              </TableCell>
              {showRole && (
                <TableCell className={`${cellClass} max-w-0 truncate`} style={tajawal}>
                  {entry.role ?? "—"}
                </TableCell>
              )}
              <TableCell className={actionCellClass}>
                <AttendanceStatusButtons
                  value={entry.status}
                  disabled={rowBusyKey === entry.rowKey}
                  onChange={(st) =>
                    onStatusChange(entry, st as AttendanceStatusValue)
                  }
                />
              </TableCell>
              <TableCell className={actionCellClass}>
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
