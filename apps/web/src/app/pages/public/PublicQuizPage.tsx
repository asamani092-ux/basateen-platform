import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

type Question = {
  id: number;
  question_type: string;
  prompt_ar: string;
  points: number;
  options: string[];
};

function storageKey(quizId: number) {
  return `basateen-public-quiz-${quizId}`;
}

type Draft = {
  token: string;
  studentName: string;
  answers: Record<string, string>;
  step: number;
};

function loadDraft(quizId: number): Draft | null {
  try {
    const raw = localStorage.getItem(storageKey(quizId));
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

function saveDraft(quizId: number, draft: Draft) {
  localStorage.setItem(storageKey(quizId), JSON.stringify(draft));
}

function clearDraft(quizId: number) {
  localStorage.removeItem(storageKey(quizId));
}

export function PublicQuizPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const quizId = Number(idParam);

  const [phase, setPhase] = useState<"gate" | "take" | "done">("gate");
  const [title, setTitle] = useState("");
  const [requiresCode, setRequiresCode] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [sessionToken, setSessionToken] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);

  const [resultMessage, setResultMessage] = useState("");
  const [scorePercent, setScorePercent] = useState<number | null>(null);
  const [totalScore, setTotalScore] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const persist = useCallback(
    (patch: Partial<Draft>) => {
      if (!quizId || !sessionToken) return;
      const base = loadDraft(quizId) ?? {
        token: sessionToken,
        studentName,
        answers,
        step,
      };
      const next = { ...base, ...patch, token: sessionToken };
      saveDraft(quizId, next);
    },
    [quizId, sessionToken, studentName, answers, step],
  );

  const loadTake = useCallback(
    async (token: string) => {
      if (!quizId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.publicQuizTake(quizId, token);
        if (res.already_submitted) {
          setResultMessage(res.message ?? "تم التسليم مسبقاً.");
          setScorePercent(res.score_percent ?? null);
          setTotalScore(res.total_score ?? null);
          setPhase("done");
          clearDraft(quizId);
          return;
        }
        setQuestions(res.questions as Question[]);
        const merged = { ...(res.saved_answers ?? {}), ...answers };
        setAnswers(merged);
        setPhase("take");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر تحميل الأسئلة");
        setPhase("gate");
      } finally {
        setLoading(false);
      }
    },
    [quizId, answers],
  );

  useEffect(() => {
    if (!quizId) return;
    void api
      .quizPublicMeta(quizId, true)
      .then((meta) => {
        setTitle(meta.title_ar);
        setRequiresCode(meta.requires_access_code);
      })
      .catch(() => setError("الاختبار غير متاح"));

    const draft = loadDraft(quizId);
    if (draft?.token) {
      setSessionToken(draft.token);
      setStudentName(draft.studentName);
      setAnswers(draft.answers ?? {});
      setStep(draft.step ?? 0);
      void loadTake(draft.token);
    }
  }, [quizId, loadTake]);

  useEffect(() => {
    if (phase !== "take" || !quizId || !sessionToken) return;
    persist({ answers, step, studentName });
  }, [answers, step, phase, quizId, sessionToken, studentName, persist]);

  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicQuizGate(quizId, {
        student_name: studentName.trim(),
        student_phone: studentPhone.trim(),
        access_code: accessCode.trim(),
      });
      setSessionToken(res.session_token);
      saveDraft(quizId, {
        token: res.session_token,
        studentName: res.student_name,
        answers: {},
        step: 0,
      });
      await loadTake(res.session_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحقق");
    } finally {
      setLoading(false);
    }
  }

  async function submitQuiz() {
    if (!quizId || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicQuizSubmit(quizId, { token: sessionToken, answers });
      setResultMessage(res.message);
      setScorePercent(res.score_percent);
      setTotalScore(res.total_score);
      setPhase("done");
      clearDraft(quizId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإرسال");
    } finally {
      setLoading(false);
    }
  }

  const current = questions[step];

  return (
    <div
      dir="rtl"
      className="min-h-screen min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4"
    >
      <div className={`${ds.card} w-full max-w-lg p-6 sm:p-8 text-right space-y-5`}>
        <div>
          <h1 className={ds.page.title} style={tajawal}>
            {title || "اختبار"}
          </h1>
          <p className={ds.page.description} style={tajawal}>
            مجمع حلقات البساتين
          </p>
        </div>

        {error && <p className={ds.alert.error} style={tajawal}>{error}</p>}

        {phase === "gate" && (
          <form onSubmit={submitGate} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>اسم الطالب</Label>
              <Input className={ds.field} value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>رقم الجوال</Label>
              <Input className={ds.field} dir="ltr" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} required />
            </div>
            {requiresCode && (
              <div className="space-y-2">
                <Label style={tajawal}>رمز الاختبار</Label>
                <Input className={ds.field} dir="ltr" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} required />
              </div>
            )}
            <Button type="submit" disabled={loading} className={cn(ds.btnRound, "rounded-full w-full")} style={tajawal}>
              {loading ? "جاري التحقق…" : "بدء الاختبار"}
            </Button>
          </form>
        )}

        {phase === "take" && current && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground" style={tajawal}>
              سؤال {step + 1} من {questions.length}
            </p>
            <p className="font-semibold text-lg" style={tajawal}>
              {current.prompt_ar}
            </p>
            {current.question_type === "text" ? (
              <Input
                className={ds.field}
                value={answers[String(current.id)] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [String(current.id)]: e.target.value }))
                }
              />
            ) : (
              <div className="space-y-2">
                {current.options.map((opt) => {
                  const active = answers[String(current.id)] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={cn(
                        "w-full rounded-full border px-4 py-2 text-sm text-right transition",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-muted",
                      )}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [String(current.id)]: opt }))
                      }
                      style={tajawal}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 flex-row-reverse">
              {step > 0 && (
                <Button type="button" variant="outline" className={cn(ds.btnRound, "rounded-full flex-1")} onClick={() => setStep((s) => s - 1)}>
                  السابق
                </Button>
              )}
              {step < questions.length - 1 ? (
                <Button
                  type="button"
                  className={cn(ds.btnRound, "rounded-full flex-1")}
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!answers[String(current.id)]?.trim() && current.question_type !== "text"}
                >
                  التالي
                </Button>
              ) : (
                <Button
                  type="button"
                  className={cn(ds.btnRound, "rounded-full flex-1")}
                  disabled={loading}
                  onClick={() => void submitQuiz()}
                >
                  {loading ? "جاري الإرسال…" : "إرسال"}
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className={`${ds.alert.success} space-y-2`}>
            <p className="font-semibold" style={tajawal}>
              {resultMessage}
            </p>
            {scorePercent != null && (
              <p style={tajawal}>النسبة: {scorePercent}%</p>
            )}
            {totalScore != null && (
              <p style={tajawal}>الدرجة: {totalScore}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
