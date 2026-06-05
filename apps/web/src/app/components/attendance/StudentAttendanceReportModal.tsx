import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { TableTruncatedCell } from "../shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

export type StudentReportRow = {
  student_id: number;
  full_name_ar: string;
  present_days: number;
  excused_days: number;
  absent_days: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCircleId?: number;
  circles: CircleOption[];
  loadingCircles?: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StudentAttendanceReportModal({
  open,
  onOpenChange,
  defaultCircleId,
  circles,
  loadingCircles = false,
}: Props) {
  const today = todayIso();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [circleId, setCircleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complexName, setComplexName] = useState<string | null>(null);
  const [circleName, setCircleName] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentReportRow[]>([]);
  const [loadedRange, setLoadedRange] = useState<{ start: string; end: string } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    if (defaultCircleId != null && Number.isFinite(defaultCircleId)) {
      setCircleId(String(defaultCircleId));
    }
  }, [open, defaultCircleId]);

  async function loadReport() {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      return;
    }
    const cid = Number(circleId);
    if (!Number.isFinite(cid)) {
      setError("اختر الحلقة أو المسار");
      return;
    }
    if (startDate > endDate) {
      setError("تاريخ البداية يجب أن يكون قبل النهاية");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStudentsAttendanceReport(
        startDate,
        endDate,
        cid,
      );
      setRows(res.items);
      setComplexName(res.complex_name);
      setCircleName(res.circle?.name_ar ?? null);
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
    document.body.classList.add("printing-student-attendance-report");
    const cleanup = () => {
      document.body.classList.remove("printing-student-attendance-report");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  }

  const headClass =
    "text-right px-4 py-3 print:px-2 print:py-1 print:text-xs print:font-semibold border border-black/20 print:border-black";
  const cellClass =
    "text-right px-4 py-3 print:px-2 print:py-1 print:text-xs border border-black/10 print:border-black";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto print:w-[210mm] print:absolute print:top-0 print:left-0 print:m-0 print:p-0 print:overflow-visible print:bg-white print:text-black print:max-h-none print:border-0 print:shadow-none print:translate-x-0 print:translate-y-0">
        <DialogHeader className="print:hidden">
          <DialogTitle style={tajawal}>تقرير تحضير الطلاب</DialogTitle>
          <DialogDescription style={tajawal}>
            اختر الفترة والحلقة ثم اعرض التقرير للطباعة.
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
          <div>
            <Label style={tajawal}>الحلقة / المسار</Label>
            <Select
              value={circleId}
              onValueChange={setCircleId}
              disabled={loadingCircles}
            >
              <SelectTrigger className={`${ds.btnRound} mt-1`}>
                <SelectValue
                  placeholder={loadingCircles ? "جاري التحميل…" : "اختر الحلقة"}
                />
              </SelectTrigger>
              <SelectContent>
                {circles.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          id="student-attendance-report-print"
          className="student-attendance-report-print space-y-3 print:w-[210mm] print:absolute print:top-0 print:left-0 print:m-0 print:p-8 print:bg-white print:text-black print:overflow-visible print:block"
        >
          <div className="hidden print:flex print:justify-between print:items-start print:border-b print:border-black print:pb-2 print:mb-3 print:pt-0">
            <p className="text-sm font-semibold" style={tajawal}>
              {complexName ?? "مجمع حلقات البساتين"}
              {circleName ? ` — ${circleName}` : ""}
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
                ملخص تحضير الطلاب من {loadedRange.start} إلى {loadedRange.end}
              </>
            ) : (
              "اضغط «عرض التقرير» لتحميل الملخص"
            )}
          </p>

          {rows.length > 0 ? (
            <div className="overflow-x-auto print:overflow-visible">
            <Table className="w-full border-collapse print:table-fixed print:w-full">
              <TableHeader>
                <TableRow className="print:break-inside-avoid">
                  <TableHead className={`${headClass} print:w-[40%]`} style={tajawal}>
                    اسم الطالب
                  </TableHead>
                  <TableHead className={`${headClass} print:w-[20%]`} style={tajawal}>
                    أيام الحضور
                  </TableHead>
                  <TableHead className={`${headClass} print:w-[20%]`} style={tajawal}>
                    أيام الاستئذان
                  </TableHead>
                  <TableHead className={`${headClass} print:w-[20%]`} style={tajawal}>
                    أيام الغياب
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.student_id}
                    className="print:break-inside-avoid"
                  >
                    <TableTruncatedCell className={`${cellClass} print:w-[40%]`} style={tajawal}>
                      {r.full_name_ar}
                    </TableTruncatedCell>
                    <TableCell className={`${cellClass} print:w-[20%] print:text-center`} style={tajawal}>
                      {r.present_days}
                    </TableCell>
                    <TableCell className={`${cellClass} print:w-[20%] print:text-center`} style={tajawal}>
                      {r.excused_days}
                    </TableCell>
                    <TableCell className={`${cellClass} print:w-[20%] print:text-center`} style={tajawal}>
                      {r.absent_days}
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
