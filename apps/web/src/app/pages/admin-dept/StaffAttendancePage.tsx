import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Trash2 } from "lucide-react";
import { StaffAttendanceReportModal } from "../../components/attendance/StaffAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { AttendanceStatusButtons } from "../../components/attendance/AttendanceStatusButtons";
import {
  clearAttendanceDay,
  mutateAttendanceStatus,
  removeAttendanceRecord,
  toastAttendanceCleared,
  toastAttendanceDeleted,
  toastAttendanceSaved,
  type AttendanceStatusValue,
} from "../../lib/attendance-mutations";
import { ds, tajawal } from "../../lib/design-system";

function formatRole(role: string | null | undefined): string {
  return (
    (
      {
        super_admin: "مشرف عام",
        admin_supervisor: "مشرف إداري",
        edu_supervisor: "مشرف تعليمي",
        programs_supervisor: "مشرف برامج",
        prog_supervisor: "مشرف برامج",
        track_supervisor: "مشرف مسار",
        teacher: "معلم",
      } as Record<string, string>
    )[role ?? ""] || "غير محدد"
  );
}

type Row = {
  user_id: number;
  full_name_ar: string;
  role: string | null;
  status: string;
  attendance_id: number | null;
  has_record: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StaffAttendancePage() {
  const [date, setDate] = useState(todayIso);
  const [attendanceData, setAttendanceData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const cellClass = "text-right px-4 py-3";
  const isRetroDate = date !== todayIso();
  const recordedCount = attendanceData.filter((r) => r.has_record).length;

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStaff(date);
      const items: Row[] = res.items.map((r) => ({
        user_id: r.user_id,
        full_name_ar: r.full_name_ar,
        role: r.role ?? null,
        status: normalizeAttendanceStatus(r.status ?? "present"),
        attendance_id: r.attendance_id ?? null,
        has_record: Boolean(r.has_record),
      }));
      setAttendanceData(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  async function applyStatus(row: Row, status: AttendanceStatusValue) {
    setRowBusy(row.user_id);
    setError(null);
    setAttendanceData((prev) =>
      prev.map((r) => (r.user_id === row.user_id ? { ...r, status } : r)),
    );
    try {
      const result = await mutateAttendanceStatus({
        beneficiaryType: "staff",
        personId: row.user_id,
        attendanceId: row.attendance_id,
        hasRecord: row.has_record,
        date,
        status,
      });
      setAttendanceData((prev) =>
        prev.map((r) =>
          r.user_id === row.user_id
            ? {
                ...r,
                status,
                attendance_id: result.attendanceId,
                has_record: result.hasRecord,
              }
            : r,
        ),
      );
      toastAttendanceSaved();
      bumpDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحديث التحضير");
      void load();
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteRow(row: Row) {
    if (row.attendance_id == null) return;
    setRowBusy(row.user_id);
    setError(null);
    try {
      await removeAttendanceRecord({
        beneficiaryType: "staff",
        attendanceId: row.attendance_id,
      });
      setAttendanceData((prev) =>
        prev.map((r) =>
          r.user_id === row.user_id
            ? { ...r, status: "present", attendance_id: null, has_record: false }
            : r,
        ),
      );
      toastAttendanceDeleted();
      bumpDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف السجل");
    } finally {
      setRowBusy(null);
    }
  }

  async function confirmBulkClear() {
    setBulkBusy(true);
    setError(null);
    try {
      const deleted = await clearAttendanceDay({
        beneficiaryType: "staff",
        date,
      });
      toastAttendanceCleared(deleted);
      bumpDashboard();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إلغاء التحضير");
    } finally {
      setBulkBusy(false);
      setBulkConfirmOpen(false);
    }
  }

  const filteredRows = useMemo(
    () =>
      attendanceData.filter((r) =>
        matchesArabicName(nameQuery, r.full_name_ar),
      ),
    [attendanceData, nameQuery],
  );

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          تحضير المنسوبين
        </h2>
        <p className={ds.page.description} style={tajawal}>
          اختر التاريخ وعدّل الحضور فوراً — يدعم التعديل بأثر رجعي لأي يوم
          سابق.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-3`}>
        <div>
          <Label className="text-xs text-muted-foreground" style={tajawal}>
            تاريخ التحضير
          </Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`block w-full max-w-xs mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
          />
        </div>
        {isRetroDate && (
          <p className={ds.alert.info} style={tajawal}>
            وضع التعديل بأثر رجعي — تعرض سجلات يوم {date} فقط.
          </p>
        )}
      </div>

      <AttendanceFilterBar
        nameQuery={nameQuery}
        onNameQueryChange={setNameQuery}
        groupLabel="الدور"
        groupValue=""
        onGroupChange={() => {}}
        groupOptions={[]}
        hideGroupFilter
        shownCount={filteredRows.length}
        totalCount={attendanceData.length}
        hiddenDirty={0}
      />

      <div className={`${ds.card} p-4 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground" style={tajawal}>
            {recordedCount} سجل محفوظ من {attendanceData.length} منسوب
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={`${ds.btnRound} min-h-11`}
              onClick={() => setReportOpen(true)}
              style={tajawal}
            >
              <Printer className="w-4 h-4" />
              طباعة تقرير التحضير 🖨️
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={`${ds.btnRound} min-h-11`}
              disabled={bulkBusy || loading || recordedCount === 0}
              onClick={() => setBulkConfirmOpen(true)}
              style={tajawal}
            >
              <Trash2 className="w-4 h-4" />
              إلغاء تحضير اليوم بالكامل
            </Button>
          </div>
        </div>

        <StaffAttendanceReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
        />

        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : filteredRows.length === 0 ? (
          <p className={ds.alert.info} style={tajawal}>
            لا يوجد منسوبون يطابقون البحث.
          </p>
        ) : (
          <Table className="border-collapse w-full">
            <TableHeader>
              <TableRow>
                <TableHead className={cellClass} style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className={cellClass} style={tajawal}>
                  الحالة
                </TableHead>
                <TableHead className={cellClass} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className={cellClass} style={tajawal}>
                    <p className="font-medium">{r.full_name_ar}</p>
                    <span className="text-sm text-gray-500 block mt-1">
                      {formatRole(r.role)}
                    </span>
                    {r.has_record && (
                      <span className="text-xs text-muted-foreground block">
                        مسجّل في قاعدة البيانات
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cellClass}>
                    <AttendanceStatusButtons
                      value={r.status}
                      disabled={rowBusy === r.user_id}
                      onChange={(st) =>
                        void applyStatus(r, st as AttendanceStatusValue)
                      }
                    />
                  </TableCell>
                  <TableCell className={cellClass}>
                    <TableIconAction
                      kind="delete"
                      label="حذف سجل اليوم"
                      disabled={rowBusy === r.user_id || !r.has_record}
                      onClick={() => void deleteRow(r)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DoubleConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="إلغاء تحضير اليوم بالكامل"
        description={`سيتم حذف جميع سجلات تحضير المنسوبين المحفوظة في تاريخ ${date}. لا يمكن التراجع.`}
        confirmLabel="حذف كل السجلات"
        destructive
        onConfirm={confirmBulkClear}
      />
    </div>
  );
}
