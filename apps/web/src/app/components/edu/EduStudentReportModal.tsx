import { Printer } from "lucide-react";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ds, tajawal } from "../../lib/design-system";

export type EduEducationalProfile = {
  type: "educational";
  complex_name: string | null;
  person: {
    id: number;
    full_name_ar: string;
    current_placement: string | null;
  };
  criteria: Array<{ id: string; name: string; type: string }>;
  summary: {
    total_records: number;
    avg_quality_pct: number | null;
    total_faces: number;
    first_record_date: string | null;
    last_record_date: string | null;
  };
  items: Array<{
    date: string;
    circle_name: string | null;
    track_name: string | null;
    quality_pct: number;
    face_count: number;
    notes: string | null;
    tasks: Array<{ id: string; name: string; value: boolean | number }>;
  }>;
};

type Props = {
  report: EduEducationalProfile;
  onPrint?: () => void;
};

function formatTaskValue(value: boolean | number): string {
  if (typeof value === "boolean") return value ? "✓" : "—";
  return String(value);
}

export function EduEducationalProfileReport({ report, onPrint }: Props) {
  const taskHeaders = report.criteria.filter((c) => c.type !== "penalty");

  return (
    <div id="edu-student-educational-print" className="space-y-4">
      <div className="hidden print:block text-center border-b border-black pb-3 mb-4">
        <h1 className="text-xl font-bold" style={tajawal}>
          كشف تعليمي تراكمي — {report.complex_name ?? "مجمع البساتين"}
        </h1>
        <p className="text-sm" style={tajawal}>
          {report.person.full_name_ar}
          {report.person.current_placement ? ` · ${report.person.current_placement}` : ""}
        </p>
        {report.summary.first_record_date && (
          <p className="text-xs mt-1" style={tajawal}>
            من {report.summary.first_record_date} إلى {report.summary.last_record_date}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm print:hidden">
        <div className={`${ds.card} p-3`}>
          <p className="text-muted-foreground" style={tajawal}>
            سجلات الرصد
          </p>
          <p className="font-bold text-lg">{report.summary.total_records}</p>
        </div>
        <div className={`${ds.card} p-3`}>
          <p className="text-muted-foreground" style={tajawal}>
            متوسط الجودة
          </p>
          <p className="font-bold text-lg">
            {report.summary.avg_quality_pct != null
              ? `${report.summary.avg_quality_pct}%`
              : "—"}
          </p>
        </div>
        <div className={`${ds.card} p-3`}>
          <p className="text-muted-foreground" style={tajawal}>
            إجمالي الأوجه
          </p>
          <p className="font-bold text-lg">{report.summary.total_faces}</p>
        </div>
        <div className={`${ds.card} p-3`}>
          <p className="text-muted-foreground" style={tajawal}>
            أول سجل
          </p>
          <p className="font-bold text-lg">{report.summary.first_record_date ?? "—"}</p>
        </div>
      </div>

      <div className={`${ds.card} edu-print-table-wrap overflow-x-auto`}>
        <Table className={`${ds.tableMin} text-right edu-print-table`} dir="rtl">
          <TableHeader className="print:table-header-group">
            <TableRow>
              <TableHead className={ds.table.head} style={tajawal}>
                التاريخ
              </TableHead>
              <TableHead className={ds.table.head} style={tajawal}>
                الحلقة
              </TableHead>
              <TableHead className={ds.table.head} style={tajawal}>
                المسار
              </TableHead>
              {taskHeaders.map((c) => (
                <TableHead key={c.id} className={`${ds.table.head} text-center`} style={tajawal}>
                  {c.name}
                </TableHead>
              ))}
              <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                الجودة %
              </TableHead>
              <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                أوجه
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5 + taskHeaders.length} className="text-center" style={tajawal}>
                  لا توجد سجلات رصد تعليمية.
                </TableCell>
              </TableRow>
            ) : (
              report.items.map((row) => (
                <TableRow key={row.date + row.circle_name} className="print:break-inside-avoid">
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {row.date}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {row.circle_name ?? "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {row.track_name ?? "—"}
                  </TableCell>
                  {taskHeaders.map((c) => {
                    const task = row.tasks.find((t) => t.id === c.id);
                    return (
                      <TableCell
                        key={c.id}
                        className={`${ds.table.cell} text-center tabular-nums`}
                        style={tajawal}
                      >
                        {task ? formatTaskValue(task.value) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className={`${ds.table.cell} text-center font-semibold tabular-nums`}
                    style={tajawal}
                  >
                    {row.quality_pct}%
                  </TableCell>
                  <TableCell
                    className={`${ds.table.cell} text-center tabular-nums`}
                    style={tajawal}
                  >
                    {row.face_count}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {onPrint && (
        <div className="flex gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={onPrint}
            style={tajawal}
          >
            <Printer className="w-4 h-4" />
            طباعة التقرير التفصيلي
          </Button>
        </div>
      )}
    </div>
  );
}
