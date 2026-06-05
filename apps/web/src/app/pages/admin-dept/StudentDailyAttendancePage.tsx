import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Printer, Trash2 } from "lucide-react";
import { AttendanceMagicLinksModal } from "../../components/attendance/AttendanceMagicLinksModal";
import { StudentAttendanceReportModal } from "../../components/attendance/StudentAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { AttendanceStatusButtons } from "../../components/attendance/AttendanceStatusButtons";
import { TableIconAction } from "../../components/admin/TableIconAction";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useAdminDataSyncContext } from "../../context/AdminDataSyncContext";
import { api, type AdminTrackRow, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
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

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  status: string;
  attendance_id: number | null;
  has_record: boolean;
};

type EntityType = "circle" | "track";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StudentDailyAttendancePage() {
  const [date, setDate] = useState(todayIso);
  const [entityType, setEntityType] = useState<EntityType>("circle");
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [entityName, setEntityName] = useState<string>("");
  const [attendanceData, setAttendanceData] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const { invalidate } = useAdminDataSyncContext();

  const cellClass = "text-right px-4 py-3";
  const actionCellClass = `${cellClass} whitespace-nowrap`;
  const isRetroDate = date !== todayIso();
  const recordedCount = attendanceData.filter((r) => r.has_record).length;

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
    const id = Number(entityId);
    if (!canUseApi() || !Number.isFinite(id)) {
      setAttendanceData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res =
        entityType === "circle"
          ? await api.adminDeptStudentAttendance(id, date)
          : await api.adminDeptTrackAttendance(id, date);
      const items: StudentRow[] = (res.items ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: normalizeAttendanceStatus(r.status ?? "present"),
        attendance_id: r.attendance_id ?? null,
        has_record: Boolean(r.has_record),
      }));
      setAttendanceData(items);
      if (entityType === "circle" && "circle" in res) {
        setEntityName(res.circle?.name_ar ?? "");
      } else if ("track" in res) {
        setEntityName(res.track?.name_ar ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setAttendanceData([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, date]);

  useEffect(() => {
    if (!entityId) {
      setAttendanceData([]);
      setEntityName("");
      setError(null);
      return;
    }
    void loadStudents();
  }, [entityId, loadStudents]);

  function bumpDashboard() {
    invalidate("dashboard");
  }

  function switchEntityType(next: EntityType) {
    setEntityType(next);
    setEntityId("");
    setEntityName("");
    setAttendanceData([]);
  }

  async function applyStatus(row: StudentRow, status: AttendanceStatusValue) {
    const id = Number(entityId);
    if (!Number.isFinite(id)) return;
    setRowBusy(row.student_id);
    setError(null);
    setAttendanceData((prev) =>
      prev.map((r) =>
        r.student_id === row.student_id ? { ...r, status } : r,
      ),
    );
    try {
      const result = await mutateAttendanceStatus({
        beneficiaryType: "student",
        personId: row.student_id,
        attendanceId: row.attendance_id,
        hasRecord: row.has_record,
        date,
        status,
        circleId: entityType === "circle" ? id : undefined,
        trackId: entityType === "track" ? id : undefined,
      });
      setAttendanceData((prev) =>
        prev.map((r) =>
          r.student_id === row.student_id
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
      void loadStudents();
    } finally {
      setRowBusy(null);
    }
  }

  async function deleteRow(row: StudentRow) {
    if (row.attendance_id == null) return;
    setRowBusy(row.student_id);
    setError(null);
    try {
      await removeAttendanceRecord({
        beneficiaryType: "student",
        attendanceId: row.attendance_id,
      });
      setAttendanceData((prev) =>
        prev.map((r) =>
          r.student_id === row.student_id
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
    const id = Number(entityId);
    if (!Number.isFinite(id)) return;
    setBulkBusy(true);
    setError(null);
    try {
      const deleted = await clearAttendanceDay({
        beneficiaryType: "student",
        date,
        circleId: entityType === "circle" ? id : undefined,
        trackId: entityType === "track" ? id : undefined,
      });
      toastAttendanceCleared(deleted);
      bumpDashboard();
      await loadStudents();
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

  const selectedCircle =
    entityType === "circle"
      ? circles.find((c) => String(c.id) === entityId)
      : undefined;
  const selectedTrack =
    entityType === "track"
      ? tracks.find((t) => String(t.id) === entityId)
      : undefined;

  return (
    <div className="space-y-4 max-w-[1600px] print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            تحضير الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            اختر التاريخ والحلقة أو المسار — كل تغيير يُحفظ فوراً في قاعدة
            البيانات (تعديل بأثر رجعي).
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>

        {isRetroDate && (
          <p className={ds.alert.info} style={tajawal}>
            وضع التعديل بأثر رجعي — تعرض السجلات المحفوظة ليوم {date} فقط.
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
            ? "اختر حلقة لعرض قائمة الطلاب."
            : "اختر مساراً لعرض قائمة الطلاب."}
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
            totalCount={attendanceData.length}
            hiddenDirty={0}
            hideGroupFilter
          />

          <div className={`${ds.card} p-4 space-y-4`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground" style={tajawal}>
                {recordedCount} سجل محفوظ من {attendanceData.length} طالب
              </p>
              <div className="flex flex-wrap gap-2">
                {entityType === "circle" && (
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
                  disabled={bulkBusy || loading || recordedCount === 0}
                  onClick={() => setBulkConfirmOpen(true)}
                  style={tajawal}
                >
                  <Trash2 className="w-4 h-4" />
                  إلغاء تحضير اليوم بالكامل
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
                لا يوجد طلاب يطابقون البحث.
              </p>
            ) : (
              <Table className="w-full border-collapse">
                <TableHeader>
                  <TableRow>
                    <TableHead className={cellClass} style={tajawal}>
                      الاسم
                    </TableHead>
                    <TableHead className={actionCellClass} style={tajawal}>
                      الحالة
                    </TableHead>
                    <TableHead className={actionCellClass} style={tajawal}>
                      إجراء
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.student_id}>
                      <TableCell className={cellClass} style={tajawal}>
                        <p className="font-medium">{r.full_name_ar}</p>
                        {r.has_record && (
                          <span className="text-xs text-muted-foreground">
                            مسجّل في قاعدة البيانات
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={actionCellClass}>
                        <AttendanceStatusButtons
                          value={r.status}
                          disabled={rowBusy === r.student_id}
                          onChange={(st) =>
                            void applyStatus(r, st as AttendanceStatusValue)
                          }
                        />
                      </TableCell>
                      <TableCell className={actionCellClass}>
                        <TableIconAction
                          kind="delete"
                          label="حذف سجل اليوم"
                          disabled={
                            rowBusy === r.student_id || !r.has_record
                          }
                          onClick={() => void deleteRow(r)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      <DoubleConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title="إلغاء تحضير اليوم بالكامل"
        description={`سيتم حذف جميع سجلات التحضير المحفوظة لـ ${entityName || "هذا الكيان"} في تاريخ ${date}. لا يمكن التراجع.`}
        confirmLabel="حذف كل السجلات"
        destructive
        onConfirm={confirmBulkClear}
      />
    </div>
  );
}
