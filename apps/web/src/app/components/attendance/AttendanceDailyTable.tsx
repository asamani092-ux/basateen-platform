import { AttendanceStatusButtons } from "./AttendanceStatusButtons";
import { StudentPlacementSubBadge } from "../edu/StudentPlacementSubBadge";
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
  entityView?: "circle" | "track";
  other_placement_name?: string | null;
  show_shared_marker?: boolean;
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
                {row.show_shared_marker && row.other_placement_name ? (
                  <div className="mt-1 flex flex-col items-start gap-1">
                    <p className="text-[10px] text-muted-foreground">
                      {row.entityView === "track"
                        ? "مسجَّل من حلقته"
                        : "مسجَّل من مساره"}
                    </p>
                    <StudentPlacementSubBadge
                      circleName={
                        row.entityView === "track" ? row.other_placement_name : null
                      }
                      trackName={
                        row.entityView === "circle" ? row.other_placement_name : null
                      }
                      view={row.entityView === "track" ? "track" : "circle"}
                      className="max-w-full"
                    />
                  </div>
                ) : row.subtitle ? (
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
