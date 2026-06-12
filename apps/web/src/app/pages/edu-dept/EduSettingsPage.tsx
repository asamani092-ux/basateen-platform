import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import {
  totalEnabledMaxScore,
  totalEnabledWeight,
  type EvalCriterion,
} from "../../lib/evaluation-criteria";
import { ds, tajawal } from "../../lib/design-system";

function newTaskId(): string {
  return `task_${Date.now().toString(36)}`;
}

type TaskForm = {
  id: string;
  name: string;
  type: "points" | "penalty";
  max_weight: number;
  input: "boolean" | "number";
  enabled: boolean;
};

const emptyForm = (): TaskForm => ({
  id: newTaskId(),
  name: "",
  type: "points",
  max_weight: 1,
  input: "boolean",
  enabled: true,
});

export function EduSettingsPage() {
  const [criteria, setCriteria] = useState<EvalCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm());

  const totalScore = useMemo(() => totalEnabledMaxScore(criteria), [criteria]);
  const positiveScore = useMemo(() => totalEnabledWeight(criteria), [criteria]);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptSettingsGet();
      setCriteria(res.settings.evaluation_criteria ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: EvalCriterion[]) {
    setSaving(true);
    setError(null);
    try {
      await api.eduDeptSettingsPatch({ evaluation_criteria: next });
      setCriteria(next);
      toast.success("تم حفظ مهام التقييم.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(task: EvalCriterion) {
    setEditingId(task.id);
    setForm({
      id: task.id,
      name: task.name,
      type: task.type,
      max_weight: task.max_weight,
      input: task.input ?? (task.type === "penalty" ? "number" : "boolean"),
      enabled: task.enabled !== false,
    });
    setModalOpen(true);
  }

  async function saveTask() {
    if (!form.name.trim()) return;
    const entry: EvalCriterion = {
      id: form.id,
      name: form.name.trim(),
      type: form.type,
      max_weight: form.max_weight,
      input: form.type === "penalty" ? "number" : form.input,
      enabled: form.enabled,
    };
    const next = editingId
      ? criteria.map((c) => (c.id === editingId ? entry : c))
      : [...criteria, entry];
    await persist(next);
    setModalOpen(false);
  }

  async function deleteTask(id: string) {
    const next = criteria.filter((c) => c.id !== id);
    await persist(next);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <Settings2 className="w-7 h-7 text-primary" />
          إعدادات التعليم العامة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          محرك تقييم ديناميكي — أضف مهاماً بلا حدود مع أوزان مخصصة لكل مهمة.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-5 space-y-3 border-primary/20`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground" style={tajawal}>
              إجمالي درجة التقييم اليومي
            </p>
            <p className="text-3xl font-bold tabular-nums" style={tajawal}>
              {totalScore} نقطة
            </p>
            <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
              مجموع أوزان المهام المفعّلة: {positiveScore} · الحد اليومي = مجموع الأوزان المفعّلة
            </p>
          </div>
          <Button
            type="button"
            className={ds.btnRound}
            onClick={openAdd}
            disabled={saving}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            إضافة مهمة تقييم جديدة
          </Button>
        </div>
        <Progress value={Math.min(100, totalScore)} className="h-2" />
      </div>

      <Accordion type="single" collapsible defaultValue="tasks" className={ds.card}>
        <AccordionItem value="tasks" className="border-0">
          <AccordionTrigger className="px-5 py-4 hover:no-underline" style={tajawal}>
            <span className="font-semibold">
              مهام التقييم الحالية ({criteria.length})
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-4">
            {loading ? (
              <p className="text-sm text-muted-foreground" style={tajawal}>
                جاري التحميل…
              </p>
            ) : criteria.length === 0 ? (
              <p className="text-sm text-muted-foreground" style={tajawal}>
                لا توجد مهام بعد. أضف أول مهمة تقييم.
              </p>
            ) : (
              <ul className="space-y-2">
                {criteria.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 py-3 border-b last:border-0"
                  >
                    <div className="min-w-0" style={tajawal}>
                      <p className="font-semibold truncate">{task.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.enabled === false ? "معطّلة · " : ""}
                        {task.type === "points" ? "إضافة نقاط" : "خصم / عقوبة"} ·{" "}
                        {task.max_weight} ·{" "}
                        {task.input === "number" || task.type === "penalty"
                          ? "رقمي"
                          : "منجز / غير منجز"}
                        {task.requires_all?.length
                          ? ` · يتطلب: ${task.requires_all.join(" + ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={ds.btnRound}
                        disabled={saving}
                        onClick={() =>
                          void persist(
                            criteria.map((c) =>
                              c.id === task.id
                                ? { ...c, enabled: c.enabled === false }
                                : c,
                            ),
                          )
                        }
                        style={tajawal}
                      >
                        {task.enabled === false ? "تفعيل" : "تعطيل"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={ds.btnRound}
                        onClick={() => openEdit(task)}
                        title="تعديل"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`${ds.btnRound} text-destructive`}
                        onClick={() => void deleteTask(task.id)}
                        disabled={saving}
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>
              {editingId ? "تعديل مهمة التقييم" : "إضافة مهمة تقييم جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>اسم المهمة</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={ds.btnRound}
                placeholder="مثال: الحفظ، الربط، الحضور"
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>نوع المهمة</Label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as "points" | "penalty",
                    input: e.target.value === "penalty" ? "number" : f.input,
                  }))
                }
                className="w-full rounded-xl border border-border px-3 py-2"
                style={tajawal}
              >
                <option value="points">إضافة نقاط</option>
                <option value="penalty">خصم / عقوبة</option>
              </select>
            </div>
            {form.type === "points" && (
              <div className="space-y-2">
                <Label style={tajawal}>طريقة الإدخال</Label>
                <select
                  value={form.input}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      input: e.target.value as "boolean" | "number",
                    }))
                  }
                  className="w-full rounded-xl border border-border px-3 py-2"
                  style={tajawal}
                >
                  <option value="boolean">منجز / غير منجز</option>
                  <option value="number">قيمة رقمية</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm" style={tajawal}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="size-4 rounded border-border"
              />
              مفعّلة في الرصد اليومي والمنافسات
            </label>
            <div className="space-y-2">
              <Label style={tajawal}>
                {form.type === "points" ? "الدرجة / الوزن" : "قيمة الخصم لكل وحدة"}
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={form.max_weight}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_weight: Number(e.target.value) }))
                }
                className={ds.btnRound}
              />
            </div>
            <Button
              type="button"
              className={`w-full ${ds.btnRound}`}
              disabled={!form.name.trim() || saving}
              onClick={() => void saveTask()}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : editingId ? "حفظ التعديل" : "إضافة المهمة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
