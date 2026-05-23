import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Copy, Link2, Printer, Plus, Trash2 } from "lucide-react";
import { HubTabs } from "../../components/hub/HubTabs";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type QuestionDraft = {
  question_type: "mcq" | "true_false";
  prompt_ar: string;
  points: number;
  correct_answer: string;
  options: string[];
  sort_order: number;
};

const EDITOR_TABS = [
  { id: "builder", label: "صانع الأسئلة" },
  { id: "publish", label: "نشر وطباعة" },
];

function emptyQuestion(order: number): QuestionDraft {
  return {
    question_type: "mcq",
    prompt_ar: "",
    points: 1,
    correct_answer: "",
    options: ["", "", "", ""],
    sort_order: order,
  };
}

function whatsappUrl(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const normalized =
    digits.length === 10 && digits.startsWith("05")
      ? `966${digits.slice(1)}`
      : digits.startsWith("966")
        ? digits
        : digits;
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export function QuizEditorPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const id = Number(quizId);
  const [tab, setTab] = useState("builder");
  const [titleAr, setTitleAr] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState("draft");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion(0)]);
  const [links, setLinks] = useState<Array<Record<string, unknown>>>([]);
  const [publicPath, setPublicPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.progQuizDetail(id);
      const q = res.quiz;
      setTitleAr(String(q.title_ar ?? ""));
      setAccessCode(String(q.access_code ?? ""));
      setStatus(String(q.status ?? "draft"));
      const qs = (res.questions as Array<Record<string, unknown>>).map((row, i) => {
        let options: string[] = [];
        try {
          options = JSON.parse(String(row.options_json ?? "[]")) as string[];
        } catch {
          options = [];
        }
        const qType = String(row.question_type) === "true_false" ? "true_false" : "mcq";
        let correct = String(row.correct_answer ?? "");
        if (qType === "true_false") {
          correct = correct === "false" ? "خطأ" : "صح";
        }
        return {
          question_type: qType as "mcq" | "true_false",
          prompt_ar: String(row.prompt_ar ?? ""),
          points: Number(row.points ?? 1),
          correct_answer: correct,
          options: qType === "true_false" ? ["صح", "خطأ"] : options,
          sort_order: Number(row.sort_order ?? i),
        };
      });
      setQuestions(qs.length ? qs : [emptyQuestion(0)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMeta() {
    if (!id) return;
    await api.progQuizPatch(id, {
      title_ar: titleAr,
      access_code: accessCode.trim() || null,
    });
  }

  async function saveQuestions() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await saveMeta();
      const payload = questions
        .filter((q) => q.prompt_ar.trim())
        .map((q, i) => ({
          question_type: q.question_type,
          prompt_ar: q.prompt_ar,
          points: q.points,
          correct_answer:
            q.question_type === "true_false"
              ? q.correct_answer === "خطأ"
                ? "false"
                : "true"
              : q.correct_answer,
          options: q.question_type === "mcq" ? q.options.filter(Boolean) : ["صح", "خطأ"],
          sort_order: i,
        }));
      await api.progQuizQuestionsSave(id, payload);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function publishQuiz() {
    if (!id) return;
    setPublishing(true);
    setError(null);
    try {
      await saveQuestions();
      const res = await api.progQuizPublish(id);
      setPublicPath(res.public_path);
      setLinks(res.student_links);
      setStatus("published");
      await loadLinks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل النشر");
    } finally {
      setPublishing(false);
    }
  }

  async function loadLinks() {
    if (!id) return;
    const res = await api.progQuizLinks(id);
    setPublicPath(res.public_path);
    setLinks(res.items);
  }

  useEffect(() => {
    if (tab === "publish" && id) loadLinks();
  }, [tab, id]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}${publicPath || `/quiz/${id}`}`;

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
        <Link to="/prog-supervisor/quizzes">← الاختبارات</Link>
      </Button>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          className={`${ds.btnRound} max-w-md font-semibold`}
          placeholder="اسم الاختبار"
        />
        <Input
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          className={`${ds.btnRound} max-w-xs`}
          placeholder="رمز الدخول"
          dir="ltr"
        />
        <span className="text-xs text-muted-foreground" style={tajawal}>
          {status}
        </span>
      </div>

      <HubTabs tabs={EDITOR_TABS} active={tab} onChange={setTab} />

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {tab === "builder" && (
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <Card key={idx} className={ds.card}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base" style={tajawal}>
                  سؤال {idx + 1}
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={questions.length <= 1}
                  onClick={() =>
                    setQuestions((list) => list.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3">
                <select
                  className={`${ds.btnRound} border border-border bg-background px-3 py-2 text-sm`}
                  value={q.question_type}
                  onChange={(e) => {
                    const t = e.target.value as "mcq" | "true_false";
                    setQuestions((list) => {
                      const next = [...list];
                      next[idx] = {
                        ...next[idx],
                        question_type: t,
                        options: t === "true_false" ? ["صح", "خطأ"] : ["", "", "", ""],
                        correct_answer: "",
                      };
                      return next;
                    });
                  }}
                  style={tajawal}
                >
                  <option value="mcq">اختيار من متعدد</option>
                  <option value="true_false">صح أو خطأ</option>
                </select>
                <Input
                  value={q.prompt_ar}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuestions((list) => {
                      const next = [...list];
                      next[idx] = { ...next[idx], prompt_ar: v };
                      return next;
                    });
                  }}
                  placeholder="نص السؤال"
                  className={ds.btnRound}
                />
                <Input
                  type="number"
                  value={q.points}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setQuestions((list) => {
                      const next = [...list];
                      next[idx] = { ...next[idx], points: v };
                      return next;
                    });
                  }}
                  className={`${ds.btnRound} max-w-[120px]`}
                  placeholder="الدرجة"
                />
                {q.question_type === "mcq" ? (
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex gap-2 items-center">
                        <input
                          type="radio"
                          name={`correct-${idx}`}
                          checked={q.correct_answer === opt && Boolean(opt)}
                          onChange={() => {
                            setQuestions((list) => {
                              const next = [...list];
                              next[idx] = { ...next[idx], correct_answer: opt };
                              return next;
                            });
                          }}
                        />
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const v = e.target.value;
                            setQuestions((list) => {
                              const next = [...list];
                              const opts = [...next[idx].options];
                              opts[oi] = v;
                              next[idx] = { ...next[idx], options: opts };
                              return next;
                            });
                          }}
                          className={ds.btnRound}
                          placeholder={`خيار ${oi + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <select
                    className={`${ds.btnRound} border border-border bg-background px-3 py-2`}
                    value={q.correct_answer}
                    onChange={(e) => {
                      setQuestions((list) => {
                        const next = [...list];
                        next[idx] = { ...next[idx], correct_answer: e.target.value };
                        return next;
                      });
                    }}
                    style={tajawal}
                  >
                    <option value="">الإجابة الصحيحة</option>
                    <option value="صح">صح</option>
                    <option value="خطأ">خطأ</option>
                  </select>
                )}
              </CardContent>
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() =>
                setQuestions((list) => [...list, emptyQuestion(list.length)])
              }
              style={tajawal}
            >
              <Plus className="w-4 h-4" /> إضافة سؤال
            </Button>
            <Button
              type="button"
              className={ds.btnRound}
              disabled={saving}
              onClick={saveQuestions}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : "حفظ الأسئلة"}
            </Button>
          </div>
        </div>
      )}

      {tab === "publish" && (
        <div className="space-y-4">
          <Card className={ds.card}>
            <CardHeader>
              <CardTitle style={tajawal}>النشر والطباعة</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                className={ds.btnRound}
                disabled={publishing}
                onClick={publishQuiz}
                style={tajawal}
              >
                {publishing ? "جاري النشر…" : "نشر الاختبار وتوليد الروابط"}
              </Button>
              <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
                <Link to={`/prog-supervisor/quizzes/${id}/print`} target="_blank">
                  <Printer className="w-4 h-4" /> نسخة مهيأة للطباعة الورقية
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={() => navigator.clipboard.writeText(publicUrl)}
                style={tajawal}
              >
                <Copy className="w-4 h-4" /> نسخ الرابط العام
              </Button>
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={() => {
                  const text = `اختبار: ${titleAr}\n${publicUrl}${
                    accessCode ? `\nرمز الدخول: ${accessCode}` : ""
                  }`;
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(text)}`,
                    "_blank",
                  );
                }}
                style={tajawal}
              >
                <Link2 className="w-4 h-4" /> مشاركة عبر واتساب (مجموعة)
              </Button>
            </CardContent>
          </Card>

          <Card className={ds.card}>
            <CardHeader>
              <CardTitle style={tajawal}>روابط الطلاب</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[420px] overflow-y-auto text-sm">
              {links.length === 0 ? (
                <p className="text-muted-foreground" style={tajawal}>
                  انشر الاختبار لتوليد الروابط.
                </p>
              ) : (
                links.map((row) => {
                  const path = String(row.path ?? "");
                  const full = `${origin}${path}`;
                  const waStudent = whatsappUrl(
                    String(row.phone ?? row.guardian_phone ?? ""),
                    `اختبار ${titleAr}: ${full}`,
                  );
                  return (
                    <div
                      key={String(row.student_id)}
                      className="border-b border-border py-2 flex flex-wrap justify-between gap-2"
                    >
                      <span style={tajawal}>
                        {String(row.full_name_ar)}
                        {row.submitted ? " ✓" : ""}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={ds.btnRound}
                          onClick={() => navigator.clipboard.writeText(full)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        {waStudent && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={ds.btnRound}
                            asChild
                          >
                            <a href={waStudent} target="_blank" rel="noreferrer">
                              واتساب
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
