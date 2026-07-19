import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { CalendarDays, CheckCircle2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { AttendanceDailyTable } from "../../components/attendance/AttendanceDailyTable";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import type { AttendanceStatusValue } from "../../lib/attendance-mutations";
import { todayRiyadhIso } from "../../lib/today-riyadh-iso";
import { ds, tajawal } from "../../lib/design-system";

type Row = {
  student_id: number;
  full_name_ar: string;
  status: string;
  has_record: boolean;
  other_placement_name?: string | null;
  isDirty?: boolean;
};

/** تحضير عام بدون تسجيل دخول — رابط سحري (حلقة أو مسار) */
export function PublicMagicLinkPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [date, setDate] = useState(todayRiyadhIso());
  const [dateMin, setDateMin] = useState<string | undefined>();
  const [dateMax, setDateMax] = useState<string | undefined>();
  const [entityType, setEntityType] = useState<"circle" | "track">("circle");
  const [entityName, setEntityName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFatalError(null);
    try {
      const res = await api.publicAttendanceGet(token, date);
      setDate(res.attendance_date);
      if (res.date_min) setDateMin(res.date_min);
      if (res.date_max) setDateMax(res.date_max);
      setEntityType(res.entity_type ?? (res.track ? "track" : "circle"));
      setEntityName(
        res.entity_type === "track"
          ? (res.track?.name_ar ?? "")
          : (res.circle?.name_ar ?? ""),
      );
      const items = (res.items ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: normalizeAttendanceStatus(r.status),
        has_record: Boolean(r.has_record),
        other_placement_name: r.other_placement_name ?? null,
      }));
      setRows(items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "الرابط غير صالح أو موقوف";
      setFatalError(msg);
      setRows([]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;
    for (const row of rows) {
      if (row.status === "present") present += 1;
      else if (row.status === "absent") absent += 1;
      else if (row.status === "excused") excused += 1;
    }
    return { present, absent, excused, total: rows.length };
  }, [rows]);

  function pickStatus(studentId: number, status: AttendanceStatusValue) {
    setRows((prev) =>
      prev.map((r) =>
        r.student_id === studentId ? { ...r, status, isDirty: true } : r,
      ),
    );
  }

  async function save() {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      await api.publicAttendanceSave(token, {
        attendance_date: date,
        records: rows.map((r) => ({
          student_id: r.student_id,
          status: r.status,
        })),
      });
      toast.success("تم حفظ التحضير بنجاح — شكراً لكم");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل حفظ التحضير";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const title = entityType === "track" ? "تحضير المسار" : "تحضير الحلقة";
  const emptyMsg =
    entityType === "track"
      ? "لا يوجد طلاب في هذا المسار."
      : "لا يوجد طلاب في هذه الحلقة.";

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 sm:p-8 sm:pb-8">
        <header className={`${ds.card} p-5 sm:p-6 text-center space-y-3`}>
          <img
            src="/logo-light.png"
            alt="مجمع بساتين"
            className="mx-auto h-16 sm:h-20 dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt="مجمع بساتين"
            className="mx-auto hidden h-16 sm:h-20 dark:block"
          />
          <div>
            <h1 className={ds.page.title} style={tajawal}>
              {title}
            </h1>
            <p className={ds.page.description} style={tajawal}>
              {entityName || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2" style={tajawal}>
              الطالب المشترك بين حلقة ومسار يملك سجلاً واحداً يومياً — تعديل
              حالته هنا يحدّث نفس السجل في المنصة.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5"
              style={tajawal}
            >
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              تحضير يوم {date || "اليوم"}
            </span>
            {!loading && rows.length > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5"
                style={tajawal}
              >
                <Users className="size-4 shrink-0" aria-hidden />
                {counts.total} طالب
              </span>
            ) : null}
          </div>
          <div className="text-right max-w-xs mx-auto">
            <Label className="text-xs text-muted-foreground" style={tajawal}>
              تاريخ التحضير
            </Label>
            <input
              type="date"
              value={date}
              min={dateMin}
              max={dateMax}
              disabled={loading || saving}
              onChange={(e) => setDate(e.target.value)}
              className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
            />
          </div>
        </header>

        {fatalError ? (
          <p className={ds.alert.error} style={tajawal} role="alert">
            {fatalError}
          </p>
        ) : null}

        {loading ? (
          <div className={`${ds.card} ${ds.loading}`}>
            <Loader2
              className="size-8 animate-spin text-primary"
              aria-hidden
            />
            <span className="sr-only">جاري التحميل</span>
          </div>
        ) : rows.length === 0 && !fatalError ? (
          <p className={`${ds.card} p-5 ${ds.alert.info}`} style={tajawal}>
            {emptyMsg}
          </p>
        ) : rows.length > 0 ? (
          <>
            <div className={ds.kpiStrip}>
              <div className={`${ds.card} p-3 text-center`}>
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  حاضر
                </p>
                <p
                  className="text-xl font-bold text-success"
                  style={tajawal}
                >
                  {counts.present}
                </p>
              </div>
              <div className={`${ds.card} p-3 text-center`}>
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  مستأذن
                </p>
                <p
                  className="text-xl font-bold text-warning"
                  style={tajawal}
                >
                  {counts.excused}
                </p>
              </div>
              <div className={`${ds.card} p-3 text-center`}>
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  غائب
                </p>
                <p className="text-xl font-bold text-destructive" style={tajawal}>
                  {counts.absent}
                </p>
              </div>
              <div className={`${ds.card} p-3 text-center`}>
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  الإجمالي
                </p>
                <p className="text-xl font-bold text-foreground" style={tajawal}>
                  {counts.total}
                </p>
              </div>
            </div>

            <div className={`${ds.card} overflow-hidden p-3 sm:p-4`}>
              <AttendanceDailyTable
                rows={rows.map((r) => ({
                  id: r.student_id,
                  full_name_ar: r.full_name_ar,
                  status: r.status,
                  has_record: r.has_record,
                  isDirty: r.isDirty,
                  entityView: entityType,
                  other_placement_name: r.other_placement_name,
                  show_shared_marker: Boolean(
                    r.has_record && r.other_placement_name?.trim(),
                  ),
                }))}
                disabled={saving}
                onStatusChange={pickStatus}
              />
            </div>
          </>
        ) : null}

        {rows.length > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className={ds.saveActionWrap}>
              <Button
                type="button"
                className={`w-full sm:w-auto ${ds.btnRound} ${ds.primaryActionBtn}`}
                disabled={loading || saving}
                onClick={() => void save()}
                style={tajawal}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                {saving ? "جاري الحفظ…" : "حفظ التحضير"}
              </Button>
              <p className="text-xs text-muted-foreground text-center" style={tajawal}>
                اضغط حفظ بعد تسجيل حالة كل طالب
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
