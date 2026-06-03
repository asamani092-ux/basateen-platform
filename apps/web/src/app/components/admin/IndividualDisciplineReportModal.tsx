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

export type IndividualReportData = {
  type: "staff" | "student";
  start_date: string;
  end_date: string;
  complex_name: string | null;
  person: {
    id: number;
    full_name_ar: string;
    role?: string | null;
    guardian_phone?: string | null;
    circle_name?: string | null;
  };
  summary: { present: number; absent: number; excused: number; total: number };
  discipline_pct: number;
  items: Array<{ date: string; status: string }>;
};

const STATUS_AR: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  excused: "مستأذن",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: IndividualReportData | null;
};

function printDateAr(): string {
  return new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function IndividualDisciplineReportModal({
  open,
  onOpenChange,
  report,
}: Props) {
  const cellClass =
    "text-right px-4 py-3 print:px-2 print:py-1.5 print:text-xs";

  function handlePrint() {
    document.body.classList.add("printing-individual-discipline-report");
    const cleanup = () => {
      document.body.classList.remove("printing-individual-discipline-report");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  }

  if (!report) return null;

  const personLabel = report.type === "staff" ? "المنسوب" : "الطالب";
  const titleName = report.person.full_name_ar;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto print:w-[210mm] print:absolute print:top-0 print:left-0 print:m-0 print:p-0 print:overflow-visible print:bg-white print:text-black print:max-h-none print:border-0 print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle style={tajawal}>تقرير الانضباط التفصيلي</DialogTitle>
          <DialogDescription style={tajawal}>
            {titleName} — من {report.start_date} إلى {report.end_date}
          </DialogDescription>
        </DialogHeader>

        <div
          id="individual-discipline-report-print"
          className="individual-discipline-report-print space-y-4 print:w-[210mm] print:absolute print:top-0 print:left-0 print:p-8 print:bg-white print:text-black print:overflow-visible print:block"
        >
          <div className="hidden print:flex print:justify-between print:items-start print:border-b print:border-black print:pb-2 print:mb-3">
            <p className="text-sm font-semibold" style={tajawal}>
              {report.complex_name ?? "مجمع حلقات البساتين"}
            </p>
            <p className="text-sm" style={tajawal}>
              {printDateAr()}
            </p>
          </div>

          <h2
            className="text-lg font-bold text-center print:text-base"
            style={tajawal}
          >
            تقرير الانضباط التفصيلي — {titleName}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" style={tajawal}>
            <p>
              <strong>نوع المستفيد:</strong> {personLabel}
            </p>
            <p>
              <strong>الفترة:</strong>{" "}
              <span dir="ltr">
                {report.start_date} — {report.end_date}
              </span>
            </p>
            {report.type === "student" && report.person.circle_name && (
              <p>
                <strong>الحلقة:</strong> {report.person.circle_name}
              </p>
            )}
            {report.type === "student" && report.person.guardian_phone && (
              <p dir="ltr">
                <strong>ولي الأمر:</strong> {report.person.guardian_phone}
              </p>
            )}
            <p>
              <strong>نسبة الانضباط:</strong> {report.discipline_pct}%
            </p>
            <p>
              <strong>ملخص:</strong> حاضر {report.summary.present} · غائب{" "}
              {report.summary.absent} · مستأذن {report.summary.excused}
            </p>
          </div>

          <Table className="w-full border-collapse text-sm print:text-xs">
            <TableHeader>
              <TableRow className="print:break-inside-avoid">
                <TableHead className={cellClass} style={tajawal}>
                  التاريخ
                </TableHead>
                <TableHead className={cellClass} style={tajawal}>
                  الحالة
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className={`${cellClass} text-muted-foreground`}
                    style={tajawal}
                  >
                    لا توجد سجلات تحضير في هذه الفترة.
                  </TableCell>
                </TableRow>
              ) : (
                report.items.map((row) => (
                  <TableRow
                    key={row.date}
                    className="print:break-inside-avoid"
                  >
                    <TableCell className={cellClass} style={tajawal} dir="ltr">
                      {row.date}
                    </TableCell>
                    <TableCell className={cellClass} style={tajawal}>
                      {STATUS_AR[row.status] ?? row.status}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex print:hidden pt-2">
          <Button
            type="button"
            variant="outline"
            className={`${ds.btnRound} w-full sm:w-auto`}
            onClick={handlePrint}
            style={tajawal}
          >
            <Printer className="w-4 h-4" />
            طباعة 🖨️
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
