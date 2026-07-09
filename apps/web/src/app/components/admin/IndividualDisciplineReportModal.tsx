import { useMemo } from "react";
import { Printer } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
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

const thClass =
  "text-right px-4 py-3 border border-border font-medium bg-muted/40 print:border-black print:bg-[#f1f5f9] print:text-black";
const tdClass =
  "text-right px-4 py-3 border border-border print:border-black print:text-black print:bg-white";

function printDateAr(): string {
  return new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function weekdayAr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return "—";
  }
  const [year, month, day] = parts;
  const dt = new Date(year, month - 1, day);
  return dt.toLocaleDateString("ar-SA", { weekday: "long" });
}

function computeSummaryFromItems(
  items: IndividualReportData["items"],
  disciplinePctFromApi: number,
) {
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const row of items) {
    if (row.status === "present") present++;
    else if (row.status === "excused") excused++;
    else absent++;
  }
  const total = items.length;
  const disciplinePct =
    total > 0
      ? Math.round((present / total) * 100)
      : disciplinePctFromApi;
  return { present, absent, excused, total, disciplinePct };
}

function SummaryStatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card px-4 py-3 print:rounded-none print:border print:border-black print:bg-white print:shadow-none"
      style={tajawal}
    >
      <p className="text-xs text-muted-foreground print:text-black">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1 print:text-black">
        {value}
      </p>
    </div>
  );
}

export function IndividualDisciplineReportModal({
  open,
  onOpenChange,
  report,
}: Props) {
  const stats = useMemo(() => {
    if (!report) return null;
    const fromItems = computeSummaryFromItems(
      report.items,
      report.discipline_pct,
    );
    const useApi =
      report.summary.total > 0 &&
      report.summary.total === report.items.length;
    return {
      disciplinePct: useApi ? report.discipline_pct : fromItems.disciplinePct,
      present: useApi ? report.summary.present : fromItems.present,
      absent: useApi ? report.summary.absent : fromItems.absent,
      excused: useApi ? report.summary.excused : fromItems.excused,
    };
  }, [report]);

  const detailRows = useMemo(() => {
    if (!report) return [];
    return [...report.items].sort((a, b) => b.date.localeCompare(a.date));
  }, [report]);

  function handlePrint() {
    document.body.classList.add("printing-individual-discipline-report");
    const cleanup = () => {
      document.body.classList.remove("printing-individual-discipline-report");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 150);
    });
    setTimeout(cleanup, 3000);
  }

  if (!report || !stats) return null;

  const personLabel = report.type === "staff" ? "المنسوب" : "الطالب";
  const titleName = report.person.full_name_ar;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto [&>button]:print:hidden print:fixed print:inset-0 print:z-[9999] print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:m-0 print:p-[12mm] print:overflow-visible print:bg-white print:text-black print:border-0 print:shadow-none print:translate-x-0 print:translate-y-0 print:rounded-none">
        <DialogHeader className="print:hidden">
          <DialogTitle style={tajawal}>تقرير الانضباط التفصيلي</DialogTitle>
          <DialogDescription style={tajawal}>
            {titleName} — من {report.start_date} إلى {report.end_date}
          </DialogDescription>
        </DialogHeader>

        <div
          id="individual-discipline-report-print"
          className="individual-discipline-report-print space-y-5 w-full box-border print:bg-white print:text-black"
          dir="rtl"
        >
          <div className="hidden print:flex print:justify-between print:items-start print:border-b print:border-black print:pb-2 print:mb-3">
            <p className="text-sm font-semibold" style={tajawal}>
              {report.complex_name ?? "مجمع حلقات بساتين"}
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

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm print:text-xs"
            style={tajawal}
          >
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
          </div>

          <section className="space-y-3">
            <h3 className={ds.page.section} style={tajawal}>
              ملخص الانضباط
            </h3>
            <div className="individual-discipline-summary-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryStatCard
                label="نسبة الانضباط"
                value={`${stats.disciplinePct}%`}
              />
              <SummaryStatCard label="أيام الحضور" value={stats.present} />
              <SummaryStatCard label="أيام الغياب" value={stats.absent} />
              <SummaryStatCard label="أيام الاستئذان" value={stats.excused} />
            </div>
          </section>

          <section
            className={`individual-discipline-table-section ${ds.card} overflow-hidden p-0 print:rounded-none print:overflow-visible print:border print:border-black print:shadow-none print:w-full`}
          >
            <div className="p-4 border-b border-border print:border-black">
              <h3 className={ds.page.section} style={tajawal}>
                الجدول التفصيلي
              </h3>
            </div>
            {detailRows.length === 0 ? (
              <p className={`m-4 ${ds.alert.info} print:text-black`} style={tajawal}>
                لا توجد سجلات تحضير في هذه الفترة.
              </p>
            ) : (
              <div className="w-full overflow-x-auto print:overflow-visible">
                <table
                  className="individual-discipline-detail-table w-full border-collapse table-fixed"
                  dir="rtl"
                >
                  <thead>
                    <tr className="print:break-inside-avoid">
                      <th className={thClass} style={tajawal}>
                        التاريخ
                      </th>
                      <th className={thClass} style={tajawal}>
                        اليوم
                      </th>
                      <th className={thClass} style={tajawal}>
                        حالة الحضور
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row) => (
                      <tr
                        key={`${row.date}-${row.status}`}
                        className="print:break-inside-avoid"
                      >
                        <td className={tdClass} style={tajawal} dir="ltr">
                          {row.date}
                        </td>
                        <td className={tdClass} style={tajawal}>
                          {weekdayAr(row.date)}
                        </td>
                        <td className={tdClass} style={tajawal}>
                          {STATUS_AR[row.status] ?? row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
