import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Printer } from "lucide-react";
import {
  AttendanceEntityCombobox,
  type AttendanceEntityOption,
} from "../../components/attendance/AttendanceEntityCombobox";
import { AttendanceDailyTable } from "../../components/attendance/AttendanceDailyTable";
import { AttendanceHistoryModal } from "../../components/attendance/AttendanceHistoryModal";
import { AttendanceMagicLinksModal } from "../../components/attendance/AttendanceMagicLinksModal";
import { RetroactiveAttendanceAccordion } from "../../components/attendance/RetroactiveAttendanceAccordion";
import { StudentAttendanceReportModal } from "../../components/attendance/StudentAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import {
  TablePagination,
  type PageInfo,
} from "../../components/shared/TablePagination";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api, type AdminTrackRow, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { todayIso } from "../../lib/attendance-ledger";
import { toastAttendanceBulkSaved } from "../../lib/attendance-mutations";
import { ds, tajawal } from "../../lib/design-system";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  status: string;
};

export function StudentDailyAttendancePage() {
  const [date, setDate] = useState(todayIso);
  const [retroStart, setRetroStart] = useState(todayIso);
  const [retroEnd, setRetroEnd] = useState(todayIso);
  const [entity, setEntity] = useState<AttendanceEntityOption | null>(null);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const dirtyCount = useMemo(() => Object.keys(statusMap).length, [statusMap]);

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

  const loadStudents = useCallback(async () => {
    if (!entity || !canUseApi()) {
      setRows([]);
      setPageInfo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res =
        entity.type === "circle"
          ? await api.adminDeptStudentAttendance(entity.id, date, page)
          : await api.adminDeptTrackAttendance(entity.id, date, page);
      const items: StudentRow[] = (res.items ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: normalizeAttendanceStatus(r.status ?? "present"),
      }));
      setRows(items);
      setPageInfo(res.page ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setRows([]);
      setPageInfo(null);
    } finally {
      setLoading(false);
    }
  }, [entity, date, page]);

  useEffect(() => {
    setPage(1);
    setStatusMap({});
  }, [entity, date]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  function pickStatus(studentId: number, status: string) {
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  }

  async function commitAttendance() {
    if (!entity) return;
    setCommitting(true);
    setError(null);
    try {
      const records: Array<{ student_id: number; status: string }> = [];
      let p = 1;
      let hasNext = true;
      while (hasNext) {
        const res =
          entity.type === "circle"
            ? await api.adminDeptStudentAttendance(entity.id, date, p)
            : await api.adminDeptTrackAttendance(entity.id, date, p);
        for (const r of res.items ?? []) {
          records.push({
            student_id: r.student_id,
            status: normalizeAttendanceStatus(
              statusMap[r.student_id] ?? r.status ?? "present",
            ),
          });
        }
        hasNext = res.page?.has_next ?? false;
        p += 1;
      }
      const res = await api.adminDeptSaveStudentAttendance({
        attendance_date: date,
        circle_id: entity.type === "circle" ? entity.id : undefined,
        track_id: entity.type === "track" ? entity.id : undefined,
        records,
      });
      setStatusMap({});
      toastAttendanceBulkSaved(res.saved);
      bumpDashboard();
      await loadStudents();
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
        status: normalizeAttendanceStatus(statusMap[r.student_id] ?? r.status),
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
        id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: r.status,
      })),
    [filteredRows],
  );

  return (
    <div className="space-y-4 max-w-[1600px] print:hidden pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            تحضير الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            اختر الحلقة أو المسار وسجّل تحضير اليوم — التعديلات التاريخية في
            السجل المنزلق أعلاه.
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
        beneficiaryType="student"
        startDate={retroStart}
        endDate={retroEnd}
        onSaved={bumpDashboard}
      />

      <AttendanceMagicLinksModal
        open={linksModalOpen}
        onOpenChange={setLinksModalOpen}
        defaultEntityType={entity?.type ?? "circle"}
        defaultCircleId={entity?.type === "circle" ? entity.id : undefined}
        defaultCircleName={entity?.type === "circle" ? entity.name_ar : undefined}
        defaultTrackId={entity?.type === "track" ? entity.id : undefined}
        defaultTrackName={entity?.type === "track" ? entity.name_ar : undefined}
        circles={circles}
        tracks={tracks}
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
          <div>
            <Label style={tajawal}>الحلقة / المسار</Label>
            <div className="mt-1">
              <AttendanceEntityCombobox
                value={entity}
                onChange={setEntity}
                circles={circles}
                tracks={tracks}
              />
            </div>
          </div>
        </div>

        {entity?.type === "circle" && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => setReportOpen(true)}
              style={tajawal}
            >
              <Printer className="w-4 h-4" />
              طباعة تقرير التحضير 🖨️
            </Button>
            <StudentAttendanceReportModal
              open={reportOpen}
              onOpenChange={setReportOpen}
              defaultCircleId={entity.id}
              circles={circles}
              loadingCircles={loadingGroups}
            />
          </div>
        )}
      </div>

      {!entity ? (
        <p className={ds.alert.info} style={tajawal}>
          اختر حلقة أو مساراً لعرض قائمة الطلاب.
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
            totalCount={pageInfo?.total ?? rows.length}
            hiddenDirty={0}
            hideGroupFilter
          />

          <div className={`${ds.card} p-4`}>
            {loading ? (
              <p className="text-muted-foreground text-sm" style={tajawal}>
                جاري التحميل…
              </p>
            ) : filteredRows.length === 0 ? (
              <p className={ds.alert.info} style={tajawal}>
                لا يوجد طلاب يطابقون البحث.
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
        </>
      )}

      {entity && !loading && (pageInfo?.total ?? filteredRows.length) > 0 && (
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
