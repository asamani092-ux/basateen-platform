import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Search } from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { CircleCapacityBadge } from "../../components/admin/CircleCapacityBadge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
import { canUseApi } from "../../lib/api-access";
import { getApiToken } from "../../lib/api-token";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { formatStudentPlacement } from "../../lib/student-placement-display";
import { ds, tajawal } from "../../lib/design-system";

type TransferReq = {
  id: number;
  student_id: number;
  student_name: string;
  teacher_name: string;
  notes: string | null;
  target_circle_id: number | null;
  target_circle_name: string | null;
  created_at: string;
};

const ERROR_AR: Record<string, string> = {
  unauthorized: "انتهت الجلسة — سجّل الدخول مرة أخرى",
  forbidden: "ليس لديك صلاحية",
  student_not_found: "الطالب غير موجود",
  circle_not_found: "الحلقة غير موجودة",
  already_in_circle: "الطالب في هذه الحلقة مسبقاً",
  forbidden_target_circle: "لا يمكن النقل إلى هذه الحلقة",
  forbidden_current_circle: "لا يمكن نقل طالب خارج نطاقك",
};

export function EduTransfersPage() {
  const hasApi = Boolean(getApiToken());

  const [pending, setPending] = useState<TransferReq[]>([]);
  const [eduCircles, setEduCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [manualStudentId, setManualStudentId] = useState<number | null>(null);
  const [manualCircleId, setManualCircleId] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<StudentRow[]>([]);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [targetCircleId, setTargetCircleId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [capacityHint, setCapacityHint] = useState<string | null>(null);

  const selectedCircle = circles.find((c) => c.id === Number(targetCircleId));

  const loadPending = useCallback(async () => {
    if (!canUseApi()) {
      setPendingLoading(false);
      return;
    }
    setPendingLoading(true);
    try {
      const [reqRes, circRes] = await Promise.all([
        api.eduDeptTeacherRequests({ status: "pending", request_type: "transfer" }),
        api.eduDeptTeacherCircles(),
      ]);
      setPending(reqRes.items as TransferReq[]);
      setEduCircles(circRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل طلبات النقل");
    } finally {
      setPendingLoading(false);
    }
  }, []);

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
    loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!hasApi) return;
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

  async function resolveRequest(
    id: number,
    status: "approved" | "rejected",
    targetCircleId?: number,
  ) {
    setBusyId(id);
    setError(null);
    try {
      await api.eduDeptResolveTeacherRequest(id, {
        status,
        target_circle_id: targetCircleId,
      });
      setSuccess(status === "approved" ? "تمت الموافقة والنقل." : "تم الرفض.");
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإجراء");
    } finally {
      setBusyId(null);
    }
  }

  async function manualTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (manualStudentId == null || !manualCircleId) {
      setError("اختر الطالب والحلقة");
      return;
    }
    setManualSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptManualTransfer({
        student_id: manualStudentId,
        circle_id: Number(manualCircleId),
        note: manualNote.trim() || undefined,
      });
      setSuccess("تم النقل اليدوي بنجاح.");
      setManualNote("");
      setManualStudentId(null);
      setManualCircleId("");
      setTransferOpen(false);
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل النقل");
    } finally {
      setManualSaving(false);
    }
  }

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
      await loadPending();
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
    <div className="space-y-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <ArrowLeftRight className="w-7 h-7 text-primary" />
            متابعة ونقل الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            مراجعة طلبات المعلمين، النقل المباشر، والسجل التراكمي في صفحة واحدة.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
          onClick={() => setTransferOpen(true)}
          style={tajawal}
        >
          <Plus className="w-4 h-4" />
          نقل سريع
        </Button>
      </div>

      {!hasApi && (
        <div className={ds.alert.warn} style={tajawal}>
          سجّل الخروج ثم ادخل مجدداً بالجوال لربط API.
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

      <section className={ds.card}>
        <div className="p-4 border-b border-border">
          <h3 className={ds.page.section} style={tajawal}>
            طلبات النقل المعلقة
          </h3>
        </div>
        {pendingLoading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : pending.length === 0 ? (
          <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد طلبات نقل معلقة.
          </p>
        ) : (
          <Table className={`${ds.tableMin} text-right`}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                  المعلم
                </TableHead>
                <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                  ملاحظة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                  الحلقة المطلوبة
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.student_name}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.teacher_name}
                  </TableCell>
                  <TableCell
                    className={`${ds.table.cell} text-muted-foreground text-sm`}
                    style={tajawal}
                  >
                    {r.notes ?? "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.target_circle_name ?? "—"}
                  </TableCell>
                  <TableActionsCell>
                    <TableIconAction
                      kind="accept"
                      label="موافقة"
                      disabled={busyId === r.id}
                      onClick={() =>
                        resolveRequest(
                          r.id,
                          "approved",
                          r.target_circle_id ?? undefined,
                        )
                      }
                    />
                    <TableIconAction
                      kind="reject"
                      disabled={busyId === r.id}
                      onClick={() => resolveRequest(r.id, "rejected")}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={ds.card}>
          <CardHeader>
            <CardTitle style={tajawal}>اختيار الطالب</CardTitle>
            <CardDescription style={tajawal}>
              ابحث بالاسم ثم اختر الطالب للنقل المباشر
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
                  <span
                    className="block font-semibold text-foreground truncate"
                    title={s.full_name_ar}
                  >
                    {s.full_name_ar}
                  </span>
                  <span
                    className="block text-xs text-muted-foreground font-normal truncate"
                    title={
                      formatStudentPlacement({
                        circleName: s.circle_name,
                        trackName: s.track_name,
                        emptyLabel: "—",
                      }).title
                    }
                  >
                    {
                      formatStudentPlacement({
                        circleName: s.circle_name,
                        trackName: s.track_name,
                        emptyLabel: "—",
                      }).text
                    }
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
                          `الحلقة مكتملة (${c.student_count}/${c.default_capacity ?? c.capacity}).`,
                        );
                      } else if (c.near_capacity || remaining <= 3) {
                        setCapacityHint(`تبقى ${remaining} مقاعد فقط.`);
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
                  <TableHead
                    className={`${ds.table.head} ${ds.table.colPlacement}`}
                    style={tajawal}
                  >
                    الحلقة
                  </TableHead>
                  <TableHead
                    className={`${ds.table.head} ${ds.table.colPlacement}`}
                    style={tajawal}
                  >
                    المسار
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                    من
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                    إلى
                  </TableHead>
                  <TableHead
                    className={`${ds.table.head} w-[24%] max-w-[280px]`}
                    style={tajawal}
                  >
                    ملاحظة
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.history.map((h: HistoryRow) => (
                  <TableRow key={h.id}>
                    <TableTruncatedCell style={tajawal}>{h.circle_name}</TableTruncatedCell>
                    <TableTruncatedCell style={tajawal}>
                      {h.track_name ?? "—"}
                    </TableTruncatedCell>
                    <TableTruncatedCell style={tajawal}>{h.from_at}</TableTruncatedCell>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {h.to_at ?? (
                        <Badge variant="default" className="rounded-lg">
                          نشط
                        </Badge>
                      )}
                    </TableCell>
                    <TableTruncatedCell className="max-w-[280px]" style={tajawal}>
                      {h.note ?? "—"}
                    </TableTruncatedCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>نقل سريع</DialogTitle>
          </DialogHeader>
          <form onSubmit={manualTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>الطالب</Label>
              <AdminStudentSearchCombobox
                id="manual-transfer-student"
                value={manualStudentId}
                onChange={(id) => setManualStudentId(id)}
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>الحلقة الجديدة</Label>
              <select
                value={manualCircleId}
                onChange={(e) => setManualCircleId(e.target.value)}
                className={ds.select}
                required
                style={tajawal}
              >
                <option value="">— اختر —</option>
                {eduCircles.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>ملاحظة</Label>
              <Input
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className={ds.btnRound}
              />
            </div>
            <Button
              type="submit"
              variant="default"
              className={`w-full ${ds.btnRound}`}
              disabled={manualSaving}
              style={tajawal}
            >
              {manualSaving ? "جاري النقل…" : "تنفيذ النقل"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
