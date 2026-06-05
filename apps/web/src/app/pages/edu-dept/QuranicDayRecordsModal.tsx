import { useCallback, useEffect, useState } from "react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
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
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type RecordRow = {
  id: number;
  student_id: number;
  full_name_ar: string;
  hizb_number: number;
  mistakes: number;
  alerts: number;
  lahn_count: number;
  time_taken_seconds: number;
  recorded_at: string;
};

export function QuranicDayRecordsModal({
  dayId,
  dayName,
  open,
  onOpenChange,
}: {
  dayId: number;
  dayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canUseApi() || !open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptQuranicDayRecords(dayId);
      setItems(res.items as RecordRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل السجلات");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dayId, open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function patchLocal(id: number, patch: Partial<RecordRow>) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRecord(row: RecordRow) {
    setBusyId(row.id);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptQuranicDayRecordUpdate(row.id, {
        mistakes: row.mistakes,
        alerts: row.alerts,
        lahn_count: row.lahn_count,
      });
      setSuccess("تم تحديث الرصد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRecord(row: RecordRow) {
    if (
      !window.confirm(
        `حذف حزب ${row.hizb_number} للطالب «${row.full_name_ar}»؟ سيُعاد للتسميع.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptQuranicDayRecordDelete(row.id);
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      setSuccess("تم حذف الحزب — يمكن إعادة تسميعه.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${ds.card} max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto`}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle style={tajawal}>مراجعة/تعديل الرصد — {dayName}</DialogTitle>
        </DialogHeader>

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

        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : items.length === 0 ? (
          <p className={ds.alert.info} style={tajawal}>
            لا توجد سجلات رصد لهذا اليوم بعد.
          </p>
        ) : (
          <Table className={`${ds.tableMin} text-right`}>
            <TableHeader>
              <TableRow>
                <TableHead className={ds.table.head} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  الحزب
                </TableHead>
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  أخطاء
                </TableHead>
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  لحون
                </TableHead>
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  تنبيهات
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableTruncatedCell style={tajawal}>{row.full_name_ar}</TableTruncatedCell>
                  <TableCell
                    className={`${ds.table.cell} text-center tabular-nums`}
                    style={tajawal}
                  >
                    {row.hizb_number}
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min={0}
                      value={row.mistakes}
                      onChange={(e) =>
                        patchLocal(row.id, { mistakes: Number(e.target.value) })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min={0}
                      value={row.lahn_count}
                      onChange={(e) =>
                        patchLocal(row.id, { lahn_count: Number(e.target.value) })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min={0}
                      value={row.alerts}
                      onChange={(e) =>
                        patchLocal(row.id, { alerts: Number(e.target.value) })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableActionsCell>
                    <TableIconAction
                      kind="accept"
                      label="حفظ"
                      disabled={busyId === row.id}
                      onClick={() => saveRecord(row)}
                    />
                    <TableIconAction
                      kind="delete"
                      label="حذف لإعادة التسميع"
                      disabled={busyId === row.id}
                      onClick={() => deleteRecord(row)}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Button
          type="button"
          variant="outline"
          className={`w-full ${ds.btnRound}`}
          onClick={() => onOpenChange(false)}
          style={tajawal}
        >
          إغلاق
        </Button>
      </DialogContent>
    </Dialog>
  );
}
