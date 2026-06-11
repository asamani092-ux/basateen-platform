import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronDown, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type TransferReq = {
  id: number;
  student_id: number;
  student_name: string;
  teacher_name: string;
  notes: string | null;
  target_circle_id: number | null;
  target_circle_name: string | null;
};

type PlacementOpt = {
  id: number;
  entity_type: "circle" | "track";
  name_ar: string;
  track_id: number | null;
  track_name: string | null;
  teacher_name: string | null;
};

function placementKey(p: PlacementOpt) {
  return `${p.entity_type}:${p.id}`;
}

function isSamePlacement(a: PlacementOpt | null, b: PlacementOpt) {
  return a?.entity_type === b.entity_type && a?.id === b.id;
}

function PlacementDestinationRow({
  placement,
  selected,
  onSelect,
}: {
  placement: PlacementOpt;
  selected: boolean;
  onSelect: () => void;
}) {
  const isTrack = placement.entity_type === "track";
  return (
    <button
      key={placementKey(placement)}
      type="button"
      onClick={onSelect}
      className={`w-full text-right px-3 py-2.5 text-sm hover:bg-muted transition-colors ${
        selected ? "bg-muted ring-1 ring-primary/30" : ""
      }`}
      style={tajawal}
    >
      <Badge variant={isTrack ? "default" : "outline"} className="ml-2 rounded-lg text-xs">
        {isTrack ? "مسار" : "حلقة"}
      </Badge>
      <span className="font-semibold">{placement.name_ar}</span>
      {!isTrack && placement.track_name && (
        <span className="text-muted-foreground"> · {placement.track_name}</span>
      )}
      {placement.teacher_name && (
        <Badge variant="secondary" className="mr-2 rounded-lg text-xs">
          {placement.teacher_name}
        </Badge>
      )}
    </button>
  );
}

function formatPlacementLabel(
  circleName: string | null | undefined,
  trackName: string | null | undefined,
) {
  const parts: string[] = [];
  if (circleName?.trim()) parts.push(circleName.trim());
  if (trackName?.trim() && trackName.trim() !== circleName?.trim()) {
    parts.push(trackName.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

type HistoryRow = {
  id: number;
  student_name: string | null;
  status: "success" | "failed";
  old_circle_name: string | null;
  old_track_name: string | null;
  new_circle_name: string | null;
  new_track_name: string | null;
  reason: string | null;
  error_message: string | null;
  created_at: string;
};

export function EduTransfersPage() {
  const [pending, setPending] = useState<TransferReq[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [destinationQ, setDestinationQ] = useState("");
  const [placements, setPlacements] = useState<PlacementOpt[]>([]);
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementOpt | null>(null);
  const [currentPlacement, setCurrentPlacement] = useState<{
    circle_name: string;
    track_name: string | null;
  } | null>(null);
  const [placementLoading, setPlacementLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQ, setHistoryQ] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rejectConfirmId, setRejectConfirmId] = useState<number | null>(null);
  const [approveReqId, setApproveReqId] = useState<number | null>(null);
  const [approvePlacementQ, setApprovePlacementQ] = useState("");
  const [approvePlacements, setApprovePlacements] = useState<PlacementOpt[]>([]);
  const [approvePlacement, setApprovePlacement] = useState<PlacementOpt | null>(null);

  const loadPending = useCallback(async () => {
    if (!canUseApi()) {
      setPendingLoading(false);
      return;
    }
    setPendingLoading(true);
    try {
      const res = await api.eduDeptTeacherRequests({
        status: "pending",
        request_type: "transfer",
      });
      setPending(res.items as TransferReq[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلبات");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadPlacements = useCallback(async (q: string) => {
    if (!canUseApi()) return;
    try {
      const res = await api.eduDeptPlacementOptions(q);
      setPlacements(res.items);
    } catch {
      setPlacements([]);
    }
  }, []);

  const loadHistory = useCallback(async (q: string) => {
    if (!canUseApi()) return;
    setHistoryLoading(true);
    try {
      const res = await api.eduDeptTransferHistory(q);
      setHistory(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل السجل");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  useEffect(() => {
    if (!formOpen || studentId == null) {
      setCurrentPlacement(null);
      return;
    }
    let cancelled = false;
    setPlacementLoading(true);
    void api
      .studentDetail(studentId)
      .then((res) => {
        if (cancelled) return;
        setCurrentPlacement(
          res.current
            ? {
                circle_name: res.current.circle_name?.trim()
                  ? res.current.circle_name
                  : "—",
                track_name: res.current.track_name?.trim() ?? null,
              }
            : { circle_name: "غير موزّع حالياً", track_name: null },
        );
      })
      .catch(() => {
        if (!cancelled) setCurrentPlacement(null);
      })
      .finally(() => {
        if (!cancelled) setPlacementLoading(false);
      });
    setSelectedPlacement(null);
    setDestinationQ("");
    return () => {
      cancelled = true;
    };
  }, [formOpen, studentId]);

  useEffect(() => {
    if (!formOpen || studentId == null) return;
    const t = setTimeout(() => void loadPlacements(destinationQ), 250);
    return () => clearTimeout(t);
  }, [formOpen, studentId, destinationQ, loadPlacements]);

  useEffect(() => {
    if (!historyOpen) return;
    const t = setTimeout(() => void loadHistory(historyQ), 250);
    return () => clearTimeout(t);
  }, [historyOpen, historyQ, loadHistory]);

  useEffect(() => {
    if (approveReqId == null) return;
    const t = setTimeout(async () => {
      if (!canUseApi()) return;
      try {
        const res = await api.eduDeptPlacementOptions(approvePlacementQ);
        setApprovePlacements(res.items);
      } catch {
        setApprovePlacements([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [approveReqId, approvePlacementQ]);

  const filteredPlacements = useMemo(() => placements, [placements]);

  function openApproveDialog(req: TransferReq) {
    if (req.target_circle_id != null) {
      void resolveRequest(req.id, "approved", {
        id: req.target_circle_id,
        entity_type: "circle",
        name_ar: req.target_circle_name ?? "—",
        track_id: null,
        track_name: null,
        teacher_name: null,
      });
      return;
    }
    setApproveReqId(req.id);
    setApprovePlacement(null);
    setApprovePlacementQ("");
    setApprovePlacements([]);
  }

  async function resolveRequest(
    id: number,
    status: "approved" | "rejected",
    target?: PlacementOpt,
  ) {
    setBusyId(id);
    setError(null);
    try {
      await api.eduDeptResolveTeacherRequest(id, {
        status,
        ...(status === "approved" && target
          ? target.entity_type === "track"
            ? {
                placement_type: "track" as const,
                target_track_id: target.id,
              }
            : { target_circle_id: target.id, placement_type: "circle" as const }
          : {}),
      });
      setSuccess(status === "approved" ? "تم اعتماد النقل." : "تم الرفض.");
      toast.success(status === "approved" ? "تم اعتماد النقل" : "تم رفض الطلب");
      setRejectConfirmId(null);
      await loadPending();
      if (historyOpen) await loadHistory(historyQ);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإجراء");
    } finally {
      setBusyId(null);
    }
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (studentId == null || !selectedPlacement) {
      setError("اختر الطالب والوجهة الجديدة");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptManualTransfer({
        student_id: studentId,
        placement_type: selectedPlacement.entity_type,
        ...(selectedPlacement.entity_type === "circle"
          ? {
              circle_id: selectedPlacement.id,
              track_id: selectedPlacement.track_id,
            }
          : { track_id: selectedPlacement.id }),
        note: reason.trim() || "نقل إداري",
      });
      setSuccess("تم حفظ النقل بنجاح.");
      toast.success("تم حفظ النقل بنجاح");
      setStudentId(null);
      setSelectedPlacement(null);
      setCurrentPlacement(null);
      setDestinationQ("");
      setReason("");
      setFormOpen(false);
      await loadPending();
      if (historyOpen) await loadHistory(historyQ);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل النقل");
    } finally {
      setSubmitting(false);
    }
  }

  function openTransferForm() {
    setStudentId(null);
    setSelectedPlacement(null);
    setCurrentPlacement(null);
    setDestinationQ("");
    setReason("");
    setError(null);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6 max-w-[1100px] print:hidden">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <ArrowLeftRight className="w-7 h-7 text-primary" />
          نقل الطلاب
        </h2>
        <p className={ds.page.description} style={tajawal}>
          متابعة طلبات المعلمين، اعتماد النقل، والسجل الرقابي التراكمي.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <Card className={ds.card}>
        <CardHeader>
          <CardTitle style={tajawal}>طلبات النقل الواردة</CardTitle>
          <CardDescription style={tajawal}>
            طلبات من بوابة المعلمين بانتظار الموافقة أو الرفض.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <p className="text-sm text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : pending.length === 0 ? (
            <p className={ds.alert.info} style={tajawal}>
              لا توجد طلبات معلقة.
            </p>
          ) : (
            <Table className={`${ds.tableMin} text-right`}>
              <TableHeader>
                <TableRow>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الطالب
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    المعلم
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    ملاحظة
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
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {r.notes ?? "—"}
                    </TableCell>
                    <TableActionsCell>
                      <TableIconAction
                        kind="accept"
                        label="موافقة"
                        disabled={busyId === r.id}
                        onClick={() => openApproveDialog(r)}
                      />
                      <TableIconAction
                        kind="reject"
                        label="رفض"
                        disabled={busyId === r.id}
                        onClick={() => setRejectConfirmId(r.id)}
                      />
                    </TableActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className={ds.card}>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle style={tajawal}>إجراء نقل جديد</CardTitle>
            <CardDescription style={tajawal}>
              اختر الطالب، راجع موقعه الحالي، ثم حدّد الوجهة الجديدة.
            </CardDescription>
          </div>
          {!formOpen && (
            <Button
              type="button"
              className={ds.btnRound}
              onClick={openTransferForm}
              style={tajawal}
            >
              <Plus className="w-4 h-4" />
              نقل طالب
            </Button>
          )}
        </CardHeader>
        {formOpen && (
          <CardContent>
            <form onSubmit={submitTransfer} className="space-y-5">
              <div className="space-y-2">
                <Label style={tajawal}>1. البحث عن الطالب</Label>
                <AdminStudentSearchCombobox
                  id="transfer-student"
                  value={studentId}
                  onChange={setStudentId}
                />
              </div>

              {studentId != null && (
                <div className={`${ds.card} p-4 space-y-2 bg-muted/30`}>
                  <p className="text-sm font-semibold text-primary" style={tajawal}>
                    2. الموقع الحالي للطالب
                  </p>
                  {placementLoading ? (
                    <p className="text-sm text-muted-foreground" style={tajawal}>
                      جاري جلب بيانات التوزيع…
                    </p>
                  ) : currentPlacement ? (
                    <div className="flex flex-wrap gap-3 text-sm" style={tajawal}>
                      <span>
                        <span className="text-muted-foreground">الحلقة: </span>
                        <strong>{currentPlacement.circle_name}</strong>
                      </span>
                      <span>
                        <span className="text-muted-foreground">المسار: </span>
                        <strong>{currentPlacement.track_name ?? "—"}</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground" style={tajawal}>
                      تعذّر جلب الموقع الحالي.
                    </p>
                  )}
                </div>
              )}

              {studentId != null && (
                <div className="space-y-2">
                  <Label style={tajawal}>3. الوجهة الجديدة (حلقة / مسار)</Label>
                  <Input
                    placeholder="ابحث بالاسم أو المسار أو المعلم…"
                    value={destinationQ}
                    onChange={(e) => setDestinationQ(e.target.value)}
                    className={ds.btnRound}
                  />
                  <div className="max-h-52 overflow-y-auto border border-border rounded-xl divide-y">
                    {filteredPlacements.map((p) => (
                      <PlacementDestinationRow
                        key={placementKey(p)}
                        placement={p}
                        selected={isSamePlacement(selectedPlacement, p)}
                        onSelect={() => setSelectedPlacement(p)}
                      />
                    ))}
                    {filteredPlacements.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground" style={tajawal}>
                        لا توجد نتائج — جرّب كلمة بحث أخرى
                      </p>
                    )}
                  </div>
                  {selectedPlacement && (
                    <Badge variant="secondary" className="rounded-lg" style={tajawal}>
                      {selectedPlacement.entity_type === "track" ? "المشرف المستهدف" : "المعلم المستهدف"}
                      {selectedPlacement.teacher_name
                        ? `: ${selectedPlacement.teacher_name}`
                        : " — غير محدد"}
                    </Badge>
                  )}
                </div>
              )}

              {studentId != null && (
                <div className="space-y-2">
                  <Label style={tajawal}>4. سبب النقل (اختياري)</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثال: تحسين المستوى، طلب ولي الأمر…"
                    className={ds.btnRound}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={submitting || studentId == null || !selectedPlacement}
                  className={ds.btnRound}
                  style={tajawal}
                >
                  {submitting ? "جاري الحفظ…" : "حفظ النقل"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  onClick={() => setFormOpen(false)}
                  style={tajawal}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <Dialog
        open={approveReqId != null}
        onOpenChange={(open) => {
          if (!open) {
            setApproveReqId(null);
            setApprovePlacement(null);
          }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>اعتماد النقل — اختيار الوجهة</DialogTitle>
            <DialogDescription style={tajawal}>
              حدّد الحلقة أو المسار المستهدف لإتمام اعتماد الطلب.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="ابحث داخل القائمة…"
              value={approvePlacementQ}
              onChange={(e) => setApprovePlacementQ(e.target.value)}
              className={ds.btnRound}
            />
            <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y">
              {approvePlacements.map((p) => (
                <PlacementDestinationRow
                  key={placementKey(p)}
                  placement={p}
                  selected={isSamePlacement(approvePlacement, p)}
                  onSelect={() => setApprovePlacement(p)}
                />
              ))}
            </div>
            <Button
              type="button"
              className={ds.btnRound}
              disabled={approveReqId == null || approvePlacement == null || busyId != null}
              onClick={() => {
                if (approveReqId == null || !approvePlacement) return;
                void resolveRequest(approveReqId, "approved", approvePlacement).then(() => {
                  setApproveReqId(null);
                  setApprovePlacement(null);
                });
              }}
              style={tajawal}
            >
              اعتماد النقل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectConfirmId != null}
        onOpenChange={(open) => {
          if (!open) setRejectConfirmId(null);
        }}
      >
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تأكيد رفض الطلب</DialogTitle>
            <DialogDescription style={tajawal}>
              سيتم رفض طلب النقل ولن يُنفَّذ أي تغيير في الإسناد.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => setRejectConfirmId(null)}
              style={tajawal}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={ds.btnRound}
              disabled={rejectConfirmId == null || busyId != null}
              onClick={() => {
                if (rejectConfirmId == null) return;
                void resolveRequest(rejectConfirmId, "rejected");
              }}
              style={tajawal}
            >
              تأكيد الرفض
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className={ds.card}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between p-4 text-right"
            >
              <span className={ds.page.section} style={tajawal}>
                سجل العمليات السابقة
              </span>
              <ChevronDown
                className={`w-5 h-5 transition-transform ${historyOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <Input
                placeholder="بحث بالطالب أو السبب أو رسالة الخطأ…"
                value={historyQ}
                onChange={(e) => setHistoryQ(e.target.value)}
                className={ds.btnRound}
              />
              {historyLoading ? (
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  جاري التحميل…
                </p>
              ) : (
                <Table className={`${ds.tableMin} text-right`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={ds.table.head} style={tajawal}>
                        التاريخ
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        الطالب
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        من (السابق)
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        إلى (الجديد)
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        الحالة
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        التفاصيل
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id} className="print:break-inside-avoid">
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {h.created_at}
                        </TableCell>
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {h.student_name ?? "—"}
                        </TableCell>
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {formatPlacementLabel(h.old_circle_name, h.old_track_name)}
                        </TableCell>
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {formatPlacementLabel(h.new_circle_name, h.new_track_name)}
                        </TableCell>
                        <TableCell className={ds.table.cell} style={tajawal}>
                          <Badge
                            variant={h.status === "success" ? "default" : "destructive"}
                            className="rounded-lg"
                          >
                            {h.status === "success" ? "ناجح" : "فاشل"}
                          </Badge>
                        </TableCell>
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {h.status === "failed"
                            ? h.error_message ?? h.reason ?? "—"
                            : h.reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
