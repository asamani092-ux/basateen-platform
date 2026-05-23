import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

type Question = {
  id: number;
  question_type: string;
  prompt_ar: string;
  points: number;
  options: string[];
};

export function QuizPublicPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const id = Number(quizId);
  const tokenParam = searchParams.get("token")?.trim() ?? "";

  const [phase, setPhase] = useState<"gate" | "take" | "done">("gate");
  const [title, setTitle] = useState("");
  const [requiresCode, setRequiresCode] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [sessionToken, setSessionToken] = useState(tokenParam);
  const [studentName, setStudentName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scorePercent, setScorePercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!id) return;
    try {
      const meta = await api.quizPublicMeta(id);
      setTitle(meta.title_ar);
      setRequiresCode(meta.requires_access_code);
    } catch {
      setError("الاختبار غير متاح");
    }
  }, [id]);

  const loadTake = useCallback(
    async (token: string) => {
      if (!id || !token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.quizTake(id, token);
        if (res.already_submitted) {
          setScorePercent(res.score_percent ?? 0);
          setStudentName(String(res.student?.full_name_ar ?? ""));
          setPhase("done");
          return;
        }
        setStudentName(res.student.full_name_ar);
        setQuestions(res.questions as Question[]);
        setPhase("take");
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر فتح الاختبار");
        setPhase("gate");
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (tokenParam) {
      setSessionToken(tokenParam);
      loadTake(tokenParam);
    }
  }, [tokenParam, loadTake]);

  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.quizGate(id, {
        identifier: identifier.trim(),
        access_code: accessCode.trim(),
      });
      setSessionToken(res.session_token);
      setStudentName(res.full_name_ar);
      await loadTake(res.session_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحقق";
      if (msg.includes("409") || msg.includes("already")) {
        setError("تم تسليم هذا الاختبار مسبقاً");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitQuiz() {
    if (!id || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.quizSubmit(id, { token: sessionToken, answers });
      setScorePercent(res.score_percent);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإرسال");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-[#0f172a] to-[#1e3a8a] text-white p-4 sm:p-6"
      dir="rtl"
    >
      <div className="max-w-lg mx-auto space-y-6 pt-8">
        <div className="text-center">
          <img
            src="/logo-dark.png"
            alt="منصة بساتين"
            className="h-20 mx-auto mb-4 object-contain"
          />
          <h1 className="text-xl font-bold" style={tajawal}>
            {title || "اختبار معرفي"}
          </h1>
          <p className="text-sm text-white/70 mt-1" style={tajawal}>
            منصة بساتين — برامج وأنشطة
          </p>
        </div>

        {error && (
          <p className={`${ds.alert.error} bg-destructive/20 border-destructive/40 text-white`} style={tajawal}>
            {error}
          </p>
        )}

        {phase === "gate" && !tokenParam && (
          <Card className="rounded-3xl border-white/10 bg-white/5 backdrop-blur shadow-xl">
            <CardHeader>
              <CardTitle className="text-white" style={tajawal}>
                الدخول إلى الاختبار
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitGate} className="space-y-4">
                <div>
                  <label className="text-sm font-semibold" style={tajawal}>
                    اسم الطالب أو رقم الجوال
                  </label>
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className={`${ds.btnRound} mt-1 bg-white/10 border-white/20 text-white`}
                    required
                  />
                </div>
                {requiresCode && (
                  <div>
                    <label className="text-sm font-semibold" style={tajawal}>
                      رمز دخول الاختبار
                    </label>
                    <Input
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      className={`${ds.btnRound} mt-1 bg-white/10 border-white/20 text-white`}
                      dir="ltr"
                      required
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  className={`w-full ${ds.btnRound}`}
                  style={tajawal}
                >
                  {loading ? "جاري التحقق…" : "بدء الاختبار"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {phase === "take" && (
          <div className="space-y-4">
            <p className="text-center text-sm text-white/80" style={tajawal}>
              مرحباً {studentName}
            </p>
            {questions.map((q, i) => (
              <Card
                key={q.id}
                className="rounded-3xl border-white/10 bg-white/5 backdrop-blur"
              >
                <CardHeader>
                  <CardTitle className="text-base text-white" style={tajawal}>
                    {i + 1}. {q.prompt_ar}{" "}
                    <span className="text-white/60 font-normal">({q.points})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {q.options.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                      style={tajawal}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[String(q.id)] === opt}
                        onChange={() =>
                          setAnswers((a) => ({ ...a, [String(q.id)]: opt }))
                        }
                      />
                      {opt}
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
            <Button
              type="button"
              disabled={loading}
              className={`w-full ${ds.btnRound}`}
              onClick={submitQuiz}
              style={tajawal}
            >
              {loading ? "جاري الإرسال…" : "إنهاء وإرسال"}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <Card className="rounded-3xl border-white/10 bg-white/5 backdrop-blur text-center p-8">
            <CardTitle className="text-white text-2xl mb-2" style={tajawal}>
              تم التسليم
            </CardTitle>
            <p className="text-white/90" style={tajawal}>
              {studentName && `${studentName} — `}
              نسبة الإنجاز في البرامج والأنشطة:{" "}
              <strong>{scorePercent ?? 0}%</strong>
            </p>
            <p className="text-xs text-white/60 mt-4" style={tajawal}>
              محاولة واحدة فقط — لا يمكن إعادة الحل
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
