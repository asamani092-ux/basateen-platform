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
  const [requireStudentName, setRequireStudentName] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [studentName, setStudentName] = useState("");
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
      const base = loadDraft(quizId) ?? { token: sessionToken, answers: {}, step: 0 };
      saveDraft(quizId, { ...base, ...patch, token: sessionToken });
    },
    [quizId, sessionToken],
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
        setAnswers((prev) => ({ ...(res.saved_answers ?? {}), ...prev }));
        setPhase("take");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "تعذّر تحميل الأسئلة";
        setError(msg.includes("404") ? "الاختبار غير متاح" : msg);
        setPhase("gate");
      } finally {
        setLoading(false);
      }
    },
    [quizId],
  );

  useEffect(() => {
    if (!quizId) return;
    void api
      .quizPublicMeta(quizId, true)
      .then((meta) => {
        setTitle(meta.title_ar);
        setRequireStudentName(Boolean(meta.require_student_name));
        setError(null);
      })
      .catch(() => {
        setError("الاختبار غير متاح");
      });

    const draft = loadDraft(quizId);
    if (draft?.token) {
      setSessionToken(draft.token);
      setAnswers(draft.answers ?? {});
      setStep(draft.step ?? 0);
      void loadTake(draft.token);
    }
  }, [quizId, loadTake]);

  useEffect(() => {
    if (phase !== "take" || !quizId || !sessionToken) return;
    persist({ answers, step });
  }, [answers, step, phase, quizId, sessionToken, persist]);

  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!quizId) return;
    if (!accessCode.trim()) {
      setError("رمز المرور غير صحيح");
      return;
    }
    if (requireStudentName && !studentName.trim()) {
      setError("اسم الطالب مطلوب");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicQuizGate(quizId, {
        access_code: accessCode.trim(),
        ...(requireStudentName ? { student_name: studentName.trim() } : {}),
      });
      setSessionToken(res.session_token);
      saveDraft(quizId, { token: res.session_token, answers: {}, step: 0 });
      await loadTake(res.session_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("student_name")) {
        setError("اسم الطالب مطلوب");
      } else if (msg.includes("403") || msg.includes("invalid_access")) {
        setError("رمز المرور غير صحيح");
      } else if (msg.includes("404") || msg.includes("not_found")) {
        setError("الاختبار غير متاح");
      } else {
        setError("رمز المرور غير صحيح");
      }
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
      className="min-h-screen min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4 text-right"
    >
      <div className={`${ds.card} w-full max-w-lg p-6 sm:p-8 space-y-5`}>
        <div>
          <h1 className={ds.page.title} style={tajawal}>
            {title || "اختبار"}
          </h1>
          <p className={ds.page.description} style={tajawal}>
            مجمع حلقات البساتين
          </p>
        </div>

        {error && (
          <p className={ds.alert.error} style={tajawal}>
            {error}
          </p>
        )}

        {phase === "gate" && (
          <form onSubmit={submitGate} className="space-y-4">
            {requireStudentName && (
              <div className="space-y-2">
                <Label htmlFor="quiz-student-name" style={tajawal}>
                  اسم الطالب
                </Label>
                <Input
                  id="quiz-student-name"
                  className={ds.field}
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="اكتب اسمك"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="quiz-access-code" style={tajawal}>
                رمز المرور للاختبار
              </Label>
              <Input
                id="quiz-access-code"
                className={ds.field}
                dir="ltr"
                autoComplete="off"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="أدخل رمز المرور"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className={cn(ds.btnRound, "rounded-full w-full")}
              style={tajawal}
            >
              {loading ? "جاري التحقق…" : "دخول الاختبار"}
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
                <Button
                  type="button"
                  variant="outline"
                  className={cn(ds.btnRound, "rounded-full flex-1")}
                  onClick={() => setStep((s) => s - 1)}
                >
                  السابق
                </Button>
              )}
              {step < questions.length - 1 ? (
                <Button
                  type="button"
                  className={cn(ds.btnRound, "rounded-full flex-1")}
                  onClick={() => setStep((s) => s + 1)}
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
