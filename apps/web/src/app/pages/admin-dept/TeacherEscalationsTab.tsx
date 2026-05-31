import { useCallback, useEffect, useState } from "react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { ds, tajawal } from "../../lib/design-system";

type EscRow = {
  id: number;
  student_id: number;
  student_name: string;
  teacher_name: string;
  notes: string | null;
  created_at: string;
};

export function TeacherEscalationsTab({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<EscRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewRow, setViewRow] = useState<EscRow | null>(null);
  const [editRow, setEditRow] = useState<EscRow | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [deleteRow, setDeleteRow] = useState<EscRow | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptTeacherEscalations();
      setItems(res.items as EscRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function convertToPledge(id: number) {
    setBusyId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.adminDeptConvertEscalationToPledge(id);
      setSuccess(
        res.threshold_reached
          ? `تم التحويل إلى تعهد. تنبيه: بلغ الطالب الحد (${res.pledge_count}/${res.max_pledges}).`
          : "تم تحويل التصعيد إلى تعهد رسمي.",
      );
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحويل");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editRow || !editNotes.trim()) return;
    setBusyId(editRow.id);
    setError(null);
    try {
      await api.adminDeptPatchEscalation(editRow.id, editNotes.trim());
      setSuccess("تم تحديث التصعيد.");
      setEditRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التعديل");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setBusyId(deleteRow.id);
    setError(null);
    try {
      await api.adminDeptDeleteEscalation(deleteRow.id);
      setSuccess("تم حذف التصعيد.");
      setDeleteRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
        جاري التحميل…
      </p>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
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
      {items.length === 0 ? (
        <p className={`m-4 ${ds.alert.info}`} style={tajawal}>
          لا توجد تصعيدات معلقة من المعلمين.
        </p>
      ) : (
        <Table className={`${ds.tableMin} text-right`} dir="rtl">
          <TableHeader>
            <TableRow>
              <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                الطالب
              </TableHead>
              <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                المعلم
              </TableHead>
              <TableHead className={`${ds.table.head} w-[24%]`} style={tajawal}>
                ملاحظة
              </TableHead>
              <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                التاريخ
              </TableHead>
              <TableHead className={ds.table.headActionsWide} style={tajawal}>
                إجراءات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
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
                  {r.created_at.slice(0, 10)}
                </TableCell>
                <TableActionsCell wide>
                  <div className={ds.table.actionsWrapWide}>
                    <TableIconAction
                      kind="view"
                      label="عرض"
                      onClick={() => setViewRow(r)}
                    />
                    <TableIconAction
                      kind="edit"
                      label="تعديل"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setEditRow(r);
                        setEditNotes(r.notes ?? "");
                      }}
                    />
                    <TableIconAction
                      kind="violation"
                      label="تحويل إلى تعهد"
                      disabled={busyId === r.id}
                      onClick={() => convertToPledge(r.id)}
                    />
                    <TableIconAction
                      kind="delete"
                      label="حذف"
                      disabled={busyId === r.id}
                      onClick={() => setDeleteRow(r)}
                    />
                  </div>
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={viewRow != null} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تفاصيل التصعيد</DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="space-y-2 text-sm" style={tajawal}>
              <p>
                <strong>الطالب:</strong> {viewRow.student_name}
              </p>
              <p>
                <strong>المعلم:</strong> {viewRow.teacher_name}
              </p>
              <p>
                <strong>التاريخ:</strong> {viewRow.created_at.slice(0, 10)}
              </p>
              <p>
                <strong>الملاحظة:</strong> {viewRow.notes ?? "—"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editRow != null} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>تعديل التصعيد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label style={tajawal}>ملاحظة التصعيد</Label>
            <Input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className={ds.btnRound}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              className={ds.btnRound}
              disabled={busyId != null}
              onClick={() => void saveEdit()}
              style={tajawal}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRow != null} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <DialogContent className={ds.dialog} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>حذف التصعيد</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={tajawal}>
            هل تريد حذف تصعيد {deleteRow?.student_name}؟ لا يمكن التراجع.
          </p>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              className={ds.btnRound}
              disabled={busyId != null}
              onClick={() => void confirmDelete()}
              style={tajawal}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
