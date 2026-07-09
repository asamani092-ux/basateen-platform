import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
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
import { PlanWizardDialog, type PlanWizardSeed } from "./PlanWizardDialog";

const PLAN_KIND_LABEL: Record<string, string> = {
  combined: "شاملة",
  hifz_new: "حفظ",
  muraja: "مراجعة",
  tilawa: "تلوة",
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
  starts_at?: string | null;
  ends_at?: string | null;
  days_remaining?: number | null;
  is_expired?: boolean;
  circle_name: string | null;
};

function dailyAmountLabel(p: PlanRow): string {
  if (p.plan_kind === "muraja") return `مراجعة ${p.daily_muraja_pages} ص/يوم`;
  if (p.plan_kind === "tilawa") return `ربط ${p.daily_rabt_faces} وجه/يوم`;
  if (p.plan_kind === "hifz_new") return `حفظ ${p.daily_hifz_pages} ص/يوم`;
  return `حفظ ${p.daily_hifz_pages} · مراجعة ${p.daily_muraja_pages} · ربط ${p.daily_rabt_faces}`;
}

function countdownLabel(p: PlanRow): string {
  if (p.is_expired || (p.days_remaining != null && p.days_remaining < 0)) {
    return "منتهية";
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
  const [loading, setLoading] = useState(true);
  const [wizardStudent, setWizardStudent] = useState<StudentRow | null>(null);
  const [editPlan, setEditPlan] = useState<PlanWizardSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!canLoad) {
      setStudents([]);
      setPlans([]);
      setLoading(false);
      return;
    }
    try {
      const [stuRes, planRes] = await Promise.all([
        api.students(),
        api.teacherPlansList(),
      ]);
      setStudents(
        stuRes.items.filter((s) => s.admission_status !== "pending_placement"),
      );
      setPlans(planRes.items as PlanRow[]);
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
    });
    setWizardStudent(s);
  }

  async function deletePlan(planId: number) {
    if (!window.confirm("حذف هذه الخطة؟ لن تُحذف الخطط الأخرى للطالب.")) return;
    setDeletingId(planId);
    setError(null);
    try {
      await api.teacherPlanDelete(planId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف الخطة");
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
            يمكن للطالب أكثر من خطة نشطة في آن واحد (مثلاً مراجعة أسبوعين + حفظ).
            حدّد المدة بالأسابيع قبل التأكيد.
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
                          return (
                            <li
                              key={p.id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                                expired
                                  ? "border-border/60 bg-muted/40 text-muted-foreground"
                                  : "border-primary/20 bg-primary/5"
                              }`}
                            >
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
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
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
                                  variant="ghost"
                                  className={`${ds.btnRound} h-8 px-2 text-destructive`}
                                  disabled={deletingId === p.id}
                                  onClick={() => void deletePlan(p.id)}
                                  style={tajawal}
                                  title="حذف"
                                >
                                  <Trash2 className="size-3.5" />
                                  حذف
                                </Button>
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
