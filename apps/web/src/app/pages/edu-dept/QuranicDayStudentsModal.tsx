import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
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
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { cn } from "../../components/ui/utils";
import { ds, tajawal } from "../../lib/design-system";

const STAGE_OPTIONS = [
  { id: 2, label: "ابتدائي" },
  { id: 3, label: "متوسط" },
  { id: 4, label: "ثانوي" },
] as const;

type Enrolled = {
  id: number;
  student_id: number;
  full_name_ar: string;
  target_hizbs: number[];
};

type Props = {
  dayId: number;
  dayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function QuranicDayStudentsModal({ dayId, dayName, open, onOpenChange }: Props) {
  const [enrolled, setEnrolled] = useState<Enrolled[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [stageIds, setStageIds] = useState<number[]>([2, 3, 4]);
  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<
    Array<{ id: number; full_name_ar: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pickId, setPickId] = useState<number | null>(null);
  const [hizbFrom, setHizbFrom] = useState(1);
  const [hizbTo, setHizbTo] = useState(5);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const loadEnrolled = useCallback(async () => {
    if (!canUseApi() || !dayId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptQuranicDayStudents(dayId);
      setEnrolled(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [dayId]);

  useEffect(() => {
    if (open) void loadEnrolled();
  }, [open, loadEnrolled]);

  useEffect(() => {
    if (!open || !canUseApi()) return;
    const q = query.trim();
    if (q.length < 1) {
      setSearchItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.eduDeptQuranicDayStudentSearch(dayId, q, stageIds);
        setSearchItems(res.items);
      } catch {
        setSearchItems([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, dayId, stageIds, open]);

  function toggleStage(id: number) {
    setStageIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function enroll() {
    if (pickId == null) {
      setError("اختر الطالب من نتائج البحث");
      return;
    }
    if (hizbFrom < 1 || hizbTo < 1 || hizbFrom > 60 || hizbTo > 60) {
      setError("نطاق الأحزاب بين 1 و 60");
      return;
    }
    setEnrollBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.eduDeptQuranicDayEnrollStudent(dayId, {
        student_id: pickId,
        hizb_from: hizbFrom,
        hizb_to: hizbTo,
      });
      setSuccess("تم إضافة الطالب لليوم القرآني.");
      setQuery("");
      setPickId(null);
      await loadEnrolled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الإضافة");
    } finally {
      setEnrollBusy(false);
    }
  }

  async function removeStudent(studentId: number) {
    setError(null);
    try {
      await api.eduDeptQuranicDayRemoveStudent(dayId, studentId);
      await loadEnrolled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${ds.card} max-w-2xl max-h-[min(92vh,720px)] overflow-y-auto rounded-2xl`}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle style={tajawal}>طلاب اليوم — {dayName}</DialogTitle>
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

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block" style={tajawal}>
              المراحل المستهدفة (بدون التلقين)
            </Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={stageIds.includes(s.id) ? "default" : "outline"}
                  className={ds.btnRound}
                  onClick={() => toggleStage(s.id)}
                  style={tajawal}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div ref={searchRef} className="space-y-2">
            <Label style={tajawal}>بحث عن طالب للإضافة</Label>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPickId(null);
              }}
              placeholder="اكتب اسم الطالب…"
              className={ds.btnRound}
            />
            {searchLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1" style={tajawal}>
                <Loader2 className="w-3 h-3 animate-spin" />
                جاري البحث…
              </p>
            )}
            {searchItems.length > 0 && (
              <ul
                className="border border-border rounded-xl max-h-36 overflow-y-auto bg-card"
                data-student-search-list
              >
                {searchItems.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full text-right px-3 py-2 text-sm hover:bg-muted",
                        pickId === s.id && "bg-primary/10 font-semibold",
                      )}
                      onClick={() => {
                        setPickId(s.id);
                        setQuery(s.full_name_ar);
                        setSearchItems([]);
                      }}
                      style={tajawal}
                    >
                      {s.full_name_ar}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label style={tajawal}>من الحزب</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={hizbFrom}
                onChange={(e) => setHizbFrom(Number(e.target.value))}
                className={ds.btnRound}
              />
            </div>
            <div className="space-y-1">
              <Label style={tajawal}>إلى الحزب</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={hizbTo}
                onChange={(e) => setHizbTo(Number(e.target.value))}
                className={ds.btnRound}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="default"
            className={`w-full ${ds.btnRound}`}
            disabled={enrollBusy}
            onClick={() => enroll()}
            style={tajawal}
          >
            <UserPlus className="w-4 h-4" />
            {enrollBusy ? "جاري الحفظ…" : "حفظ الطالب ونطاق المحفوظ"}
          </Button>
        </div>

        <div className={`${ds.card} mt-4 overflow-x-auto`}>
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={ds.table.head} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={ds.table.head} style={tajawal}>
                  الأحزاب
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    جاري التحميل…
                  </TableCell>
                </TableRow>
              ) : enrolled.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    لا يوجد طلاب مسجلون بعد.
                  </TableCell>
                </TableRow>
              ) : (
                enrolled.map((r) => (
                  <TableRow key={r.student_id}>
                    <TableCell className={ds.table.cell} style={tajawal}>
                      {r.full_name_ar}
                    </TableCell>
                    <TableCell className={`${ds.table.cell} text-xs`} style={tajawal}>
                      {r.target_hizbs.length > 0
                        ? `${r.target_hizbs[0]}–${r.target_hizbs[r.target_hizbs.length - 1]} (${r.target_hizbs.length})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <TableIconAction
                        kind="delete"
                        label="إزالة"
                        onClick={() => removeStudent(r.student_id)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Button
          type="button"
          variant="outline"
          className={`w-full ${ds.btnRound}`}
          onClick={() => onOpenChange(false)}
          style={tajawal}
        >
          <X className="w-4 h-4" />
          إغلاق
        </Button>
      </DialogContent>
    </Dialog>
  );
}
