import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { toast } from "sonner";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type QuizRow = {
  id: number;
  title_ar: string;
  status: string;
  access_code: string | null;
  total_points: number;
  question_count: number;
  attempts_count: number;
  show_score_instantly?: number;
};

type QuestionDraft = {
  question_type: "mcq" | "true_false" | "text";
  prompt_ar: string;
  points: number;
  correct_answer: string;
  options: string[];
  sort_order: number;
};

type ResponseRow = {
  source: string;
  student_name: string;
  student_phone: string | null;
  total_score: number | null;
  score_percent: number | null;
  submitted_at: string;
};

function emptyQuestion(order: number): QuestionDraft {
  return {
    question_type: "mcq",
    prompt_ar: "",
    points: 1,
    correct_answer: "",
    options: ["", "", ""],
    sort_order: order,
  };
}

export function QuizBuilderPage() {
  const [items, setItems] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showScore, setShowScore] = useState(true);
  const [customMessage, setCustomMessage] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion(0)]);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.progQuizzesList();
      setItems(res.items as QuizRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحميل";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteTarget = useMemo(
    () => items.find((q) => q.id === deleteId) ?? null,
    [items, deleteId],
  );

  async function loadResponses(quizId: number) {
    setResponsesLoading(true);
    try {
      const res = await api.progQuizResponses(quizId);
      setResponses(res.items);
    } catch {
      setResponses([]);
    } finally {
      setResponsesLoading(false);
    }
  }

  function toggleExpand(quizId: number) {
    if (expandedId === quizId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(quizId);
    void loadResponses(quizId);
  }

  function openCreate() {
    setEditId(null);
    setTitleAr("");
    setAccessCode("");
    setShowScore(true);
    setCustomMessage("");
    setQuestions([emptyQuestion(0)]);
    setFormOpen(true);
  }

  async function openEdit(quizId: number) {
    setEditId(quizId);
    setError(null);
    try {
      const res = await api.progQuizDetail(quizId);
      const q = res.quiz;
      setTitleAr(String(q.title_ar ?? ""));
      setAccessCode(String(q.access_code ?? ""));
      setShowScore(Number(q.show_score_instantly ?? 1) === 1);
      setCustomMessage(String(q.custom_success_message ?? ""));
      const qs = (res.questions as Array<Record<string, unknown>>).map((row, i) => {
        let options: string[] = [];
        try {
          options = JSON.parse(String(row.options_json ?? "[]")) as string[];
        } catch {
          options = [];
        }
        const qType = String(row.question_type);
        let correct = String(row.correct_answer ?? "");
        if (qType === "true_false") {
          correct = correct === "false" ? "خطأ" : "صح";
        }
        return {
          question_type:
            qType === "true_false" ? "true_false" : qType === "text" ? "text" : "mcq",
          prompt_ar: String(row.prompt_ar ?? ""),
          points: Number(row.points) || 1,
          correct_answer: correct,
          options: qType === "mcq" ? options : qType === "true_false" ? ["صح", "خطأ"] : [],
          sort_order: Number(row.sort_order ?? i),
        } as QuestionDraft;
      });
      setQuestions(qs.length ? qs : [emptyQuestion(0)]);
      setFormOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل فتح التعديل");
    }
  }

  function buildQuestionPayload() {
    return questions
      .filter((q) => q.prompt_ar.trim())
      .map((q, i) => ({
        question_type: q.question_type,
        prompt_ar: q.prompt_ar.trim(),
        points: q.points,
        correct_answer: q.correct_answer,
        options: q.question_type === "mcq" ? q.options.filter(Boolean) : q.options,
        sort_order: i,
      }));
  }

  async function saveQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!titleAr.trim()) {
      setError("اسم الاختبار مطلوب");
      return;
    }
    if (!accessCode.trim()) {
      setError("رمز المرور للاختبار مطلوب");
      return;
    }
    const payload = buildQuestionPayload();
    if (payload.length === 0) {
      setError("أضف سؤالاً واحداً على الأقل");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editId == null) {
        await api.progQuizCreate({
          title_ar: titleAr.trim(),
          access_code: accessCode.trim(),
          show_score_instantly: showScore,
          custom_success_message: customMessage.trim() || null,
          questions: payload,
        });
      } else {
        await api.progQuizPatch(editId, {
          title_ar: titleAr.trim(),
          access_code: accessCode.trim(),
          show_score_instantly: showScore,
          custom_success_message: customMessage.trim() || null,
        });
        await api.progQuizQuestionsSave(editId, payload);
        await api.progQuizPublish(editId);
      }
      setFormOpen(false);
      const okMsg = editId ? "تم تحديث الاختبار ونشره." : "تم إنشاء الاختبار ونشره.";
      setSuccess(okMsg);
      toast.success(okMsg);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الحفظ";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuiz() {
    if (deleteId == null) return;
    await api.progQuizDelete(deleteId);
    setDeleteId(null);
    if (expandedId === deleteId) setExpandedId(null);
    setSuccess("تم حذف الاختبار.");
    await load();
  }

  function copyQuizLink(id: number) {
    const url = `${window.location.origin}/public/quiz/${id}`;
    void navigator.clipboard.writeText(url);
    setSuccess("تم نسخ رابط الاختبار.");
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-[1400px] text-right">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2 justify-start`} style={tajawal}>
            <ClipboardList className="w-7 h-7 text-primary shrink-0" />
            إختبارات إشراف البرامج
          </h2>
          <p className={ds.page.description} style={tajawal}>
            إنشاء الاختبارات برمز مرور، بناء الأسئلة، ومتابعة النتائج.
          </p>
        </div>
        <Button
          type="button"
          className={cn(ds.btnRound, "rounded-full")}
          onClick={openCreate}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          اختبار جديد
        </Button>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <div className={`${ds.card} overflow-x-auto text-right`} dir="rtl">
        <Table className={ds.tableMin}>
          <TableHeader>
            <TableRow>
              <TableHead className={ds.table.head} style={tajawal}>
                الاختبار
              </TableHead>
              <TableHead className={ds.table.head} style={tajawal}>
                الأسئلة
              </TableHead>
              <TableHead className={ds.table.head} style={tajawal}>
                التسليمات
              </TableHead>
              <TableHead className={ds.table.headActionsWide} style={tajawal}>
                إجراءات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((q) => (
              <Fragment key={q.id}>
                <TableRow className="cursor-pointer" onClick={() => toggleExpand(q.id)}>
                  <TableCell className={`${ds.table.cell} font-medium`} style={tajawal}>
                    {q.title_ar}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {q.question_count}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {q.attempts_count}
                  </TableCell>
                  <TableActionsCell wide>
                    <div onClick={(e) => e.stopPropagation()} className={ds.table.actionsWrapWide}>
                      <TableIconAction kind="copy" label="نسخ الرابط" onClick={() => copyQuizLink(q.id)} />
                      <TableIconAction kind="edit" onClick={() => void openEdit(q.id)} />
                      <TableIconAction kind="delete" onClick={() => setDeleteId(q.id)} />
                    </div>
                  </TableActionsCell>
                </TableRow>
                {expandedId === q.id && (
                  <TableRow key={`${q.id}-responses`}>
                    <TableCell colSpan={4} className="bg-muted/30 p-4">
                      {responsesLoading ? (
                        <p className="text-sm text-muted-foreground" style={tajawal}>
                          جاري تحميل النتائج…
                        </p>
                      ) : responses.length === 0 ? (
                        <p className={ds.alert.info} style={tajawal}>
                          لا توجد تسليمات بعد.
                        </p>
                      ) : (
                        <Table className={ds.tableMin}>
                          <TableHeader>
                            <TableRow>
                              <TableHead className={ds.table.head} style={tajawal}>
                                الطالب
                              </TableHead>
                              <TableHead className={ds.table.head} style={tajawal}>
                                الجوال
                              </TableHead>
                              <TableHead className={ds.table.head} style={tajawal}>
                                الدرجة
                              </TableHead>
                              <TableHead className={ds.table.head} style={tajawal}>
                                التاريخ
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {responses.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className={ds.table.cell} style={tajawal}>
                                  {r.student_name}
                                </TableCell>
                                <TableCell className={ds.table.cell} dir="ltr">
                                  {r.student_phone ?? "—"}
                                </TableCell>
                                <TableCell className={ds.table.cell} style={tajawal}>
                                  {r.total_score != null
                                    ? r.total_score
                                    : r.score_percent != null
                                      ? `${r.score_percent}%`
                                      : "—"}
                                </TableCell>
                                <TableCell className={ds.table.cell} style={tajawal}>
                                  {r.submitted_at?.slice(0, 16) ?? "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {!loading && items.length === 0 && (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد اختبارات — أنشئ اختباراً جديداً.
          </p>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right sm:max-w-2xl max-h-[90vh] overflow-y-auto")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>
              {editId ? "تعديل الاختبار" : "اختبار جديد"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveQuiz} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label style={tajawal}>اسم الاختبار</Label>
                <Input className={ds.field} value={titleAr} onChange={(e) => setTitleAr(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label style={tajawal}>رمز المرور للاختبار *</Label>
                <Input
                  className={ds.field}
                  dir="ltr"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <Label style={tajawal}>إظهار الدرجة فوراً مع رسالة مخصصة</Label>
                <Switch checked={showScore} onCheckedChange={setShowScore} />
              </div>
              {showScore && (
                <div className="space-y-2 sm:col-span-2">
                  <Label style={tajawal}>رسالة النجاح المخصصة (اختياري)</Label>
                  <Input
                    className={ds.field}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="أحسنت! درجتك ممتازة."
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className={ds.page.section} style={tajawal}>
                  الأسئلة
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(ds.btnRound, "rounded-full")}
                  onClick={() => setQuestions((prev) => [...prev, emptyQuestion(prev.length)])}
                >
                  <Plus className="w-4 h-4" />
                  سؤال
                </Button>
              </div>
              {questions.map((q, idx) => (
                <div key={idx} className={`${ds.card} p-4 space-y-3`}>
                  <div className="flex flex-wrap gap-2">
                    {(["mcq", "true_false", "text"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          q.question_type === t
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-muted-foreground",
                        )}
                        onClick={() =>
                          setQuestions((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? {
                                    ...row,
                                    question_type: t,
                                    options:
                                      t === "mcq"
                                        ? ["", "", ""]
                                        : t === "true_false"
                                          ? ["صح", "خطأ"]
                                          : [],
                                    correct_answer: "",
                                  }
                                : row,
                            ),
                          )
                        }
                      >
                        {t === "mcq" ? "اختيار" : t === "true_false" ? "صح/خطأ" : "نصي"}
                      </button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-auto text-destructive"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    className={ds.field}
                    placeholder="نص السؤال"
                    value={q.prompt_ar}
                    onChange={(e) =>
                      setQuestions((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, prompt_ar: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  {q.question_type === "mcq" &&
                    q.options.map((opt, oi) => (
                      <Input
                        key={oi}
                        className={ds.field}
                        placeholder={`خيار ${oi + 1}`}
                        value={opt}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((row, i) => {
                              if (i !== idx) return row;
                              const options = [...row.options];
                              options[oi] = e.target.value;
                              return { ...row, options };
                            }),
                          )
                        }
                      />
                    ))}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className={ds.field}
                      placeholder="الدرجة"
                      value={q.points}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, points: Number(e.target.value) || 1 } : row,
                          ),
                        )
                      }
                    />
                    <Input
                      className={ds.field}
                      placeholder={
                        q.question_type === "true_false" ? "صح أو خطأ" : "الإجابة الصحيحة"
                      }
                      value={q.correct_answer}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, correct_answer: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2 sm:justify-start flex-row-reverse">
              <Button type="submit" disabled={saving} className={cn(ds.btnRound, "rounded-full")} style={tajawal}>
                {saving ? "جاري الحفظ…" : "حفظ ونشر"}
              </Button>
              <Button type="button" variant="outline" className={cn(ds.btnRound, "rounded-full")} onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DoubleConfirmDialog
        open={deleteId != null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="حذف الاختبار"
        description={
          deleteTarget
            ? `حذف «${deleteTarget.title_ar}» وجميع أسئلته ونتائجه؟`
            : "حذف هذا الاختبار؟"
        }
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={deleteQuiz}
      />
    </div>
  );
}
