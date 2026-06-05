import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Grid3X3, LayoutGrid, MoreHorizontal } from "lucide-react";
import {
  TableActionsCell,
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
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
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

type ViewMode = "grid" | "cards";

const SUPERVISOR_ROLES = new Set(["edu_supervisor", "super_admin", "programs_supervisor"]);

export function DailyRecitationPage() {
  const { user } = useAuth();
  const isSupervisor = user ? SUPERVISOR_ROLES.has(user.role) : false;

  const [circles, setCircles] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [circleId, setCircleId] = useState<number | null>(null);
  const [circleName, setCircleName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqStudent, setReqStudent] = useState<Row | null>(null);
  const [reqType, setReqType] = useState<"transfer" | "escalation">("escalation");
  const [reqNotes, setReqNotes] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = isSupervisor
        ? await api.eduDeptMyStudents({
            date,
            ...(circleId != null ? { circle_id: circleId } : {}),
          })
        : await api.eduDeptMyStudents({ date });

      setCircles(res.circles ?? []);
      if (res.needs_circle_selection && isSupervisor) {
        setRows([]);
        return;
      }
      setCircleId(res.circle_id);
      setCircleName(res.circle_name ?? "");
      setRows(res.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحميل";
      setError(msg.includes("لم يتم ربط حلقة") ? msg : msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, circleId, isSupervisor]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchRow(studentId: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)),
    );
  }

  async function save() {
    if (!isSupervisor && rows.length === 0) return;
    if (isSupervisor && circleId == null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptDailyRecitationSave({
        ...(circleId != null ? { circle_id: circleId } : {}),
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
    if (!reqStudent || user?.role !== "teacher") return;
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

  const canSave = rows.length > 0 && (isSupervisor ? circleId != null : true);

  return (
    <div className="space-y-6 max-w-[1200px] pb-24">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <ClipboardList className="w-7 h-7 text-primary" />
            الرصد اليومي
          </h2>
          <p className={ds.page.description} style={tajawal}>
            {isSupervisor
              ? "متابعة أو رصد حلقات المسار — اختر الحلقة ثم سجّل الإنجاز."
              : "سماع، تكرار، مراجعة، وأوجه — حلقتك تُحمّل تلقائياً."}
          </p>
          {!isSupervisor && circleName && (
            <p className="text-sm font-semibold text-primary mt-1" style={tajawal}>
              الحلقة: {circleName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            className="border border-border rounded-xl p-1"
          >
            <ToggleGroupItem value="grid" aria-label="جدول" className={ds.btnRound}>
              <Grid3X3 className="w-4 h-4 ml-1" />
              جدول
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="بطاقات" className={ds.btnRound}>
              <LayoutGrid className="w-4 h-4 ml-1" />
              بطاقات
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
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

      <div className={`${ds.card} p-4 flex flex-col md:flex-row flex-wrap gap-4 md:items-end`}>
        {isSupervisor && (
          <div className="space-y-1 w-full md:max-w-xs">
            <Label style={tajawal}>الحلقة</Label>
            <select
              value={circleId ?? ""}
              onChange={(e) =>
                setCircleId(e.target.value ? Number(e.target.value) : null)
              }
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
        )}
        <div className="space-y-1 w-full md:max-w-xs">
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
        ) : isSupervisor && circleId == null ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            اختر حلقة من قائمة مسارك لعرض الطلاب.
          </p>
        ) : rows.length === 0 ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا يوجد طلاب في هذه الحلقة.
          </p>
        ) : viewMode === "grid" ? (
          <Table className={`${ds.tableMin} text-right`}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[7%]`} style={tajawal}>
                  سماع
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[7%]`} style={tajawal}>
                  تكرار
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[7%]`} style={tajawal}>
                  مراجعة
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[9%]`} style={tajawal}>
                  أوجه
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[9%]`} style={tajawal}>
                  أخطاء
                </TableHead>
                <TableHead className={`${ds.table.head} text-center w-[9%]`} style={tajawal}>
                  لحن
                </TableHead>
                {!isSupervisor && (
                  <TableHead className={ds.table.headActions} style={tajawal}>
                    إجراء
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.student_id}>
                  <TableTruncatedCell style={tajawal}>{r.full_name_ar}</TableTruncatedCell>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.listened}
                      tabIndex={0}
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
                      tabIndex={0}
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
                      tabIndex={0}
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
                      tabIndex={0}
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
                      tabIndex={0}
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
                      tabIndex={0}
                      value={r.tune_errors}
                      onChange={(e) =>
                        patchRow(r.student_id, {
                          tune_errors: Number(e.target.value),
                        })
                      }
                      className={`${ds.btnRound} w-16 mx-auto h-8 text-center`}
                    />
                  </TableCell>
                  {!isSupervisor && (
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
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <div
                key={r.student_id}
                className={`${ds.card} p-4 space-y-3 border border-border`}
              >
                <p className="font-bold text-sm" style={tajawal}>
                  {r.full_name_ar}
                </p>
                <div className="flex flex-wrap gap-3 text-sm" style={tajawal}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.listened}
                      onChange={(e) =>
                        patchRow(r.student_id, { listened: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                    سماع
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.repeated}
                      onChange={(e) =>
                        patchRow(r.student_id, { repeated: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                    تكرار
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.revised}
                      onChange={(e) =>
                        patchRow(r.student_id, { revised: e.target.checked })
                      }
                      className="size-4 rounded border-border"
                    />
                    مراجعة
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="أوجه"
                    value={r.face_count}
                    onChange={(v) => patchRow(r.student_id, { face_count: v })}
                  />
                  <NumField
                    label="أخطاء"
                    value={r.error_count}
                    onChange={(v) => patchRow(r.student_id, { error_count: v })}
                  />
                  <NumField
                    label="لحن"
                    value={r.tune_errors}
                    onChange={(v) => patchRow(r.student_id, { tune_errors: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isSupervisor && (
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
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 print:hidden md:mx-0 md:rounded-2xl md:border">
        <div className="max-w-[1200px] mx-auto flex justify-end">
          <Button
            type="button"
            variant="default"
            size="lg"
            className={`${ds.btnRound} min-w-[160px] shadow-lg`}
            disabled={saving || !canSave}
            onClick={() => save()}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : "حفظ الرصد"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground" style={tajawal}>
        {label}
      </Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${ds.btnRound} h-8 text-center text-sm`}
      />
    </div>
  );
}
