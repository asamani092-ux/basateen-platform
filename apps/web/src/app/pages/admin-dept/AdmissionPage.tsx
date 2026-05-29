import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { AdmissionForm, type AdmissionFormValues } from "./AdmissionForm";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

const STAGE_TO_CIRCLE_STAGE: Record<string, string> = {
  "1": "tlaqeen",
  "2": "primary",
  "3": "middle",
  "4": "secondary",
};

export function AdmissionPage() {
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [circleId, setCircleId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("");

  useEffect(() => {
    if (!canUseApi()) return;
    api.circles().then((r) => setCircles(r.items ?? [])).catch(() => setCircles([]));
  }, []);

  const filteredCircles = useMemo(() => {
    if (!stageFilter) return circles;
    const stageKey = STAGE_TO_CIRCLE_STAGE[stageFilter];
    return circles.filter((c) => {
      const sid = c.stage_id ?? 0;
      if (stageKey && c.stage) return c.stage === stageKey;
      return String(sid) === stageFilter || sid === Number(stageFilter);
    });
  }, [circles, stageFilter]);

  async function handleSubmit(values: AdmissionFormValues) {
    if (!circleId) {
      setError("اختر الحلقة لتوجيه الطالب");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.adminDeptAdmission({
        full_name_ar: values.full_name_ar.trim(),
        national_id: values.national_id.trim(),
        guardian_phone: values.guardian_phone.trim(),
        stage_id: Number(values.stage_id),
        circle_id: Number(circleId),
        phone: values.phone.trim() || undefined,
        school_grade: values.school_grade.trim() || undefined,
        age: values.age.trim() ? Number(values.age) : null,
        guardian_national_id: values.guardian_national_id.trim() || undefined,
        guardian_work: values.guardian_work.trim() || undefined,
        health_notes: values.health_notes.trim() || undefined,
      });
      setSuccess(
        `تم تسجيل الطالب (رقم ${res.student_id}) في ${res.stage_label ?? "المرحلة"} وتوجيهه للحلقة.`,
      );
      setModalOpen(false);
      setCircleId("");
      setStageFilter("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التسجيل";
      if (msg === "admin_dept_error") {
        setError("تم الحفظ لكن حدث خطأ لاحق في السيرفر — حدّث الصفحة للتحقق.");
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-[900px]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            القبول والتسجيل
          </h2>
          <p className={ds.page.description} style={tajawal}>
            تسجيل مباشر في النظام مع اختيار المرحلة والحلقة — بدون طابور طلبات.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={`${ds.btnRound} shrink-0`}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setModalOpen(true);
          }}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          إضافة طالب جديد
        </Button>
      </div>

      {error && !modalOpen && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className={`${ds.card} max-w-lg max-h-[90vh] overflow-y-auto`}
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle style={tajawal}>إضافة طالب جديد</DialogTitle>
            <DialogDescription style={tajawal}>
              أدخل بيانات الطالب واختر المرحلة والحلقة للتوجيه.
            </DialogDescription>
          </DialogHeader>

          {error && modalOpen && (
            <p className={ds.alert.error} style={tajawal}>
              {error}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label style={tajawal}>فلتر الحلقات حسب المرحلة</Label>
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setCircleId("");
                }}
                className={ds.select}
                style={tajawal}
              >
                <option value="">كل المراحل</option>
                <option value="1">تلقين</option>
                <option value="2">ابتدائي</option>
                <option value="3">متوسط</option>
                <option value="4">ثانوي</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label style={tajawal}>الحلقة *</Label>
              <Select value={circleId} onValueChange={setCircleId}>
                <SelectTrigger className={ds.btnRound}>
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCircles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AdmissionForm onSubmit={handleSubmit} submitting={submitting} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
