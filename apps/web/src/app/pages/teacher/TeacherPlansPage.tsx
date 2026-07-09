import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { api, type StudentRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";
import { PlanDaysDialog } from "./PlanDaysDialog";
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
    return "يوجد خطة للطالب وتنتهي اليوم";
  }
  return `يوجد خطة للطالب وتنتهي بعد ${p.days_remaining} يوماً`;
}

export function TeacherPlansPage() {
  const canLoad = Boolean(getApiToken()) || isUiDevPreview();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardStudent, setWizardStudent] = useState<StudentRow | null>(null);
  const [editPlan, setEditPlan] = useState<PlanWizardSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [daysPlan, setDaysPlan] = useState<PlanRow | null>(null);
  const [showReport, setShowReport] = useState(false);

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

  async function closePlan(planId: number) {
    if (!window.confirm("إغلاق هذه الخطة؟ تُحفظ سجلات المتابعة ولا تُحذف.")) return;
    setDeletingId(planId);
    setError(null);
    try {
      await api.teacherPlanDelete(planId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إغلاق الخطة");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <BookOpen className="size-5" />
            خطط الفصل — معالج الإعداد
          </CardTitle>
          <CardDescription style={tajawal}>
            يمكن للطالب أكثر من خطة نشطة في آن واحد. تُحسب أيام العمل باستثناء أيام
            العطلة المختارة (افتراضياً الجمعة والسبت).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive mb-3" style={tajawal}>
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
            <ul className="space-y-3">
              {students.map((s) => {
                const studentPlans = plansByStudent.get(s.id) ?? [];
                return (
                  <li
                    key={s.id}
                    className="border rounded-xl px-3 py-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm" style={tajawal}>
                          {s.full_name_ar}
                        </p>
                        <p className="text-xs text-muted-foreground" style={tajawal}>
                          {s.circle_name ?? "—"}
                          {studentPlans.length === 0 ? " · بلا خطة" : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className={ds.btnRound}
                        onClick={() => openCreate(s)}
                        style={tajawal}
                      >
                        <Plus className="size-3.5" />
                        خطة جديدة
                      </Button>
                    </div>

                    {studentPlans.length > 0 && (
                      <ul className="space-y-1.5">
                        {studentPlans.map((p) => {
                          const expired =
                            Boolean(p.is_expired) ||
                            (p.days_remaining != null && p.days_remaining < 0);
                          const total = p.total_working_days ?? 0;
                          const done = p.completed_days ?? 0;
                          const pct =
                            p.progress_pct ??
                            (total > 0 ? Math.round((done / total) * 100) : 0);
                          return (
                            <li
                              key={p.id}
                              className={`flex flex-col gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                                expired
                                  ? "border-border/60 bg-muted/40 text-muted-foreground"
                                  : "border-primary/20 bg-primary/5"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 space-y-0.5">
                                  <p className="font-medium" style={tajawal}>
                                    {PLAN_KIND_LABEL[p.plan_kind] ?? p.plan_kind}
                                    {" · "}
                                    {dailyAmountLabel(p)}
                                    {p.duration_weeks
                                      ? ` · ${p.duration_weeks} أسابيع`
                                      : ""}
                                  </p>
                                  <p style={tajawal}>{countdownLabel(p)}</p>
                                  {expired && (
                                    <p
                                      className="text-destructive font-medium"
                                      style={tajawal}
                                    >
                                      انتهت مدة الخطة — اضغط «أغلق الخطة» عند الانتهاء من
                                      المتابعة.
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0 flex-wrap">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={`${ds.btnRound} h-8 px-2`}
                                    onClick={() => setDaysPlan(p)}
                                    style={tajawal}
                                    title="متابعة يومية"
                                  >
                                    <CalendarCheck className="size-3.5" />
                                    متابعة
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className={`${ds.btnRound} h-8 px-2`}
                                    onClick={() => openEdit(s, p)}
                                    style={tajawal}
                                    title="تعديل"
                                  >
                                    <Pencil className="size-3.5" />
                                    تعديل
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={expired ? "default" : "ghost"}
                                    className={`${ds.btnRound} h-8 px-2 ${
                                      expired ? "" : "text-destructive"
                                    }`}
                                    disabled={deletingId === p.id}
                                    onClick={() => void closePlan(p.id)}
                                    style={tajawal}
                                    title={expired ? "أغلق الخطة" : "إغلاق"}
                                  >
                                    <Trash2 className="size-3.5" />
                                    {expired ? "أغلق الخطة" : "إغلاق"}
                                  </Button>
                                </div>
                              </div>
                              {total > 0 && (
                                <div className="space-y-0.5">
                                  <div
                                    className="flex justify-between text-[11px]"
                                    style={tajawal}
                                  >
                                    <span>
                                      {done} من {total} يوماً
                                    </span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all"
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
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

      <Card className={ds.card}>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle style={tajawal}>تقرير خطط الطلاب</CardTitle>
            <CardDescription style={tajawal}>
              جميع الخطط (نشطة، منتهية، مغلقة) — المنجز والمستهدف مشتقان من المقدار
              اليومي.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ds.btnRound}
            onClick={() => setShowReport((v) => !v)}
            style={tajawal}
          >
            {showReport ? "إخفاء" : "عرض التقرير"}
          </Button>
        </CardHeader>
        {showReport && (
          <CardContent className="overflow-x-auto">
            {report.length === 0 ? (
              <p className="text-sm text-muted-foreground" style={tajawal}>
                لا خطط في نطاقك.
              </p>
            ) : (
              <table className="w-full text-xs border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-start py-2 px-1" style={tajawal}>
                      الطالب
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      النوع
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      المقدار
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      العطلة
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      البداية–النهاية
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      أيام العمل
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      منجَز / مستهدف
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      %
                    </th>
                    <th className="text-start py-2 px-1" style={tajawal}>
                      الحالة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 px-1" style={tajawal}>
                        {r.full_name_ar}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {PLAN_KIND_LABEL[r.plan_kind] ?? r.plan_kind}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {dailyAmountLabel(r)}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {REST_DAYS_LABEL[String(r.rest_days)] ?? r.rest_days}
                      </td>
                      <td className="py-2 px-1 whitespace-nowrap" style={tajawal}>
                        {String(r.starts_at ?? "—").slice(0, 10)} →{" "}
                        {String(r.ends_at ?? "—").slice(0, 10)}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {r.completed_days ?? 0}/{r.total_working_days ?? 0}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {Math.round(Number(r.achieved) || 0)} /{" "}
                        {Math.round(Number(r.target) || 0)}
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {r.completion_pct ?? 0}%
                      </td>
                      <td className="py-2 px-1" style={tajawal}>
                        {r.plan_status_ar ?? r.plan_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        )}
      </Card>

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

      {daysPlan && (
        <PlanDaysDialog
          planId={daysPlan.id}
          studentName={daysPlan.full_name_ar}
          open={Boolean(daysPlan)}
          onOpenChange={(o) => {
            if (!o) setDaysPlan(null);
          }}
          onSaved={() => void refresh()}
          totalWorkingDays={daysPlan.total_working_days}
          completedDays={daysPlan.completed_days}
        />
      )}
    </div>
  );
}
