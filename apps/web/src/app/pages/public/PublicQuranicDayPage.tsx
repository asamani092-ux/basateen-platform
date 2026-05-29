import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { AlertTriangle, CheckCircle2, Minus, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";

const HIZB_MAX = 30;

export function PublicQuranicDayPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [dayName, setDayName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [students, setStudents] = useState<
    Array<{ student_id: number; full_name_ar: string }>
  >([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hizb, setHizb] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicQuranicDayGet(token);
      setDayName(res.day.name_ar);
      setEventDate(res.day.event_date);
      setStudents(res.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "الرابط غير صالح");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return students.slice(0, 12);
    return students.filter((s) => s.full_name_ar.includes(q)).slice(0, 12);
  }, [students, search]);

  const selectedName =
    students.find((s) => s.student_id === selectedId)?.full_name_ar ?? "";

  function resetForm() {
    setSelectedId(null);
    setHizb(null);
    setMistakes(0);
    setAlerts(0);
    setSearch("");
    setSavedFlash(false);
  }

  async function save() {
    if (selectedId == null || hizb == null) {
      setError("اختر الطالب والحزب");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.publicQuranicDaySave(token, {
        student_id: selectedId,
        hizb_number: hizb,
        mistakes,
        alerts,
      });
      setSavedFlash(true);
      resetForm();
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-foreground" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <header className="text-center space-y-1 border-b border-border pb-4">
          <h1 className="text-xl font-bold text-primary" style={tajawal}>
            {dayName || "اليوم القرآني"}
          </h1>
          {eventDate && (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              {eventDate}
            </p>
          )}
          <p className="text-xs text-muted-foreground" style={tajawal}>
            رصد المقرئ — بدون تسجيل دخول
          </p>
        </header>

        {loading && (
          <p className="text-center text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        )}

        {error && (
          <p className={`${ds.alert.error} text-center`} style={tajawal}>
            {error}
          </p>
        )}

        {savedFlash && (
          <p
            className="flex items-center justify-center gap-2 text-primary font-medium text-sm"
            style={tajawal}
          >
            <CheckCircle2 className="w-5 h-5" />
            تم الحفظ — جاهز للطالب التالي
          </p>
        )}

        {!loading && !error && (
          <>
            <div className="space-y-2">
              <Label style={tajawal}>بحث عن الطالب</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اكتب جزءاً من الاسم…"
                className={ds.btnRound}
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {filtered.map((s) => (
                  <Button
                    key={s.student_id}
                    type="button"
                    variant={selectedId === s.student_id ? "default" : "outline"}
                    size="sm"
                    className={ds.btnRound}
                    onClick={() => {
                      setSelectedId(s.student_id);
                      setMistakes(0);
                      setAlerts(0);
                    }}
                    style={tajawal}
                  >
                    {s.full_name_ar}
                  </Button>
                ))}
              </div>
              {selectedName && (
                <p className="text-sm font-semibold" style={tajawal}>
                  المختار: {selectedName}
                </p>
              )}
            </div>

            {selectedId != null && (
              <>
                <div className="space-y-2">
                  <Label style={tajawal}>الحزب المقروء</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {Array.from({ length: HIZB_MAX }, (_, i) => i + 1).map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={hizb === n ? "default" : "outline"}
                        className={`${ds.btnRound} h-10`}
                        onClick={() => setHizb(n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={`${ds.card} p-4 space-y-3 border-2`}>
                    <p className="text-center font-bold flex items-center justify-center gap-2" style={tajawal}>
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      أخطاء
                    </p>
                    <p className="text-3xl font-bold text-center">{mistakes}</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={ds.btnRound}
                        onClick={() => setMistakes((m) => Math.max(0, m - 1))}
                      >
                        <Minus className="w-5 h-5" />
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="icon"
                        className={`${ds.btnRound} h-12 w-12`}
                        onClick={() => setMistakes((m) => m + 1)}
                      >
                        <Plus className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                  <div className={`${ds.card} p-4 space-y-3 border-2`}>
                    <p className="text-center font-bold" style={tajawal}>
                      تنبيهات
                    </p>
                    <p className="text-3xl font-bold text-center">{alerts}</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={ds.btnRound}
                        onClick={() => setAlerts((a) => Math.max(0, a - 1))}
                      >
                        <Minus className="w-5 h-5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={`${ds.btnRound} h-12 w-12`}
                        onClick={() => setAlerts((a) => a + 1)}
                      >
                        <Plus className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="default"
                  className={`w-full h-14 text-lg ${ds.btnRound}`}
                  disabled={saving || hizb == null}
                  onClick={() => save()}
                  style={tajawal}
                >
                  {saving ? "جاري الحفظ…" : "حفظ الرصد"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
