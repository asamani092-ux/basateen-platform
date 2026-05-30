import { useCallback, useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
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
import { ds, tajawal } from "../../lib/design-system";

type ReportData = Awaited<ReturnType<typeof api.eduDeptReportsProgress>>;

function qualityBarClass(pct: number): string {
  if (pct >= 75) return "[&>div]:bg-emerald-500";
  if (pct >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-destructive";
}

export function EduReportsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [circleId, setCircleId] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptReportsProgress({
        date,
        circle_id: circleId ? Number(circleId) : undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, circleId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <BarChart3 className="w-7 h-7 text-primary" />
          التقارير والمتابعة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إنجاز تراكمي يومي بناءً على أوزان السماع والتكرار والمراجعة والربط.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 flex flex-wrap gap-4 items-end`}>
        <div className="space-y-1 min-w-[160px]">
          <Label style={tajawal}>التاريخ</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={ds.btnRound}
          />
        </div>
        <div className="space-y-1 min-w-[200px]">
          <Label style={tajawal}>الحلقة</Label>
          <select
            value={circleId}
            onChange={(e) => setCircleId(e.target.value)}
            className={ds.select}
            style={tajawal}
          >
            <option value="">كل الحلقات</option>
            {(data?.circles ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name_ar}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm" style={tajawal}>
          جاري التحميل…
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<TrendingUp className="w-6 h-6 text-primary" />}
              label="متوسط جودة المجمع"
              value={`${data.summary.avg_quality}%`}
            />
            <StatCard
              icon={<BarChart3 className="w-6 h-6 text-primary" />}
              label="الحلقة الأكثر إنجازاً"
              value={
                data.summary.top_circle
                  ? `${data.summary.top_circle.circle_name} (${data.summary.top_circle.avg_quality}%)`
                  : "—"
              }
            />
            <StatCard
              icon={<Users className="w-6 h-6 text-primary" />}
              label="الطلاب النشطون اليوم"
              value={String(data.summary.active_students)}
            />
          </div>

          <div className={ds.card}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                تقدم الطلاب — {data.date}
              </h3>
            </div>
            {data.items.length === 0 ? (
              <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
                لا توجد سجلات رصد لهذا اليوم.
              </p>
            ) : (
              <Table className={ds.tableMin}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                      الطالب
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[38%]`} style={tajawal}>
                      نسبة الجودة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[12%] text-center`} style={tajawal}>
                      أخطاء
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.student_id}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.full_name_ar}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.circle_name}
                      </TableCell>
                      <TableCell className={ds.table.cell}>
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Progress
                            value={row.quality_pct}
                            className={cn("h-2 flex-1", qualityBarClass(row.quality_pct))}
                          />
                          <span
                            className="text-sm font-semibold tabular-nums w-12 text-left"
                            style={tajawal}
                          >
                            {row.quality_pct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={`${ds.table.cell} text-center tabular-nums`}
                        style={tajawal}
                      >
                        {row.error_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={`${ds.card} p-5 space-y-2`}>
      <div className="flex items-center gap-2">{icon}</div>
      <p className="text-xs text-muted-foreground" style={tajawal}>
        {label}
      </p>
      <p className="text-lg font-bold" style={tajawal}>
        {value}
      </p>
    </div>
  );
}
