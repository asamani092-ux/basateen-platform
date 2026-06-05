import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Save, Trash2 } from "lucide-react";
import { AttendanceDateFilter } from "../../components/attendance/AttendanceDateFilter";
import { AttendanceLedgerTable } from "../../components/attendance/AttendanceLedgerTable";
import { StaffAttendanceReportModal } from "../../components/attendance/StaffAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { matchesArabicName } from "../../lib/attendance-search";
import {
  buildBulkSaveRecords,
  countDirty,
  isRangeMode,
  mapLedgerItem,
  mapRosterItem,
  markEntriesSaved,
  patchEntryStatus,
  removeEntry,
  resetEntryAfterDelete,
  todayIso,
  type DateFilterMode,
  type LedgerEntry,
} from "../../lib/attendance-ledger";
import {
  bulkSaveAttendance,
  clearDisplayedAttendance,
  removeAttendanceRecord,
  toastAttendanceBulkSaved,
  toastAttendanceCleared,
  toastAttendanceDeleted,
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

export function StaffAttendancePage() {
  const [dateMode, setDateMode] = useState<DateFilterMode>("day");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const ledgerView = isRangeMode(dateMode, startDate, endDate);
  const dirtyCount = countDirty(entries);
  const recordedCount = entries.filter((r) => r.has_record).length;

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (ledgerView) {
        const res = await api.adminAttendanceLedger({
          beneficiary_type: "staff",
          start_date: startDate,
          end_date: endDate,
        });
        setEntries(
          (res.items ?? []).map((r) => ({
            ...mapLedgerItem(r),
            role: formatRole(r.role),
          })),
        );
      } else {
        const res = await api.adminDeptStaff(startDate);
        setEntries(
          res.items.map((r) => ({
            ...mapRosterItem({
              user_id: r.user_id,
              full_name_ar: r.full_name_ar,
              status: r.status,
              attendance_id: r.attendance_id,
              has_record: r.has_record,
              role: formatRole(r.role),
            }),
            attendance_date: startDate,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, ledgerView]);

  useEffect(() => {
    void load();
  }, [load]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  function handleModeChange(mode: DateFilterMode) {
    setDateMode(mode);
    if (mode === "day") {
      setEndDate(startDate);
    }
  }

  function handleStatusChange(entry: LedgerEntry, status: AttendanceStatusValue) {
    setEntries((prev) => patchEntryStatus(prev, entry.rowKey, status));
  }

  async function saveDirtyRows() {
    if (dirtyCount === 0) return;
    setSaveBusy(true);
    setError(null);
    try {
      const records = buildBulkSaveRecords(entries, startDate);
      const saved = await bulkSaveAttendance({
        beneficiaryType: "staff",
        records,
      });
      setEntries((prev) => markEntriesSaved(prev));
      toastAttendanceBulkSaved(saved);
      bumpDashboard();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التعديلات");
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteRow(entry: LedgerEntry) {
    if (entry.attendance_id == null) return;
    setRowBusyKey(entry.rowKey);
    setError(null);
    try {
      await removeAttendanceRecord({
        beneficiaryType: "staff",
        attendanceId: entry.attendance_id,
      });
      setEntries((prev) =>
        ledgerView
          ? removeEntry(prev, entry.rowKey)
          : resetEntryAfterDelete(prev, entry.rowKey),
      );
      toastAttendanceDeleted();
      bumpDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف السجل");
    } finally {
      setRowBusyKey(null);
    }
  }

  async function confirmBulkDelete() {
    setBulkBusy(true);
    setError(null);
    try {
      const ids = filteredRows
        .filter((r) => r.has_record && r.attendance_id != null)
        .map((r) => r.attendance_id as number);
      const deleted = await clearDisplayedAttendance({
        beneficiaryType: "staff",
        startDate,
        endDate,
        attendanceIds: ids.length > 0 ? ids : undefined,
      });
      toastAttendanceCleared(deleted);
      bumpDashboard();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف السجلات");
    } finally {
      setBulkBusy(false);
      setBulkConfirmOpen(false);
    }
  }

  const filteredRows = useMemo(
    () =>
      entries.filter((r) => matchesArabicName(nameQuery, r.full_name_ar)),
    [entries, nameQuery],
  );

  const deleteDesc = ledgerView
    ? `من ${startDate} إلى ${endDate}`
    : `ليوم ${startDate}`;

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          تحضير المنسوبين
        </h2>
        <p className={ds.page.description} style={tajawal}>
          سجل تحضير مرن — استعراض وتعديل وحذف فردي أو جماعي لأي نطاق زمني.
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-3`}>
        <AttendanceDateFilter
          mode={dateMode}
          onModeChange={handleModeChange}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        {ledgerView && (
          <p className={ds.alert.info} style={tajawal}>
            وضع السجل التاريخي — يعرض السجلات المحفوظة من {startDate} إلى {endDate}.
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
        totalCount={entries.length}
        hiddenDirty={dirtyCount}
      />

      <div className={`${ds.card} p-4 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground" style={tajawal}>
            {recordedCount} سجل محفوظ
            {dirtyCount > 0 ? ` — ${dirtyCount} تغيير بانتظار الحفظ` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              className={`${ds.btnRound} min-h-11`}
              disabled={saveBusy || dirtyCount === 0}
              onClick={() => void saveDirtyRows()}
              style={tajawal}
            >
              <Save className="w-4 h-4" />
              تحديث السجلات المحددة
            </Button>
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
              disabled={
                bulkBusy ||
                loading ||
                filteredRows.filter((r) => r.has_record).length === 0
              }
              onClick={() => setBulkConfirmOpen(true)}
              style={tajawal}
            >
              <Trash2 className="w-4 h-4" />
              حذف السجلات المعروضة
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
            {ledgerView
              ? "لا توجد سجلات محفوظة في هذا النطاق."
              : "لا يوجد منسوبون يطابقون البحث."}
          </p>
        ) : (
          <AttendanceLedgerTable
            entries={filteredRows}
            showDateColumn={ledgerView}
            showRole
            rowBusyKey={rowBusyKey}
            onStatusChange={handleStatusChange}
            onDelete={(entry) => void deleteRow(entry)}
          />
        )}
      </div>

      <DoubleConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="حذف السجلات المعروضة"
        description={`سيتم حذف جميع سجلات التحضير المعروضة حالياً (${deleteDesc}). لا يمكن التراجع.`}
        confirmLabel="حذف السجلات"
        destructive
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
