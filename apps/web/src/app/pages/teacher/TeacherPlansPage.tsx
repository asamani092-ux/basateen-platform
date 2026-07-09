import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  Lock,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { api, type StudentRow } from "../../lib/api-client";
import { getAuthUser } from "../../lib/auth-store";
import { getApiToken } from "../../lib/api-token";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";
import { PlanDayGrid } from "./PlanDayGrid";
import { PlanWizardDialog, type PlanWizardSeed } from "./PlanWizardDialog";

const PLAN_KIND_LABEL: Record<string, string> = {
  combined: "شاملة",
  hifz_new: "حفظ",
  muraja: "مراجعة",
  tilawa: "تلاوة",
};

const REST_DAYS_LABEL: Record<string, string> = {
  friday: "الجمعة",
  saturday: "السبت",
  friday_saturday: "الجمعة والسبت",
};

type PlanRow = {
  id: number;
  student_id: number;
  full_name_ar: string;
  plan_kind: string;
  daily_hifz_pages: number;
  daily_muraja_pages: number;
  daily_rabt_faces: number;
  repeat_target?: number;
  duration_weeks?: number | null;
  rest_days?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  days_remaining?: number | null;
  is_expired?: boolean;
  plan_status?: string;
  plan_status_ar?: string;
  total_working_days?: number;
  completed_days?: number;
  progress_pct?: number;
  circle_name: string | null;
};

type ReportRow = PlanRow & {
  daily_amount?: number;
  achieved?: number;
  target?: number;
  completion_pct?: number;
};

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
}

function printPlansReport() {
  document.body.classList.add("printing-teacher-plans");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("printing-teacher-plans");
  }, 500);
}

function dailyAmountLabel(p: PlanRow): string {
  if (p.plan_kind === "muraja") return `مراجعة ${p.daily_muraja_pages} ص/يوم`;
  if (p.plan_kind === "tilawa") return `ربط ${p.daily_rabt_faces} وجه/يوم`;
  if (p.plan_kind === "hifz_new") return `حفظ ${p.daily_hifz_pages} ص/يوم`;
  return `حفظ ${p.daily_hifz_pages} · مراجعة ${p.daily_muraja_pages} · ربط ${p.daily_rabt_faces}`;
}

function countdownLabel(p: PlanRow): string {
  if (p.is_expired || (p.days_remaining != null && p.days_remaining < 0)) {
    return "منتهية — يُرجى إغلاق الخطة يدوياً";
  }
  if (p.days_remaining == null) return "بدون تاريخ انتهاء";
  if (p.days_remaining === 0) {
    return "تنتهي اليوم";
  }
  return `تنتهي بعد ${p.days_remaining} يوماً`;
}

function planProgressPct(p: PlanRow): number {
  const total = p.total_working_days ?? 0;
  const done = p.completed_days ?? 0;
  if (p.progress_pct != null) return p.progress_pct;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export function TeacherPlansPage() {
  const canLoad = Boolean(getApiToken()) || isUiDevPreview();
  const teacherName = getAuthUser()?.full_name_ar ?? "—";
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardStudent, setWizardStudent] = useState<StudentRow | null>(null);
  const [editPlan, setEditPlan] = useState<PlanWizardSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  const [closeTarget, setCloseTarget] = useState<PlanRow | null>(null);
  const [permanentTarget, setPermanentTarget] = useState<PlanRow | null>(null);
  const [permanentStep, setPermanentStep] = useState<1 | 2>(1);
  const [permanentDayRecords, setPermanentDayRecords] = useState(0);
  const [permanentLoading, setPermanentLoading] = useState(false);
  const [followUpPlan, setFollowUpPlan] = useState<PlanRow | null>(null);

  const patchPlanProgress = useCallback(async (planId: number) => {
    try {
      const res = await api.teacherPlanDaysGet(planId);
      const total = Number(res.total_working_days) || 0;
      const completed = Number(res.completed_days) || 0;
      const pct = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
      const patch = {
        total_working_days: total,
        completed_days: completed,
        progress_pct: pct,
      };
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, ...patch } : p)),
      );
      setFollowUpPlan((prev) =>
        prev?.id === planId ? { ...prev, ...patch } : prev,
      );
    } catch {
      /* الحوار يبقى مفتوحاً */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!canLoad) {
      setStudents([]);
      setPlans([]);
      setReport([]);
      setLoading(false);
      return;
    }
    try {
      const [stuRes, planRes, reportRes] = await Promise.all([
        api.students(),
        api.teacherPlansList(),
        api.teacherPlansReport(),
      ]);
      setStudents(
        stuRes.items.filter((s) => s.admission_status !== "pending_placement"),
      );
      setPlans(planRes.items as PlanRow[]);
      setReport(reportRes.items as ReportRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, [canLoad]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plansByStudent = useMemo(() => {
    const map = new Map<number, PlanRow[]>();
    for (const p of plans) {
      const list = map.get(p.student_id) ?? [];
      list.push(p);
      map.set(p.student_id, list);
    }
    return map;
  }, [plans]);

  const reportCirclesLabel = useMemo(() => {
    const names = [
      ...new Set(report.map((r) => r.circle_name).filter(Boolean)),
    ] as string[];
    if (names.length === 0) return "—";
    if (names.length === 1) return names[0];
    return names.join(" · ");
  }, [report]);

  function openCreate(s: StudentRow) {
    setEditPlan(null);
    setWizardStudent(s);
  }

  function openEdit(s: StudentRow, p: PlanRow) {
    setEditPlan({
      id: p.id,
      plan_kind: p.plan_kind,
      daily_hifz_pages: p.daily_hifz_pages,
      daily_muraja_pages: p.daily_muraja_pages,
      daily_rabt_faces: p.daily_rabt_faces,
      repeat_target: p.repeat_target,
      duration_weeks: p.duration_weeks,
      rest_days: p.rest_days,
    });
    setWizardStudent(s);
  }

  async function confirmClosePlan() {
    if (!closeTarget) return;
    setBusyPlanId(closeTarget.id);
    setError(null);
    try {
      await api.teacherPlanDelete(closeTarget.id);
      setCloseTarget(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إغلاق الخطة");
    } finally {
      setBusyPlanId(null);
    }
  }

  async function openPermanentDelete(p: PlanRow) {
    setPermanentTarget(p);
    setPermanentStep(1);
    setPermanentDayRecords(0);
    setPermanentLoading(true);
    try {
      const res = await api.teacherPlanDaysGet(p.id);
      setPermanentDayRecords((res.days ?? []).length);
    } catch {
      setPermanentDayRecords(0);
    } finally {
      setPermanentLoading(false);
    }
  }

  async function confirmPermanentDelete() {
    if (!permanentTarget) return;
    setBusyPlanId(permanentTarget.id);
    setError(null);
    try {
      await api.teacherPlanPermanentDelete(permanentTarget.id);
      setPermanentTarget(null);
      setPermanentStep(1);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف النهائي");
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className={ds.pageShell}>
      <Card className={`${ds.card} print:hidden`}>
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <BookOpen className="size-5" />
            خطط الفصل — معالج الإعداد
          </CardTitle>
          <CardDescription style={tajawal}>
            يمكن للطالب أكثر من خطة نشطة في آن واحد. تُحسب الأيام باستثناء أيام
            العطلة المختارة (افتراضياً الجمعة والسبت).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className={`${ds.alert.error} text-sm`} style={tajawal}>
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              جاري التحميل…
            </p>
          ) : students.length === 0 ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              لا طلاب في نطاقك حالياً.
            </p>
          ) : (
            <ul className="space-y-4">
              {students.map((s) => {
                const studentPlans = plansByStudent.get(s.id) ?? [];
                return (
                  <li
                    key={s.id}
                    className={`${ds.card} space-y-3 p-3.5`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className={`${ds.page.data} font-semibold`} style={tajawal}>
                          {s.full_name_ar}
                        </p>
                        <p className={ds.page.caption} style={tajawal}>
                          {s.circle_name ?? "—"}
                          {studentPlans.length === 0 ? " · بلا خطة" : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className={`${ds.btnRound} ${ds.primaryActionBtn} gap-2`}
                        onClick={() => openCreate(s)}
                        style={tajawal}
                      >
                        <Plus className="size-4" />
                        خطة جديدة
                      </Button>
                    </div>

                    {studentPlans.length > 0 && (
                      <ul className="space-y-3">
                        {studentPlans.map((p) => {
                          const expired =
                            Boolean(p.is_expired) ||
                            (p.days_remaining != null && p.days_remaining < 0);
                          const total = p.total_working_days ?? 0;
                          const done = p.completed_days ?? 0;
                          const pct = planProgressPct(p);
                          return (
                            <li
                              key={p.id}
                              className={`space-y-3 rounded-2xl border p-3.5 ${
                                expired
                                  ? "border-border/70 bg-muted/30 text-muted-foreground"
                                  : "border-primary/25 bg-primary/5"
                              }`}
                            >
                              <div className="flex flex-col gap-3 min-w-0">
                                <div className="min-w-0 space-y-1">
                                  <div
                                    className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold"
                                    style={tajawal}
                                  >
                                    <span className="shrink-0">
                                      {PLAN_KIND_LABEL[p.plan_kind] ?? p.plan_kind}
                                    </span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="min-w-0 break-words">
                                      {dailyAmountLabel(p)}
                                    </span>
                                    {p.duration_weeks ? (
                                      <>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="shrink-0">
                                          {p.duration_weeks} أسابيع
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                  <p className="text-xs" style={tajawal}>
                                    {countdownLabel(p)}
                                  </p>
                                  {expired && (
                                    <p
                                      className="text-xs text-destructive font-semibold"
                                      style={tajawal}
                                    >
                                      انتهت مدة الخطة — اضغط «أغلق الخطة» عند الانتهاء
                                      من المتابعة.
                                    </p>
                                  )}
                                </div>

                                {total > 0 && (
                                  <div className="space-y-1.5">
                                    <div
                                      className="flex justify-between text-xs text-muted-foreground"
                                      style={tajawal}
                                    >
                                      <span>
                                        {done} من {total} يوماً
                                      </span>
                                      <span>{pct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full bg-primary transition-all"
                                        style={{
                                          width: `${Math.min(100, pct)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="default"
                                    className={`${ds.btnRound} min-h-11 w-full gap-1.5 px-3 sm:w-auto`}
                                    onClick={() => setFollowUpPlan(p)}
                                    style={tajawal}
                                  >
                                    <CalendarCheck className="size-4 shrink-0" />
                                    متابعة
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={`${ds.btnRound} min-h-11 w-full gap-1.5 px-3 sm:w-auto`}
                                    onClick={() => openEdit(s, p)}
                                    style={tajawal}
                                  >
                                    <Pencil className="size-4 shrink-0" />
                                    تعديل
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={expired ? "default" : "outline"}
                                    className={`${ds.btnRound} min-h-11 w-full gap-1.5 px-3 sm:w-auto`}
                                    disabled={busyPlanId === p.id}
                                    onClick={() => setCloseTarget(p)}
                                    style={tajawal}
                                  >
                                    <Lock className="size-4 shrink-0" />
                                    {expired ? "أغلق الخطة" : "إغلاق"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className={`${ds.btnRound} min-h-11 w-full gap-1.5 px-3 text-destructive hover:text-destructive sm:w-auto`}
                                    disabled={busyPlanId === p.id}
                                    onClick={() => void openPermanentDelete(p)}
                                    style={tajawal}
                                  >
                                    <Trash2 className="size-4 shrink-0" />
                                    حذف نهائي
                                  </Button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className={ds.card} id="teacher-plans-report-print">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:hidden">
          <div className="space-y-1.5">
            <CardTitle style={tajawal}>تقرير خطط الطلاب</CardTitle>
            <CardDescription style={tajawal}>
              جميع الخطط (نشطة، منتهية، مغلقة) — المنجز والمستهدف مشتقان من المقدار
              اليومي.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`${ds.btnRound} min-h-11 gap-2 px-4`}
              onClick={() => setShowReport((v) => !v)}
              style={tajawal}
            >
              {showReport ? "إخفاء" : "عرض التقرير"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`${ds.btnRound} min-h-11 gap-2 px-4`}
              disabled={report.length === 0}
              onClick={printPlansReport}
              style={tajawal}
            >
              <Printer className="size-4" />
              طباعة التقرير
            </Button>
          </div>
        </CardHeader>

        <div className="teacher-plans-print-header hidden print:block border-b border-black pb-3 mb-4 px-6 pt-6">
          <h2 className="text-xl font-bold" style={tajawal}>
            تقرير خطط الطلاب
          </h2>
          <p className="text-sm font-medium mt-1" style={tajawal}>
            المعلم: {teacherName}
          </p>
          <p className="text-sm font-medium" style={tajawal}>
            الحلقة / المسار: {reportCirclesLabel}
          </p>
          <p className="text-sm" style={tajawal}>
            التاريخ: {todayLabel()}
          </p>
        </div>

        <CardContent
          className={`overflow-x-auto ${showReport ? "" : "hidden print:block"}`}
        >
            {report.length === 0 ? (
              <p className="text-sm text-muted-foreground print:hidden" style={tajawal}>
                لا خطط في نطاقك.
              </p>
            ) : (
              <table className={`${ds.printTable} w-full text-xs border-collapse min-w-full`}>
                <thead>
                  <tr className="border-b text-muted-foreground print:text-black">
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      الطالب
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      النوع
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      المقدار
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      العطلة
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      البداية–النهاية
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      الأيام
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      منجَز / مستهدف
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      %
                    </th>
                    <th className={`${ds.table.head} print:border print:border-black`} style={tajawal}>
                      الحالة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/50 print:break-inside-avoid"
                    >
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {r.full_name_ar}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {PLAN_KIND_LABEL[r.plan_kind] ?? r.plan_kind}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {dailyAmountLabel(r)}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {REST_DAYS_LABEL[String(r.rest_days)] ?? r.rest_days}
                      </td>
                      <td
                        className={`${ds.table.cell} whitespace-nowrap print:border print:border-black`}
                        style={tajawal}
                      >
                        {String(r.starts_at ?? "—").slice(0, 10)} →{" "}
                        {String(r.ends_at ?? "—").slice(0, 10)}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {r.completed_days ?? 0}/{r.total_working_days ?? 0}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {Math.round(Number(r.achieved) || 0)} /{" "}
                        {Math.round(Number(r.target) || 0)}
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {r.completion_pct ?? 0}%
                      </td>
                      <td className={`${ds.table.cell} print:border print:border-black`} style={tajawal}>
                        {r.plan_status_ar ?? r.plan_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(closeTarget)} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className={ds.dialog}>
          <DialogHeader>
            <DialogTitle style={tajawal}>إغلاق الخطة</DialogTitle>
            <DialogDescription style={tajawal}>
              {closeTarget
                ? `إغلاق خطة ${closeTarget.full_name_ar}؟ تُحفظ سجلات المتابعة ولا تُحذف.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className={`${ds.btnRound} min-h-11`}
              onClick={() => setCloseTarget(null)}
              style={tajawal}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              className={`${ds.btnRound} min-h-11`}
              disabled={busyPlanId != null}
              onClick={() => void confirmClosePlan()}
              style={tajawal}
            >
              إغلاق الخطة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(permanentTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setPermanentTarget(null);
            setPermanentStep(1);
          }
        }}
      >
        <DialogContent className={ds.dialog}>
          {permanentStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle style={tajawal}>حذف نهائي للخطة</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm text-muted-foreground" style={tajawal}>
                    {permanentTarget && (
                      <>
                        <p>
                          سيتم حذف خطة <strong>{permanentTarget.full_name_ar}</strong> نهائياً
                          من النظام.
                        </p>
                        <p>
                          {permanentLoading
                            ? "جاري عد سجلات المتابعة…"
                            : `سيُحذف معها ${permanentDayRecords} سجل متابعة يومية.`}
                        </p>
                        <p className="text-destructive font-semibold">
                          لا يمكن التراجع عن هذا الإجراء.
                        </p>
                      </>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className={`${ds.btnRound} min-h-11`}
                  onClick={() => setPermanentTarget(null)}
                  style={tajawal}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={`${ds.btnRound} min-h-11`}
                  disabled={permanentLoading}
                  onClick={() => setPermanentStep(2)}
                  style={tajawal}
                >
                  متابعة الحذف
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle style={tajawal}>تأكيد الحذف النهائي</DialogTitle>
                <DialogDescription style={tajawal}>
                  اضغط الزر أدناه لتأكيد الحذف الدائم للخطة وسجلاتها.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className={`${ds.btnRound} min-h-11`}
                  onClick={() => setPermanentStep(1)}
                  style={tajawal}
                >
                  رجوع
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={`${ds.btnRound} min-h-11`}
                  disabled={busyPlanId != null}
                  onClick={() => void confirmPermanentDelete()}
                  style={tajawal}
                >
                  نعم، احذف نهائياً
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(followUpPlan)}
        onOpenChange={(o) => {
          if (!o) setFollowUpPlan(null);
        }}
      >
        <DialogContent
          className={`${ds.dialog} max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-lg`}
        >
          {followUpPlan && (
            <>
              <DialogHeader>
                <DialogTitle style={tajawal}>
                  متابعة يومية — {followUpPlan.full_name_ar}
                </DialogTitle>
                <DialogDescription style={tajawal}>
                  أيام العمل فقط — اضغط يوماً بين منجَز وغير منجَز.
                </DialogDescription>
              </DialogHeader>
              <PlanDayGrid
                planId={followUpPlan.id}
                startsAt={followUpPlan.starts_at}
                endsAt={followUpPlan.ends_at}
                restDays={followUpPlan.rest_days}
                onSaved={() => void patchPlanProgress(followUpPlan.id)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className={`${ds.btnRound} min-h-11`}
                  onClick={() => setFollowUpPlan(null)}
                  style={tajawal}
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {wizardStudent && (
        <PlanWizardDialog
          student={wizardStudent}
          open={Boolean(wizardStudent)}
          onOpenChange={(o) => {
            if (!o) {
              setWizardStudent(null);
              setEditPlan(null);
            }
          }}
          onSaved={() => void refresh()}
          editPlan={editPlan}
        />
      )}
    </div>
  );
}
