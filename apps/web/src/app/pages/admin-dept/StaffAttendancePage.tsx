import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { AttendanceDailyTable } from "../../components/attendance/AttendanceDailyTable";
import { AttendanceHistoryModal } from "../../components/attendance/AttendanceHistoryModal";
import { RetroactiveAttendanceAccordion } from "../../components/attendance/RetroactiveAttendanceAccordion";
import { StaffAttendanceReportModal } from "../../components/attendance/StaffAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import {
  TablePagination,
  type PageInfo,
} from "../../components/shared/TablePagination";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { todayIso } from "../../lib/attendance-ledger";
import { toastAttendanceBulkSaved } from "../../lib/attendance-mutations";
import { ds, tajawal } from "../../lib/design-system";
import { staffRoleLabel } from "../../lib/staff-role-label";

type Row = {
  user_id: number;
  full_name_ar: string;
  role: string | null;
  status: string;
};

export function StaffAttendancePage() {
  const [date, setDate] = useState(todayIso);
  const [retroStart, setRetroStart] = useState(todayIso);
  const [retroEnd, setRetroEnd] = useState(todayIso);
  const [rows, setRows] = useState<Row[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const dirtyCount = useMemo(
    () => Object.keys(statusMap).length,
    [statusMap],
  );

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStaff(date, page);
      const items: Row[] = res.items.map((r) => ({
        user_id: r.user_id,
        full_name_ar: r.full_name_ar,
        role: r.role ?? null,
        status: normalizeAttendanceStatus(r.status ?? "present"),
      }));
      setRows(items);
      setPageInfo(res.page ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setRows([]);
      setPageInfo(null);
    } finally {
      setLoading(false);
    }
  }, [date, page]);

  useEffect(() => {
    setPage(1);
    setStatusMap({});
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  function pickStatus(userId: number, status: string) {
    setStatusMap((prev) => ({ ...prev, [userId]: status }));
  }

  async function commitAttendance() {
    if (!pageInfo && rows.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const records: Array<{ user_id: number; status: string }> = [];
      let p = 1;
      let hasNext = true;
      while (hasNext) {
        const res = await api.adminDeptStaff(date, p);
        for (const r of res.items) {
          records.push({
            user_id: r.user_id,
            status: normalizeAttendanceStatus(
              statusMap[r.user_id] ?? r.status ?? "present",
            ),
          });
        }
        hasNext = res.page?.has_next ?? false;
        p += 1;
      }
      const saveRes = await api.adminDeptSaveStaffAttendance({
        attendance_date: date,
        records,
      });
      setStatusMap({});
      toastAttendanceBulkSaved(saveRes.saved);
      bumpDashboard();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل اعتماد التحضير");
    } finally {
      setCommitting(false);
    }
  }

  const displayRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        status: normalizeAttendanceStatus(statusMap[r.user_id] ?? r.status),
      })),
    [rows, statusMap],
  );

  const filteredRows = useMemo(
    () => displayRows.filter((r) => matchesArabicName(nameQuery, r.full_name_ar)),
    [displayRows, nameQuery],
  );

  const dailyTableRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        id: r.user_id,
        full_name_ar: r.full_name_ar,
        subtitle: staffRoleLabel(r.role),
        status: r.status,
      })),
    [filteredRows],
  );

  return (
    <div className="space-y-4 max-w-[1600px] pb-24">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          تحضير المنسوبين
        </h2>
        <p className={ds.page.description} style={tajawal}>
          سجّل تحضير اليوم للمنسوبين — التعديلات التاريخية عبر السجل المنزلق
          أعلاه.
        </p>
      </div>

      <RetroactiveAttendanceAccordion
        startDate={retroStart}
        endDate={retroEnd}
        onStartDateChange={setRetroStart}
        onEndDateChange={setRetroEnd}
        onViewLedger={() => setHistoryOpen(true)}
      />

      <AttendanceHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        beneficiaryType="staff"
        startDate={retroStart}
        endDate={retroEnd}
        onSaved={bumpDashboard}
      />

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground" style={tajawal}>
              تاريخ التحضير
            </Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`block w-full mt-1 border border-border px-3 py-2 ${ds.btnRound}`}
            />
          </div>
          <div className="flex items-end justify-end">
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
          </div>
        </div>
        <StaffAttendanceReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
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
        totalCount={pageInfo?.total ?? rows.length}
        hiddenDirty={0}
      />

      <div className={`${ds.card} p-4`}>
        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : filteredRows.length === 0 ? (
          <p className={ds.alert.info} style={tajawal}>
            لا يوجد منسوبون يطابقون البحث.
          </p>
        ) : (
          <>
            <AttendanceDailyTable
              rows={dailyTableRows}
              disabled={committing}
              onStatusChange={pickStatus}
            />
            {pageInfo && (
              <TablePagination
                page={pageInfo}
                onPageChange={setPage}
                className="print:hidden"
              />
            )}
          </>
        )}
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-[1600px] mx-auto flex justify-end">
            <Button
              type="button"
              size="lg"
              className={`${ds.btnRound} w-full sm:w-auto min-h-12 px-8`}
              disabled={committing}
              onClick={() => void commitAttendance()}
              style={tajawal}
            >
              <CheckCircle2 className="w-5 h-5" />
              {committing ? "جاري الاعتماد…" : "اعتماد التحضير"}
              {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
