import { useCallback, useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
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
import { PlanWizardDialog } from "./PlanWizardDialog";

type PlanRow = {
  id: number;
  student_id: number;
  full_name_ar: string;
  plan_kind: string;
  daily_hifz_pages: number;
  daily_muraja_pages: number;
  daily_rabt_faces: number;
  circle_name: string | null;
};

export function TeacherPlansPage() {
  const canLoad = Boolean(getApiToken()) || isUiDevPreview();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardStudent, setWizardStudent] = useState<StudentRow | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const planByStudent = new Map(plans.map((p) => [p.student_id, p]));

  return (
    <div className="space-y-4">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <BookOpen className="size-5" />
            خطط الفصل — معالج الإعداد
          </CardTitle>
          <CardDescription style={tajawal}>
            في بداية الفصل، حدّد نوع الخطة والمقدار اليومي مع بطاقة تقدير حية قبل
            التأكيد.
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
              لا طلاب في حلقاتك حالياً.
            </p>
          ) : (
            <ul className="space-y-2">
              {students.map((s) => {
                const plan = planByStudent.get(s.id);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 border rounded-xl px-3 py-3"
                  >
                    <div>
                      <p className="font-medium text-sm" style={tajawal}>
                        {s.full_name_ar}
                      </p>
                      <p className="text-xs text-muted-foreground" style={tajawal}>
                        {s.circle_name ?? "—"}
                        {plan
                          ? ` · حفظ ${plan.daily_hifz_pages} ص · ربط ${plan.daily_rabt_faces} وجه`
                          : " · بلا خطة"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={plan ? "outline" : "default"}
                      className={ds.btnRound}
                      onClick={() => setWizardStudent(s)}
                      style={tajawal}
                    >
                      <Plus className="size-3.5" />
                      {plan ? "تعديل الخطة" : "بناء الخطة"}
                    </Button>
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
          onOpenChange={(o) => !o && setWizardStudent(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
