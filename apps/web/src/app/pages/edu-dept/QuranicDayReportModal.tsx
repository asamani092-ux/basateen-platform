import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type ReportData = Awaited<ReturnType<typeof api.eduDeptQuranicDayReport>>;

const STATUS_LABEL: Record<string, string> = {
  completed: "منجز",
  over_threshold: "تجاوز الحد",
  in_progress: "قيد الإنجاز",
  none: "لم يبدأ",
};

export function QuranicDayReportModal({
  dayId,
  dayName,
  open,
  onOpenChange,
}: {
  dayId: number;
  dayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi() || !open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptQuranicDayReport(dayId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dayId, open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${ds.card} max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto`}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle style={tajawal}>تقرير اليوم — {dayName}</DialogTitle>
        </DialogHeader>

        {error && (
          <p className={ds.alert.error} style={tajawal}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="إجمالي الأحزاب المقروءة" value={String(data.total_hizbs_read)} />
              <StatCard label="طلاب منجزون" value={String(data.students_completed)} />
              <StatCard
                label={`تجاوزوا الحد (${data.fail_threshold})`}
                value={String(data.students_over_threshold)}
                warn
              />
            </div>

            <div className={ds.card}>
              <div className="p-3 border-b border-border">
                <p className="text-sm font-semibold" style={tajawal}>
                  تفصيل الطلاب ({data.enrolled_count} مسجّل)
                </p>
              </div>
              {data.students.length === 0 ? (
                <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
                  لا يوجد طلاب مسجّلون في هذا اليوم.
                </p>
              ) : (
                <Table className={`${ds.tableMin} text-right`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={ds.table.head} style={tajawal}>
                        الطالب
                      </TableHead>
                      <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                        الأحزاب
                      </TableHead>
                      <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                        أقصى أخطاء
                      </TableHead>
                      <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                        الحالة
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.students.map((st) => (
                      <TableRow key={st.student_id}>
                        <TableTruncatedCell style={tajawal}>{st.full_name_ar}</TableTruncatedCell>
                        <TableCell
                          className={`${ds.table.cell} text-center tabular-nums`}
                          style={tajawal}
                        >
                          {st.hizbs_read} / {st.target_count}
                        </TableCell>
                        <TableCell
                          className={`${ds.table.cell} text-center tabular-nums`}
                          style={tajawal}
                        >
                          {st.max_mistakes}
                        </TableCell>
                        <TableCell className={`${ds.table.cell} text-center text-sm`} style={tajawal}>
                          <span
                            className={cn(
                              st.status === "over_threshold" && "text-destructive font-semibold",
                              st.status === "completed" && "text-emerald-600 font-semibold",
                            )}
                          >
                            {STATUS_LABEL[st.status] ?? st.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className={`w-full ${ds.btnRound}`}
          onClick={() => onOpenChange(false)}
          style={tajawal}
        >
          إغلاق
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={`${ds.card} p-4 space-y-1 text-center`}>
      <p className="text-xs text-muted-foreground" style={tajawal}>
        {label}
      </p>
      <p
        className={cn("text-xl font-bold tabular-nums", warn && "text-destructive")}
        style={tajawal}
      >
        {value}
      </p>
    </div>
  );
}
