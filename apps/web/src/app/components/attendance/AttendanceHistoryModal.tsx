import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AttendanceLedgerTable } from "./AttendanceLedgerTable";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import {
  buildBulkSaveRecords,
  countDirty,
  mapLedgerItem,
  matchesLedgerSearch,
  patchEntryStatus,
  removeEntry,
  type LedgerEntry,
} from "../../lib/attendance-ledger";
import {
  bulkSaveAttendance,
  removeAttendanceRecord,
  toastAttendanceBulkSaved,
  toastAttendanceDeleted,
  type AttendanceStatusValue,
  type BeneficiaryType,
} from "../../lib/attendance-mutations";
import { ds, tajawal } from "../../lib/design-system";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beneficiaryType: BeneficiaryType;
  startDate: string;
  endDate: string;
  onSaved?: () => void;
};

export function AttendanceHistoryModal({
  open,
  onOpenChange,
  beneficiaryType,
  startDate,
  endDate,
  onSaved,
}: Props) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dirtyCount = countDirty(entries);
  const isStudent = beneficiaryType === "student";

  const loadLedger = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminAttendanceLedger({
        beneficiary_type: beneficiaryType,
        start_date: startDate,
        end_date: endDate,
      });
      setEntries((res.items ?? []).map(mapLedgerItem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل السجل");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [beneficiaryType, startDate, endDate]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setEntries([]);
      setError(null);
      return;
    }
    void loadLedger();
  }, [open, loadLedger]);

  const filteredEntries = useMemo(
    () =>
      isStudent
        ? entries.filter((e) => matchesLedgerSearch(e, searchQuery))
        : entries.filter((e) => matchesLedgerSearch(e, searchQuery)),
    [entries, searchQuery, isStudent],
  );

  function handleStatusChange(entry: LedgerEntry, status: AttendanceStatusValue) {
    setEntries((prev) => patchEntryStatus(prev, entry.rowKey, status));
  }

  async function deleteRow(entry: LedgerEntry) {
    if (entry.attendance_id == null) return;
    setRowBusyKey(entry.rowKey);
    setError(null);
    try {
      await removeAttendanceRecord({
        beneficiaryType,
        attendanceId: entry.attendance_id,
      });
      setEntries((prev) => removeEntry(prev, entry.rowKey));
      toastAttendanceDeleted();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف السجل");
    } finally {
      setRowBusyKey(null);
    }
  }

  async function saveChanges() {
    if (dirtyCount === 0) return;
    setSaveBusy(true);
    setError(null);
    try {
      const records = buildBulkSaveRecords(entries, startDate);
      const saved = await bulkSaveAttendance({ beneficiaryType, records });
      toastAttendanceBulkSaved(saved);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التعديلات");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${ds.dialog} sm:max-w-4xl max-h-[90vh] flex flex-col`}
        dir="rtl"
      >
        <DialogHeader className="text-right shrink-0">
          <DialogTitle style={tajawal}>سجل التحضير التاريخي</DialogTitle>
          <DialogDescription style={tajawal}>
            من {startDate} إلى {endDate} — عدّل الحالات ثم احفظ التعديلات.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className={`${ds.alert.error} shrink-0`} style={tajawal}>
            {error}
          </p>
        )}

        {isStudent && (
          <div className="relative shrink-0">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="بحث بالاسم، الحلقة، أو المسار…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${ds.btnRound} pr-10`}
              style={tajawal}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          {loading ? (
            <p className="text-muted-foreground text-sm py-8 text-center" style={tajawal}>
              جاري تحميل السجل…
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className={`${ds.alert.info} py-6 text-center`} style={tajawal}>
              لا توجد سجلات في هذا النطاق.
            </p>
          ) : (
            <AttendanceLedgerTable
              entries={filteredEntries}
              showDateColumn
              showRole={!isStudent}
              showPlacement={isStudent}
              rowBusyKey={rowBusyKey}
              onStatusChange={handleStatusChange}
              onDelete={(entry) => void deleteRow(entry)}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className={ds.btnRound}
            onClick={() => onOpenChange(false)}
            style={tajawal}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            className={ds.btnRound}
            disabled={saveBusy || dirtyCount === 0}
            onClick={() => void saveChanges()}
            style={tajawal}
          >
            <Save className="w-4 h-4" />
            {saveBusy ? "جاري الحفظ…" : `حفظ التعديلات${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
