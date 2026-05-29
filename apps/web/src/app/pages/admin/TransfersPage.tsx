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
import { CircleCapacityBadge } from "../../components/admin/CircleCapacityBadge";
import {
  api,
  type CircleOption,
  type HistoryRow,
  type StudentDetail,
  type StudentRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

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
  const [capacityHint, setCapacityHint] = useState<string | null>(null);

  const hasApi = Boolean(getApiToken());

  const selectedCircle = circles.find(
    (c) => c.id === Number(targetCircleId),
  );

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
      setSuccess(
        res.capacity_warning
          ? `${res.message} — ${res.capacity_warning}`
          : res.message,
      );
      setCapacityHint(res.capacity_warning ?? null);
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
          className={`${ds.page.title} flex items-center gap-2`}
          style={tajawal}
        >
          <ArrowLeftRight className="w-7 h-7 text-primary" />
          نقل الطلاب (تراكمي)
        </h2>
        <p className={ds.page.description} style={tajawal}>
          تجميد السجل الحالي وإضافة سجل جديد — لا يُحذف التاريخ
        </p>
      </div>

      {!hasApi && (
        <div className={ds.alert.warn} style={tajawal}>
          سجّل الخروج ثم ادخل مجدداً بالجوال (0500000001 / 0500000002) لربط API.
        </div>
      )}

      {error && (
        <div className={ds.alert.error} style={tajawal}>
          {error}
        </div>
      )}

      {success && (
        <div className={ds.alert.success} style={tajawal}>
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>اختيار الطالب</CardTitle>
            <CardDescription style={tajawal}>
              ابحث بالاسم ثم اختر الطالب
            </CardDescription>
            <div className="relative mt-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ابحث باسم الطالب..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className={`pr-10 ${ds.btnRound}`}
                style={tajawal}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {searchResults.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant={selectedId === s.id ? "secondary" : "outline"}
                onClick={() => loadDetail(s.id)}
                className={`w-full h-auto justify-start text-right px-4 py-3 ${ds.btnRound}`}
                style={tajawal}
              >
                <span className="block w-full">
                  <span className="block font-semibold text-foreground">
                    {s.full_name_ar}
                  </span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    {s.circle_name ?? "—"} · {s.track_name ?? "—"}
                  </span>
                </span>
              </Button>
            ))}
            {searchQ && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4" style={tajawal}>
                لا توجد نتائج
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>نقل إلى حلقة جديدة</CardTitle>
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
              <p className="text-muted-foreground text-sm" style={tajawal}>
                اختر طالباً من القائمة
              </p>
            )}
            {loading && (
              <p className="text-muted-foreground text-sm" style={tajawal}>
                جاري التحميل...
              </p>
            )}
            {detail && (
              <form onSubmit={handleTransfer} className="space-y-4">
                <p className="font-bold text-lg text-foreground" style={tajawal}>
                  {detail.student.full_name_ar}
                </p>
                <div>
                  <label
                    className="block text-sm font-semibold mb-2 text-foreground"
                    style={tajawal}
                  >
                    الحلقة الجديدة
                  </label>
                  <select
                    value={targetCircleId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTargetCircleId(id);
                      const c = circles.find((x) => x.id === Number(id));
                      if (!c || c.student_count == null) {
                        setCapacityHint(null);
                        return;
                      }
                      const remaining =
                        (c.default_capacity ?? c.capacity) - (c.student_count ?? 0);
                      if (c.at_or_over_capacity) {
                        setCapacityHint(
                          `الحلقة مكتملة (${c.student_count}/${c.default_capacity ?? c.capacity}). يمكنك رفع السعة الافتراضية أو فتح حلقة جديدة.`,
                        );
                      } else if (c.near_capacity || remaining <= 3) {
                        setCapacityHint(
                          `تبقى ${remaining} مقاعد فقط. فكّر برفع السعة الافتراضية أو حلقة جديدة قبل إضافة الطالب.`,
                        );
                      } else {
                        setCapacityHint(null);
                      }
                    }}
                    required
                    className={ds.select}
                    style={tajawal}
                  >
                    <option value="">— اختر الحلقة —</option>
                    {circles.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name_ar}
                        {c.student_count != null
                          ? ` (${c.student_count}/${c.default_capacity ?? c.capacity})`
                          : ""}
                        {c.track_name ? ` · ${c.track_name}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCircle && (
                    <div className="mt-2">
                      <CircleCapacityBadge circle={selectedCircle} />
                    </div>
                  )}
                  {capacityHint && (
                    <p className={`mt-2 text-sm ${ds.alert.warn}`} style={tajawal}>
                      {capacityHint}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    className="block text-sm font-semibold mb-2 text-foreground"
                    style={tajawal}
                  >
                    ملاحظة (اختياري)
                  </label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="سبب النقل..."
                    className={ds.btnRound}
                    style={tajawal}
                  />
                </div>
                <Button
                  type="submit"
                  variant="default"
                  disabled={submitting || !targetCircleId || !hasApi}
                  className={`w-full ${ds.btnRound}`}
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
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>سجل الحلقات (تراكمي)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table className={ds.tableMin}>
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
                        <Badge variant="default" className="rounded-lg">
                          نشط
                        </Badge>
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
