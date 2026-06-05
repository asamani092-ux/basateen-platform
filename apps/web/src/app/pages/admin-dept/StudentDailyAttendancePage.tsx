import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Printer, Save, Trash2 } from "lucide-react";
import { AttendanceDateFilter } from "../../components/attendance/AttendanceDateFilter";
import { AttendanceLedgerTable } from "../../components/attendance/AttendanceLedgerTable";
import { AttendanceMagicLinksModal } from "../../components/attendance/AttendanceMagicLinksModal";
import { StudentAttendanceReportModal } from "../../components/attendance/StudentAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api, type AdminTrackRow, type CircleOption } from "../../lib/api-client";
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

type EntityType = "circle" | "track";

export function StudentDailyAttendancePage() {
  const [dateMode, setDateMode] = useState<DateFilterMode>("day");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [entityType, setEntityType] = useState<EntityType>("circle");
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [entityName, setEntityName] = useState<string>("");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const ledgerView = isRangeMode(dateMode, startDate, endDate);
  const dirtyCount = countDirty(entries);
  const recordedCount = entries.filter((r) => r.has_record).length;

  useEffect(() => {
    if (!canUseApi()) {
      setLoadingGroups(false);
      return;
    }
    Promise.all([api.circles(), api.adminTracks()])
      .then(([cRes, tRes]) => {
        setCircles(cRes.items ?? []);
        setTracks(tRes.items ?? []);
      })
      .catch(() => {
        setCircles([]);
        setTracks([]);
      })
      .finally(() => setLoadingGroups(false));
  }, []);

  const loadEntries = useCallback(async () => {
    const id = Number(entityId);
    if (!canUseApi() || !Number.isFinite(id)) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (ledgerView) {
        const res = await api.adminAttendanceLedger({
          beneficiary_type: "student",
          start_date: startDate,
          end_date: endDate,
          circle_id: entityType === "circle" ? id : undefined,
          track_id: entityType === "track" ? id : undefined,
        });
        setEntries((res.items ?? []).map(mapLedgerItem));
      } else {
        const res =
          entityType === "circle"
            ? await api.adminDeptStudentAttendance(id, startDate)
            : await api.adminDeptTrackAttendance(id, startDate);
        setEntries(
          (res.items ?? []).map((r) => ({
            ...mapRosterItem(r),
            attendance_date: startDate,
          })),
        );
        if (entityType === "circle" && "circle" in res) {
          setEntityName(res.circle?.name_ar ?? "");
        } else if ("track" in res) {
          setEntityName(res.track?.name_ar ?? "");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل السجلات");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, startDate, endDate, ledgerView]);

  useEffect(() => {
    if (!entityId) {
      setEntries([]);
      setEntityName("");
      setError(null);
      return;
    }
    void loadEntries();
  }, [entityId, loadEntries]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  function switchEntityType(next: EntityType) {
    setEntityType(next);
    setEntityId("");
    setEntityName("");
    setEntries([]);
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
    const id = Number(entityId);
    if (!Number.isFinite(id) || dirtyCount === 0) return;
    setSaveBusy(true);
    setError(null);
    try {
      const records = buildBulkSaveRecords(entries, startDate, {
        circleId: entityType === "circle" ? id : undefined,
        trackId: entityType === "track" ? id : undefined,
      });
      const saved = await bulkSaveAttendance({
        beneficiaryType: "student",
        records,
      });
      setEntries((prev) => markEntriesSaved(prev));
      toastAttendanceBulkSaved(saved);
      bumpDashboard();
      await loadEntries();
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
        beneficiaryType: "student",
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
    const id = Number(entityId);
    if (!Number.isFinite(id)) return;
    setBulkBusy(true);
    setError(null);
    try {
      const ids = filteredRows
        .filter((r) => r.has_record && r.attendance_id != null)
        .map((r) => r.attendance_id as number);
      const deleted = await clearDisplayedAttendance({
        beneficiaryType: "student",
        startDate,
        endDate,
        circleId: entityType === "circle" ? id : undefined,
        trackId: entityType === "track" ? id : undefined,
        attendanceIds: ids.length > 0 ? ids : undefined,
      });
      toastAttendanceCleared(deleted);
      bumpDashboard();
      await loadEntries();
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

  const selectedCircle =
    entityType === "circle"
      ? circles.find((c) => String(c.id) === entityId)
      : undefined;
  const selectedTrack =
    entityType === "track"
      ? tracks.find((t) => String(t.id) === entityId)
      : undefined;

  const deleteLabel = ledgerView
    ? `حذف ${filteredRows.filter((r) => r.has_record).length} سجل معروض`
    : `حذف سجلات يوم ${startDate}`;

  return (
    <div className="space-y-4 max-w-[1600px] print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            تحضير الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            سجل تحضير مرن — يوم واحد أو نطاق زمني كامل مع تعديل وحذف جماعي.
          </p>
        </div>
        <Button
          type="button"
          className={`${ds.btnRound} w-full sm:w-auto min-h-11 shrink-0`}
          onClick={() => setLinksModalOpen(true)}
          style={tajawal}
        >
          <Link2 className="w-4 h-4" />
          إدارة روابط التحضير 🔗
        </Button>
      </div>

      <AttendanceMagicLinksModal
        open={linksModalOpen}
        onOpenChange={setLinksModalOpen}
        defaultEntityType={entityType}
        defaultCircleId={
          entityType === "circle" ? Number(entityId) || undefined : undefined
        }
        defaultCircleName={selectedCircle?.name_ar ?? entityName}
        defaultTrackId={
          entityType === "track" ? Number(entityId) || undefined : undefined
        }
        defaultTrackName={selectedTrack?.name_ar ?? entityName}
        circles={circles}
        tracks={tracks}
      />

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-4`}>
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={entityType === "circle" ? "default" : "outline"}
            className={ds.btnRound}
            onClick={() => switchEntityType("circle")}
            style={tajawal}
          >
            تحضير الحلقات
          </Button>
          <Button
            type="button"
            variant={entityType === "track" ? "default" : "outline"}
            className={ds.btnRound}
            onClick={() => switchEntityType("track")}
            style={tajawal}
          >
            تحضير المسارات
          </Button>
        </div>

        <div className="space-y-2">
          <Label style={tajawal}>
            {entityType === "circle" ? "الحلقة" : "المسار"}
          </Label>
          <Select
            value={entityId}
            onValueChange={setEntityId}
            disabled={loadingGroups}
          >
            <SelectTrigger className={ds.btnRound}>
              <SelectValue
                placeholder={
                  loadingGroups
                    ? "جاري التحميل…"
                    : entityType === "circle"
                      ? "اختر الحلقة"
                      : "اختر المسار"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {entityType === "circle"
                ? circles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name_ar}
                    </SelectItem>
                  ))
                : tracks.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name_ar}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!entityId ? (
        <p className={ds.alert.info} style={tajawal}>
          {entityType === "circle"
            ? "اختر حلقة لعرض سجلات التحضير."
            : "اختر مساراً لعرض سجلات التحضير."}
        </p>
      ) : (
        <>
          <AttendanceFilterBar
            nameQuery={nameQuery}
            onNameQueryChange={setNameQuery}
            groupLabel=""
            groupValue=""
            onGroupChange={() => {}}
            groupOptions={[]}
            shownCount={filteredRows.length}
            totalCount={entries.length}
            hiddenDirty={dirtyCount}
            hideGroupFilter
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
                {entityType === "circle" && !ledgerView && (
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
                )}
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

            {entityType === "circle" && (
              <StudentAttendanceReportModal
                open={reportOpen}
                onOpenChange={setReportOpen}
                defaultCircleId={Number(entityId) || undefined}
                circles={circles}
                loadingCircles={loadingGroups}
              />
            )}

            {loading ? (
              <p className="text-muted-foreground text-sm" style={tajawal}>
                جاري التحميل…
              </p>
            ) : filteredRows.length === 0 ? (
              <p className={ds.alert.info} style={tajawal}>
                {ledgerView
                  ? "لا توجد سجلات محفوظة في هذا النطاق."
                  : "لا يوجد طلاب يطابقون البحث."}
              </p>
            ) : (
              <AttendanceLedgerTable
                entries={filteredRows}
                showDateColumn={ledgerView}
                rowBusyKey={rowBusyKey}
                onStatusChange={handleStatusChange}
                onDelete={(entry) => void deleteRow(entry)}
              />
            )}
          </div>
        </>
      )}

      <DoubleConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="حذف السجلات المعروضة"
        description={`سيتم حذف جميع سجلات التحضير المعروضة حالياً لـ ${entityName || "هذا الكيان"} (${deleteLabel}). لا يمكن التراجع.`}
        confirmLabel="حذف السجلات"
        destructive
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
