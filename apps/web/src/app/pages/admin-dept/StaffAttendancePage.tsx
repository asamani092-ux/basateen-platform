import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { AttendanceDailyTable } from "../../components/attendance/AttendanceDailyTable";
import { AttendanceHistoryModal } from "../../components/attendance/AttendanceHistoryModal";
import { RetroactiveAttendanceAccordion } from "../../components/attendance/RetroactiveAttendanceAccordion";
import { StaffAttendanceReportModal } from "../../components/attendance/StaffAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
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
};

export function StaffAttendancePage() {
  const [date, setDate] = useState(todayIso);
  const [retroStart, setRetroStart] = useState(todayIso);
  const [retroEnd, setRetroEnd] = useState(todayIso);
  const [rows, setRows] = useState<Row[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const dirtyCount = useMemo(
    () => rows.filter((r) => (baseline[r.user_id] ?? "present") !== r.status).length,
    [rows, baseline],
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
      const res = await api.adminDeptStaff(date);
      const items: Row[] = res.items.map((r) => ({
        user_id: r.user_id,
        full_name_ar: r.full_name_ar,
        role: r.role ?? null,
        status: normalizeAttendanceStatus(r.status ?? "present"),
      }));
      setRows(items);
      const base: Record<number, string> = {};
      for (const r of items) base[r.user_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setRows([]);
      setBaseline({});
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

  function pickStatus(userId: number, status: string) {
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, status } : r)),
    );
  }

  async function commitAttendance() {
    if (rows.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await api.adminDeptSaveStaffAttendance({
        attendance_date: date,
        records: rows.map((r) => ({
          user_id: r.user_id,
          status: r.status,
        })),
      });
      const base: Record<number, string> = {};
      for (const r of rows) base[r.user_id] = r.status;
      setBaseline(base);
      toastAttendanceBulkSaved(res.saved);
      bumpDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل اعتماد التحضير");
    } finally {
      setCommitting(false);
    }
  }

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesArabicName(nameQuery, r.full_name_ar)),
    [rows, nameQuery],
  );

  const dailyTableRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        id: r.user_id,
        full_name_ar: r.full_name_ar,
        subtitle: formatRole(r.role),
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
        totalCount={rows.length}
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
          <AttendanceDailyTable
            rows={dailyTableRows}
            disabled={committing}
            onStatusChange={pickStatus}
          />
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
