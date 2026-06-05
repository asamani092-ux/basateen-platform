import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

function formatRole(role: string | null | undefined): string {
  return (
    (
      {
        super_admin: "مشرف عام",
        edu_supervisor: "مشرف تعليمي",
        programs_supervisor: "مشرف برامج",
        track_supervisor: "مشرف مسار",
        teacher: "معلم",
      } as Record<string, string>
    )[role ?? ""] || "غير محدد"
  );
}

export type StaffReportRow = {
  user_id: number;
  full_name_ar: string;
  role: string | null;
  present_days: number;
  absent_days: number;
  excused_days: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StaffAttendanceReportModal({ open, onOpenChange }: Props) {
  const today = todayIso();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complexName, setComplexName] = useState<string | null>(null);
  const [rows, setRows] = useState<StaffReportRow[]>([]);
  const [loadedRange, setLoadedRange] = useState<{ start: string; end: string } | null>(
    null,
  );

  async function loadReport() {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      return;
    }
    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStaffAttendanceReport(startDate, endDate);
      setRows(res.items);
      setComplexName(res.complex_name);
      setLoadedRange({ start: res.start_date, end: res.end_date });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setRows([]);
      setLoadedRange(null);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    document.body.classList.add("printing-staff-attendance-report");
    const cleanup = () => {
      document.body.classList.remove("printing-staff-attendance-report");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  }

  const cellClass =
    "text-right px-2 py-1 print:text-sm whitespace-normal align-top";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto print:w-[210mm] print:max-w-full print:absolute print:top-0 print:left-0 print:m-0 print:p-0 print:overflow-hidden print:bg-white print:text-black print:max-h-none print:border-0 print:shadow-none print:translate-x-0 print:translate-y-0">
        <DialogHeader className="print:hidden">
          <DialogTitle style={tajawal}>تقرير تحضير المنسوبين</DialogTitle>
          <DialogDescription style={tajawal}>
            اختر الفترة ثم اعرض التقرير للطباعة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 print:hidden">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                من تاريخ
              </Label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" style={tajawal}>
                إلى تاريخ
              </Label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
              />
            </div>
          </div>
          <Button
            type="button"
            className={ds.btnRound}
            disabled={loading}
            onClick={loadReport}
            style={tajawal}
          >
            {loading ? "جاري التحميل…" : "عرض التقرير"}
          </Button>
          {error && (
            <p className={ds.alert.error} style={tajawal}>
              {error}
            </p>
          )}
        </div>

        <div
          id="staff-attendance-report-print"
          className="staff-attendance-report-print space-y-3 print:w-[210mm] print:max-w-full print:absolute print:top-0 print:left-0 print:m-0 print:p-4 print:overflow-hidden print:bg-white print:text-black"
        >
          <div className="hidden print:flex print:justify-between print:items-start print:border-b print:border-black print:pb-2 print:mb-3 print:pt-0">
            <p className="text-sm font-semibold" style={tajawal}>
              {complexName ?? "مجمع حلقات البساتين"}
            </p>
            <p className="text-sm" style={tajawal} dir="ltr">
              {loadedRange
                ? `${loadedRange.start} — ${loadedRange.end}`
                : `${startDate} — ${endDate}`}
            </p>
          </div>

          <p
            className="text-sm font-medium print:block print:mt-0 hidden sm:block"
            style={tajawal}
          >
            {loadedRange ? (
              <>
                ملخص التحضير من {loadedRange.start} إلى {loadedRange.end}
              </>
            ) : (
              "اضغط «عرض التقرير» لتحميل الملخص"
            )}
          </p>

          {rows.length > 0 ? (
            <div className="overflow-x-auto print:overflow-hidden">
            <Table className="border-collapse w-full print:table-fixed">
              <TableHeader>
                <TableRow className="print:break-inside-avoid">
                  <TableHead className={cellClass} style={tajawal}>
                    المنسوب
                  </TableHead>
                  <TableHead className={cellClass} style={tajawal}>
                    أيام الحضور
                  </TableHead>
                  <TableHead className={cellClass} style={tajawal}>
                    أيام الغياب
                  </TableHead>
                  <TableHead className={cellClass} style={tajawal}>
                    أيام الاستئذان
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id} className="print:break-inside-avoid">
                    <TableCell className={cellClass} style={tajawal}>
                      <p className="font-medium">{r.full_name_ar}</p>
                      <span className="text-sm text-gray-500 block mt-1">
                        {formatRole(r.role)}
                      </span>
                    </TableCell>
                    <TableCell className={cellClass} style={tajawal}>
                      {r.present_days}
                    </TableCell>
                    <TableCell className={cellClass} style={tajawal}>
                      {r.absent_days}
                    </TableCell>
                    <TableCell className={cellClass} style={tajawal}>
                      {r.excused_days}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            !loading &&
            loadedRange && (
              <p className={ds.alert.info} style={tajawal}>
                لا توجد سجلات تحضير في هذه الفترة.
              </p>
            )
          )}
        </div>

        {rows.length > 0 && (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
