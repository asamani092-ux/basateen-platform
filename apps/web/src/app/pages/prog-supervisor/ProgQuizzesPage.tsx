import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type QuizRow = {
  id: number;
  title_ar: string;
  status: string;
  access_code: string | null;
  total_points: number;
  question_count: number;
  attempts_count: number;
};

export function ProgQuizzesPage() {
  const [items, setItems] = useState<QuizRow[]>([]);
  const [titleAr, setTitleAr] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) return;
    try {
      const res = await api.progQuizzesList();
      setItems(res.items as QuizRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createQuiz() {
    if (!titleAr.trim()) {
      setError("اسم الاختبار مطلوب");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.progQuizCreate({
        title_ar: titleAr.trim(),
        access_code: accessCode.trim() || "",
      });
      setTitleAr("");
      setAccessCode("");
      await load();
      window.location.href = `/prog-supervisor/quizzes/${res.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>إنشاء اختبار معرفي سريع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold" style={tajawal}>
              اسم الاختبار *
            </label>
            <Input
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              className={`${ds.btnRound} mt-1`}
              placeholder="مثال: اختبار الفصل الأول"
            />
          </div>
          <div>
            <label className="text-sm font-semibold" style={tajawal}>
              رمز دخول الاختبار (اختياري)
            </label>
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className={`${ds.btnRound} mt-1`}
              placeholder="Ramadan2026"
              dir="ltr"
            />
          </div>
          <Button
            type="button"
            className={`${ds.btnRound} sm:col-span-2`}
            disabled={loading}
            onClick={createQuiz}
            style={tajawal}
          >
            <Plus className="w-4 h-4 ml-1" />
            {loading ? "جاري الإنشاء…" : "إنشاء والانتقال للمحرر"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>الاختبارات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm" style={tajawal}>
              لا توجد اختبارات بعد.
            </p>
          ) : (
            items.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3"
              >
                <div>
                  <p className="font-semibold" style={tajawal}>
                    {q.title_ar}
                  </p>
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    {q.status} · {q.question_count} سؤال · {q.total_points} نقطة ·{" "}
                    {q.attempts_count} محاولة مُسلّمة
                    {q.access_code ? ` · رمز: ${q.access_code}` : ""}
                  </p>
                </div>
                <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
                  <Link to={`/prog-supervisor/quizzes/${q.id}`}>تحرير ونشر</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
