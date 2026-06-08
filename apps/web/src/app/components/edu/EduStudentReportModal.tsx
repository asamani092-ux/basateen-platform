import { Printer } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ds, tajawal } from "../../lib/design-system";

export type EduStudentReport = {
  type: "student";
  start_date: string;
  end_date: string;
  complex_name: string | null;
  person: {
    id: number;
    full_name_ar: string;
    guardian_phone?: string | null;
    circle_name?: string | null;
  };
  summary: { present: number; absent: number; excused: number; total: number };
  discipline_pct: number;
  items: Array<{ date: string; status: string }>;
  recitation_avg_quality: number | null;
  recitation_records: number;
  pledges: Array<{ id: number; reason_ar: string; pledge_date: string }>;
};

const STATUS_AR: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  excused: "مستأذن",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: EduStudentReport | null;
};

export function EduStudentReportModal({ open, onOpenChange, report }: Props) {
  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none"
        dir="rtl"
      >
        <DialogHeader className="print:hidden">
          <DialogTitle style={tajawal}>التقرير التفصيلي للطالب</DialogTitle>
          <DialogDescription style={tajawal}>
            {report.person.full_name_ar} — {report.start_date} إلى {report.end_date}
          </DialogDescription>
        </DialogHeader>

        <div id="edu-student-report-print" className="space-y-4">
          <div className="hidden print:block text-center border-b border-black pb-3 mb-4">
            <h1 className="text-xl font-bold" style={tajawal}>
              تقرير طالب — {report.complex_name ?? "مجمع البساتين"}
            </h1>
            <p className="text-sm" style={tajawal}>
              {report.person.full_name_ar} · {report.start_date} — {report.end_date}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className={ds.card + " p-3 print:break-inside-avoid"}>
              <p className="text-muted-foreground" style={tajawal}>
                حاضر
              </p>
              <p className="font-bold text-lg">{report.summary.present}</p>
            </div>
            <div className={ds.card + " p-3 print:break-inside-avoid"}>
              <p className="text-muted-foreground" style={tajawal}>
                غائب
              </p>
              <p className="font-bold text-lg">{report.summary.absent}</p>
            </div>
            <div className={ds.card + " p-3 print:break-inside-avoid"}>
              <p className="text-muted-foreground" style={tajawal}>
                انضباط
              </p>
              <p className="font-bold text-lg">{report.discipline_pct}%</p>
            </div>
            <div className={ds.card + " p-3 print:break-inside-avoid"}>
              <p className="text-muted-foreground" style={tajawal}>
                متوسط الجودة
              </p>
              <p className="font-bold text-lg">
                {report.recitation_avg_quality != null
                  ? `${report.recitation_avg_quality}%`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="print:break-inside-avoid">
            <h3 className={ds.page.section} style={tajawal}>
              سجل الحضور
            </h3>
            <Table className="edu-print-table">
              <TableHeader className="print:table-header-group">
                <TableRow>
                  <TableHead style={tajawal}>التاريخ</TableHead>
                  <TableHead style={tajawal}>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.items.map((row) => (
                  <TableRow key={row.date} className="print:break-inside-avoid">
                    <TableCell style={tajawal}>{row.date}</TableCell>
                    <TableCell style={tajawal}>
                      {STATUS_AR[row.status] ?? row.status}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {report.pledges.length > 0 && (
            <div className="print:break-inside-avoid">
              <h3 className={ds.page.section} style={tajawal}>
                التعهدات
              </h3>
              <ul className="space-y-1 text-sm">
                {report.pledges.map((p) => (
                  <li key={p.id} className="print:break-inside-avoid" style={tajawal}>
                    {p.pledge_date}: {p.reason_ar}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-2 print:hidden">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => window.print()}
            style={tajawal}
          >
            <Printer className="w-4 h-4" />
            طباعة التقرير التفصيلي
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
