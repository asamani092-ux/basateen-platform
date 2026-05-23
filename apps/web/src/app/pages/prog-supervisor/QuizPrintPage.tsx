import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

export function QuizPrintPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const id = Number(quizId);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<
    Array<{ prompt_ar: string; points: number; options: string[] }>
  >([]);

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    const res = await api.progQuizDetail(id);
    setTitle(String(res.quiz.title_ar ?? ""));
    setQuestions(
      (res.questions as Array<Record<string, unknown>>).map((q) => {
        let options: string[] = [];
        try {
          options = JSON.parse(String(q.options_json ?? "[]")) as string[];
        } catch {
          options = [];
        }
        if (String(q.question_type) === "true_false") {
          options = ["صح", "خطأ"];
        }
        return {
          prompt_ar: String(q.prompt_ar),
          points: Number(q.points),
          options,
        };
      }),
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-12" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6 print:space-y-8">
        <header className="text-center border-b pb-4 print:pb-6">
          <h1 className="text-2xl font-bold" style={tajawal}>
            {title}
          </h1>
          <p className="text-sm text-gray-600 mt-2" style={tajawal}>
            منصة بساتين — نسخة ورقية
          </p>
        </header>

        {questions.map((q, i) => (
          <section key={i} className="break-inside-avoid">
            <p className="font-semibold mb-2" style={tajawal}>
              {i + 1}. {q.prompt_ar}{" "}
              <span className="text-gray-500 font-normal">({q.points} درجة)</span>
            </p>
            <ul className="list-none space-y-1 mr-4">
              {q.options.map((opt, oi) => (
                <li key={oi} className="flex gap-2" style={tajawal}>
                  <span className="inline-block w-5 h-5 border border-gray-400 rounded" />
                  {opt}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="text-center text-xs text-gray-500 pt-8 print:pt-12">
          <p style={tajawal}>اسم الطالب: _______________ · الحلقة: _______________</p>
        </footer>
      </div>

      <div className="fixed bottom-4 left-4 print:hidden">
        <Button
          type="button"
          className={ds.btnRound}
          onClick={() => window.print()}
          style={tajawal}
        >
          طباعة
        </Button>
      </div>
    </div>
  );
}
