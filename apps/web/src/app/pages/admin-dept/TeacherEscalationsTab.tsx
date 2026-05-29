import { useCallback, useEffect, useState } from "react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
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

export function TeacherEscalationsTab() {
  const [items, setItems] = useState<EscRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحويل");
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
    <div className="space-y-4">
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
        <Table className={ds.tableMin}>
          <TableHeader>
            <TableRow>
              <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                الطالب
              </TableHead>
              <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                المعلم
              </TableHead>
              <TableHead className={`${ds.table.head} w-[28%]`} style={tajawal}>
                ملاحظة
              </TableHead>
              <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                التاريخ
              </TableHead>
              <TableHead className={ds.table.headActions} style={tajawal}>
                إجراء
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
                <TableActionsCell>
                  <TableIconAction
                    kind="violation"
                    label="تحويل إلى تعهد"
                    disabled={busyId === r.id}
                    onClick={() => convertToPledge(r.id)}
                  />
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
