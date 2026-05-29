import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { AdminStudentSearchCombobox } from "../../components/admin/AdminStudentSearchCombobox";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
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
  created_at: string;
};

export function StudentTransferPage() {
  const [pending, setPending] = useState<TransferReq[]>([]);
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [manualStudentId, setManualStudentId] = useState<number | null>(null);
  const [manualCircleId, setManualCircleId] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [reqRes, circRes] = await Promise.all([
        api.eduDeptTeacherRequests({ status: "pending", request_type: "transfer" }),
        api.eduDeptTeacherCircles(),
      ]);
      setPending(reqRes.items as TransferReq[]);
      setCircles(circRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(
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
      await load();
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل النقل");
    } finally {
      setManualSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-[1100px]">
      <div>
        <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
          <ArrowLeftRight className="w-7 h-7 text-primary" />
          متابعة النقل والخطط
        </h2>
        <p className={ds.page.description} style={tajawal}>
          مراجعة طلبات المعلمين والنقل اليدوي مع حفظ السجل التراكمي.
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

      <section className={ds.card}>
        <div className="p-4 border-b border-border">
          <h3 className={ds.page.section} style={tajawal}>
            طلبات النقل المعلقة
          </h3>
        </div>
        {loading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : pending.length === 0 ? (
          <p className={`p-4 m-4 ${ds.alert.info}`} style={tajawal}>
            لا توجد طلبات نقل معلقة.
          </p>
        ) : (
          <Table className={ds.tableMin}>
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
                  <TableCell className={`${ds.table.cell} text-muted-foreground text-sm`} style={tajawal}>
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
                        resolve(
                          r.id,
                          "approved",
                          r.target_circle_id ?? undefined,
                        )
                      }
                    />
                    <TableIconAction
                      kind="reject"
                      disabled={busyId === r.id}
                      onClick={() => resolve(r.id, "rejected")}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className={`${ds.card} p-6 space-y-4`}>
        <h3 className={ds.page.section} style={tajawal}>
          نقل يدوي لطالب
        </h3>
        <form onSubmit={manualTransfer} className="space-y-4 max-w-md">
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
              {circles.map((c) => (
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
            className={ds.btnRound}
            disabled={manualSaving}
            style={tajawal}
          >
            {manualSaving ? "جاري النقل…" : "تنفيذ النقل"}
          </Button>
        </form>
      </section>
    </div>
  );
}
