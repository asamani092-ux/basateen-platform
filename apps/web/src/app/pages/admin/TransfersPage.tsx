import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import {
  api,
  type CircleOption,
  type HistoryRow,
  type StudentDetail,
  type StudentRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";

const tajawal = { fontFamily: "Tajawal, sans-serif" } as const;

const ERROR_AR: Record<string, string> = {
  unauthorized: "انتهت الجلسة — سجّل الدخول مرة أخرى",
  forbidden: "ليس لديك صلاحية",
  student_not_found: "الطالب غير موجود",
  circle_not_found: "الحلقة غير موجودة",
  already_in_circle: "الطالب في هذه الحلقة مسبقاً",
  forbidden_target_circle: "لا يمكن النقل إلى هذه الحلقة",
  forbidden_current_circle: "لا يمكن نقل طالب خارج نطاقك",
};

export function TransfersPage() {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<StudentRow[]>([]);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [targetCircleId, setTargetCircleId] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasApi = Boolean(getApiToken());

  const loadCircles = useCallback(async () => {
    try {
      const res = await api.circles();
      setCircles(res.items);
    } catch (e) {
      setError(
        e instanceof Error
          ? ERROR_AR[e.message] ?? e.message
          : "فشل تحميل الحلقات",
      );
    }
  }, []);

  useEffect(() => {
    if (!hasApi) {
      setError("لا يوجد اتصال API — أعد تسجيل الدخول بالجوال");
      return;
    }
    loadCircles();
  }, [hasApi, loadCircles]);

  useEffect(() => {
    if (!hasApi) return;
    const t = setTimeout(async () => {
      if (!searchQ.trim()) {
        setSearchResults([]);
        return;
      }
      try {
        const res = await api.students(searchQ);
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, hasApi]);

  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api.studentDetail(id);
      setDetail(data);
      setSelectedId(id);
      setTargetCircleId("");
    } catch (e) {
      setError(
        e instanceof Error
          ? ERROR_AR[e.message] ?? e.message
          : "فشل تحميل بيانات الطالب",
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !targetCircleId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.transferStudent(selectedId, {
        circle_id: Number(targetCircleId),
        note: note.trim() || undefined,
      });
      setSuccess(res.message);
      setNote("");
      await loadDetail(selectedId);
      const list = await api.students(searchQ);
      setSearchResults(list.items);
    } catch (err) {
      setError(
        err instanceof Error
          ? ERROR_AR[err.message] ?? err.message
          : "فشل النقل",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h2
          className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
          style={tajawal}
        >
          <ArrowLeftRight className="w-7 h-7 text-[#1e3a8a]" />
          نقل الطلاب (تراكمي)
        </h2>
        <p className="text-slate-600 dark:text-slate-300 mt-1" style={tajawal}>
          تجميد السجل الحالي وإضافة سجل جديد — لا يُحذف التاريخ
        </p>
      </div>

      {!hasApi && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-amber-900 dark:text-amber-200 text-sm"
          style={tajawal}
        >
          سجّل الخروج ثم ادخل مجدداً بالجوال (0500000001 / 0500000002) لربط API.
        </div>
      )}

      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 text-rose-800 dark:text-rose-300 text-sm"
          style={tajawal}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-800 dark:text-emerald-300 text-sm"
          style={tajawal}
        >
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
              اختيار الطالب
            </CardTitle>
            <CardDescription
              className="text-slate-600 dark:text-slate-300"
              style={tajawal}
            >
              ابحث بالاسم ثم اختر الطالب
            </CardDescription>
            <div className="relative mt-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="ابحث باسم الطالب..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="pr-10 rounded-xl text-slate-900 dark:text-white"
                style={tajawal}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {searchResults.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadDetail(s.id)}
                className={`w-full text-right px-4 py-3 rounded-xl border transition-colors ${
                  selectedId === s.id
                    ? "border-[#1e3a8a] bg-[#dbeafe] dark:bg-[#1e3a5f]"
                    : "border-slate-200 dark:border-[#1e3a5f] hover:bg-slate-50 dark:hover:bg-[#132337]"
                }`}
              >
                <p
                  className="font-semibold text-slate-900 dark:text-white"
                  style={tajawal}
                >
                  {s.full_name_ar}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400" style={tajawal}>
                  {s.circle_name ?? "—"} · {s.track_name ?? "—"}
                </p>
              </button>
            ))}
            {searchQ && searchResults.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4" style={tajawal}>
                لا توجد نتائج
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
              نقل إلى حلقة جديدة
            </CardTitle>
            {detail?.current && (
              <CardDescription style={tajawal}>
                الحالي:{" "}
                <Badge className="rounded-lg mr-1">
                  {detail.current.circle_name}
                </Badge>
                {detail.current.track_name ?? ""}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!detail && !loading && (
              <p className="text-slate-500 text-sm" style={tajawal}>
                اختر طالباً من القائمة
              </p>
            )}
            {loading && (
              <p className="text-slate-500 text-sm" style={tajawal}>
                جاري التحميل...
              </p>
            )}
            {detail && (
              <form onSubmit={handleTransfer} className="space-y-4">
                <p
                  className="font-bold text-lg text-slate-900 dark:text-white"
                  style={tajawal}
                >
                  {detail.student.full_name_ar}
                </p>
                <div>
                  <label
                    className="block text-sm font-semibold mb-2 text-slate-900 dark:text-white"
                    style={tajawal}
                  >
                    الحلقة الجديدة
                  </label>
                  <select
                    value={targetCircleId}
                    onChange={(e) => setTargetCircleId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-300 dark:border-[#1e3a5f] bg-white dark:bg-[#132337] px-3 py-2.5 text-slate-900 dark:text-white"
                    style={tajawal}
                  >
                    <option value="">— اختر الحلقة —</option>
                    {circles.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name_ar}
                        {c.track_name ? ` (${c.track_name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="block text-sm font-semibold mb-2 text-slate-900 dark:text-white"
                    style={tajawal}
                  >
                    ملاحظة (اختياري)
                  </label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="سبب النقل..."
                    className="rounded-xl text-slate-900 dark:text-white"
                    style={tajawal}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting || !targetCircleId || !hasApi}
                  className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] text-white rounded-xl"
                  style={tajawal}
                >
                  {submitting ? "جاري النقل..." : "تأكيد النقل التراكمي"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {detail && detail.history.length > 0 && (
        <Card className="rounded-3xl border-slate-200 dark:border-[#1e3a5f]">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-white" style={tajawal}>
              سجل الحلقات (تراكمي)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={tajawal}>الحلقة</TableHead>
                  <TableHead style={tajawal}>المسار</TableHead>
                  <TableHead style={tajawal}>من</TableHead>
                  <TableHead style={tajawal}>إلى</TableHead>
                  <TableHead style={tajawal}>ملاحظة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.history.map((h: HistoryRow) => (
                  <TableRow key={h.id}>
                    <TableCell style={tajawal}>{h.circle_name}</TableCell>
                    <TableCell style={tajawal}>{h.track_name ?? "—"}</TableCell>
                    <TableCell style={tajawal}>{h.from_at}</TableCell>
                    <TableCell style={tajawal}>
                      {h.to_at ?? (
                        <Badge className="rounded-lg bg-emerald-600">نشط</Badge>
                      )}
                    </TableCell>
                    <TableCell style={tajawal}>{h.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
