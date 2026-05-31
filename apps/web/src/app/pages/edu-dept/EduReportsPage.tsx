import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CalendarRange, TrendingUp } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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

type DatePreset = "last3" | "last7" | "month" | "custom";
type ReportData = Awaited<ReturnType<typeof api.eduDeptReportsProgress>>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: DatePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  if (preset === "last3") start.setDate(end.getDate() - 2);
  else if (preset === "last7") start.setDate(end.getDate() - 6);
  else if (preset === "month") start.setDate(1);
  return { start: isoDate(start), end: isoDate(end) };
}

function qualityBarClass(pct: number): string {
  if (pct >= 75) return "[&>div]:bg-emerald-500";
  if (pct >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-destructive";
}

export function EduReportsPage() {
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [customStart, setCustomStart] = useState(() => isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => isoDate(new Date()));
  const [circleId, setCircleId] = useState("");
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startDate, endDate } = useMemo(() => {
    if (preset === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }
    return rangeForPreset(preset);
  }, [preset, customStart, customEnd]);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptReportsProgress({
        date_from: startDate,
        date_to: endDate,
        circle_id: circleId ? Number(circleId) : undefined,
      });
      setData(res);
      setApplied(true);
      if (res.circles?.length) setCircles(res.circles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التقرير");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, circleId]);

  useEffect(() => {
    if (!canUseApi()) return;
    void api.circles().then((res) => {
      setCircles(res.items.map((c) => ({ id: c.id, name_ar: c.name_ar })));
    });
  }, []);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <BarChart3 className="w-7 h-7 text-primary" />
          التقارير والمتابعة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إنجاز تراكمي بناءً على أوزان السماع والتكرار والمراجعة والربط.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-4`}>
        <div className={ds.filterRow}>
          <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
            <Label style={tajawal}>الفترة السريعة</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
              <SelectTrigger className={ds.btnRound}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last3">آخر 3 أيام</SelectItem>
                <SelectItem value="last7">آخر أسبوع</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="custom">مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Label style={tajawal}>الحلقة</Label>
            <select
              value={circleId}
              onChange={(e) => setCircleId(e.target.value)}
              className={ds.select}
              style={tajawal}
            >
              <option value="">كل الحلقات</option>
              {circles.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:shrink-0">
            <Button
              type="button"
              className={`w-full sm:w-auto ${ds.btnRound}`}
              onClick={() => void load()}
              disabled={loading}
              style={tajawal}
            >
              {loading ? "جاري التحميل…" : "تطبيق الفلتر"}
            </Button>
          </div>
        </div>

        {preset === "custom" && (
          <div className={ds.filterRow}>
            <div className="space-y-1 w-full sm:flex-1 sm:max-w-xs">
              <Label style={tajawal}>من</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1 w-full sm:flex-1 sm:max-w-xs">
              <Label style={tajawal}>إلى</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={ds.btnRound}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground" style={tajawal}>
          الفترة المعروضة: {startDate} — {endDate}
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm" style={tajawal}>
          جاري التحميل…
        </p>
      ) : !applied ? (
        <p className={ds.alert.info} style={tajawal}>
          طبّق الفلتر لعرض تقرير الطلاب — لا يُحمّل الجدول تلقائياً لتوفير الذاكرة.
        </p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon={<BookOpen className="w-6 h-6 text-primary" />}
              label="إجمالي الأوجه (منذ بداية الفصل)"
              value={String(data.summary.total_faces_semester ?? 0)}
            />
            <StatCard
              icon={<CalendarRange className="w-6 h-6 text-primary" />}
              label="أوجه اليوم"
              value={String(data.summary.faces_today ?? 0)}
            />
            <StatCard
              icon={<TrendingUp className="w-6 h-6 text-primary" />}
              label="متوسط إنجاز الجودة"
              value={`${data.summary.avg_quality}%`}
            />
          </div>

          <div className={ds.card}>
            <div className="p-4 border-b border-border">
              <h3 className={ds.page.section} style={tajawal}>
                تقدم الطلاب — {data.date_from} إلى {data.date_to}
              </h3>
            </div>
            {data.items.length === 0 ? (
              <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
                لا توجد سجلات رصد في هذه الفترة.
              </p>
            ) : (
              <Table className={`${ds.tableMin} text-right`} dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${ds.table.head} w-[20%]`} style={tajawal}>
                      الطالب
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                      الحلقة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[32%]`} style={tajawal}>
                      نسبة الجودة
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[10%] text-center`} style={tajawal}>
                      أوجه
                    </TableHead>
                    <TableHead className={`${ds.table.head} w-[10%] text-center`} style={tajawal}>
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
                        {row.face_count ?? 0}
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
      <p className="text-lg font-bold tabular-nums" style={tajawal}>
        {value}
      </p>
    </div>
  );
}
