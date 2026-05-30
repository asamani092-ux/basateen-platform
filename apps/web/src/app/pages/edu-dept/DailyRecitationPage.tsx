import { useCallback, useEffect, useState } from "react";
import { ClipboardList, MoreHorizontal } from "lucide-react";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type Row = {
  student_id: number;
  full_name_ar: string;
  listened: boolean;
  repeated: boolean;
  revised: boolean;
  error_count: number;
  tune_errors: number;
  face_count: number;
  notes: string;
};

export function DailyRecitationPage() {
  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [circleId, setCircleId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqStudent, setReqStudent] = useState<Row | null>(null);
  const [reqType, setReqType] = useState<"transfer" | "escalation">("escalation");
  const [reqNotes, setReqNotes] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);

  useEffect(() => {
    if (!canUseApi()) return;
    api.eduDeptTeacherCircles().then((r) => {
      setCircles(r.items);
      if (r.items.length === 1) setCircleId(String(r.items[0].id));
    });
  }, []);

  const load = useCallback(async () => {
    const cid = Number(circleId);
    if (!canUseApi() || !Number.isFinite(cid) || cid <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptDailyRecitationGet(cid, date);
      setRows(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [circleId, date]);

  useEffect(() => {
    if (circleId) void load();
  }, [circleId, date, load]);

  function patchRow(studentId: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)),
    );
  }

  async function save() {
    const cid = Number(circleId);
    if (!Number.isFinite(cid)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptDailyRecitationSave({
        circle_id: cid,
        recitation_date: date,
        rows: rows.map((r) => ({
          student_id: r.student_id,
          listened: r.listened,
          repeated: r.repeated,
          revised: r.revised,
          error_count: r.error_count,
          tune_errors: r.tune_errors,
          face_count: r.face_count,
          notes: r.notes,
        })),
      });
      setSuccess("تم حفظ الرصد اليومي.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqStudent) return;
    setReqSubmitting(true);
    setError(null);
    try {
      await api.eduDeptCreateTeacherRequest({
        student_id: reqStudent.student_id,
        request_type: reqType,
        notes: reqNotes.trim() || undefined,
      });
      setReqOpen(false);
      setReqNotes("");
      setSuccess(
        reqType === "escalation"
          ? "تم إرسال التصعيد للإدارة."
          : "تم إرسال طلب النقل.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setReqSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <ClipboardList className="w-7 h-7 text-primary" />
            الرصد اليومي
          </h2>
          <p className={ds.page.description} style={tajawal}>
            سماع، تكرار، مراجعة، وأخطاء — مع طلبات النقل والتصعيد.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
          disabled={saving || !circleId}
          onClick={() => save()}
          style={tajawal}
        >
          {saving ? "جاري الحفظ…" : "حفظ الرصد"}
        </Button>
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

      <div className={`${ds.card} p-4 flex flex-wrap gap-4 items-end`}>
        <div className="space-y-1 min-w-[200px]">
          <Label style={tajawal}>الحلقة</Label>
          <select
            value={circleId}
            onChange={(e) => setCircleId(e.target.value)}
            className={ds.select}
            style={tajawal}
          >
            <option value="">— اختر الحلقة —</option>
            {circles.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label style={tajawal}>التاريخ</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={ds.btnRound}
          />
        </div>
      </div>

      <div className={ds.card}>
        {loading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : rows.length === 0 ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            اختر حلقة لعرض الطلاب.
          </p>
        ) : (
          <Table className={`${ds.tableMin} text-right`}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[8%]`} style={tajawal}>
                  سماع
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[8%]`} style={tajawal}>
                  تكرار
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[8%]`} style={tajawal}>
                  مراجعة
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[10%]`} style={tajawal}>
                  أوجه
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[10%]`} style={tajawal}>
                  أخطاء
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[10%]`} style={tajawal}>
                  لحن
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.student_id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {r.full_name_ar}
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.listened}
                      onChange={(e) =>
                        patchRow(r.student_id, { listened: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.repeated}
                      onChange={(e) =>
                        patchRow(r.student_id, { repeated: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.revised}
                      onChange={(e) =>
                        patchRow(r.student_id, { revised: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <Input
                      type="number"
                      min={0}
                      value={r.face_count}
                      onChange={(e) =>
                        patchRow(r.student_id, {
                          face_count: Number(e.target.value),
                        })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <Input
                      type="number"
                      min={0}
                      value={r.error_count}
                      onChange={(e) =>
                        patchRow(r.student_id, {
                          error_count: Number(e.target.value),
                        })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <Input
                      type="number"
                      min={0}
                      value={r.tune_errors}
                      onChange={(e) =>
                        patchRow(r.student_id, {
                          tune_errors: Number(e.target.value),
                        })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  <TableActionsCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={ds.btnRound}
                      title="إجراء / طلب"
                      onClick={() => {
                        setReqStudent(r);
                        setReqType("escalation");
                        setReqNotes("");
                        setReqOpen(true);
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className={`${ds.dialog} max-w-md`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>طلب للطالب</DialogTitle>
            <DialogDescription style={tajawal}>
              {reqStudent?.full_name_ar}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRequest} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={reqType === "escalation" ? "default" : "outline"}
                className={`flex-1 ${ds.btnRound}`}
                onClick={() => setReqType("escalation")}
                style={tajawal}
              >
                تصعيد للإدارة
              </Button>
              <Button
                type="button"
                variant={reqType === "transfer" ? "default" : "outline"}
                className={`flex-1 ${ds.btnRound}`}
                onClick={() => setReqType("transfer")}
                style={tajawal}
              >
                طلب نقل
              </Button>
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>ملاحظة</Label>
              <Input
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                className={ds.btnRound}
                required
              />
            </div>
            <Button
              type="submit"
              variant="default"
              className={`w-full ${ds.btnRound}`}
              disabled={reqSubmitting}
              style={tajawal}
            >
              {reqSubmitting ? "جاري الإرسال…" : "إرسال الطلب"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
