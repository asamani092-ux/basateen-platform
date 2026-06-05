import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, Printer } from "lucide-react";
import { AttendanceMagicLinksModal } from "../../components/attendance/AttendanceMagicLinksModal";
import { StudentAttendanceReportModal } from "../../components/attendance/StudentAttendanceReportModal";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { AttendanceStatusButtons } from "../../components/attendance/AttendanceStatusButtons";
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
import { api, type AdminTrackRow, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  status: string;
};

type EntityType = "circle" | "track";

/**
 * تحضير الطلاب اليومي — دعم مزدوج للحلقات والمسارات.
 */
export function StudentDailyAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entityType, setEntityType] = useState<EntityType>("circle");
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [entityName, setEntityName] = useState<string>("");
  const [attendanceData, setAttendanceData] = useState<StudentRow[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const cellClass = "text-right px-4 py-3";
  const actionCellClass = `${cellClass} whitespace-nowrap`;

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
      }));
      setAttendanceData(items);
      const base: Record<number, string> = {};
      for (const r of items) base[r.student_id] = r.status;
      setBaseline(base);
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
      setBaseline({});
      setEntityName("");
      setError(null);
      return;
    }
    loadStudents();
  }, [entityId, loadStudents]);

  function switchEntityType(next: EntityType) {
    setEntityType(next);
    setEntityId("");
    setEntityName("");
    setAttendanceData([]);
    setBaseline({});
  }

  function setStatus(studentId: number, status: string) {
    setAttendanceData((prev) =>
      prev.map((r) =>
        r.student_id === studentId ? { ...r, status } : r,
      ),
    );
  }

  const filteredRows = useMemo(
    () =>
      attendanceData.filter((r) =>
        matchesArabicName(nameQuery, r.full_name_ar),
      ),
    [attendanceData, nameQuery],
  );

  const dirtyCount = useMemo(
    () =>
      attendanceData.filter(
        (r) => (baseline[r.student_id] ?? "present") !== r.status,
      ).length,
    [attendanceData, baseline],
  );

  async function commit() {
    const id = Number(entityId);
    if (!Number.isFinite(id) || attendanceData.length === 0) return;

    setCommitting(true);
    setError(null);
    try {
      await api.adminDeptSaveStudentAttendance({
        ...(entityType === "circle"
          ? { circle_id: id }
          : { track_id: id }),
        attendance_date: date,
        records: attendanceData.map((r) => ({
          student_id: r.student_id,
          status: r.status,
        })),
      });
      const base: Record<number, string> = {};
      for (const r of attendanceData) base[r.student_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التحضير");
    } finally {
      setCommitting(false);
    }
  }

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
            اختر حلقة أو مساراً وسجّل الحضور — الحالة الافتراضية «حاضر» في الواجهة
            فقط حتى تضغط «اعتماد حفظ التحضير».
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
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
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
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
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {entityType === "circle" && (
                  <Button
                    type="button"
                    variant="outline"
                    className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
                    onClick={() => setReportOpen(true)}
                    style={tajawal}
                  >
                    <Printer className="w-4 h-4" />
                    طباعة تقرير التحضير 🖨️
                  </Button>
                )}
                <Button
                  type="button"
                  className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
                  disabled={committing || loading}
                  onClick={commit}
                  style={tajawal}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {committing ? "جاري الاعتماد…" : "اعتماد حفظ التحضير 💾"}
                  {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.student_id}>
                      <TableCell className={cellClass} style={tajawal}>
                        <p className="font-medium">{r.full_name_ar}</p>
                      </TableCell>
                      <TableCell className={actionCellClass}>
                        <AttendanceStatusButtons
                          value={r.status}
                          disabled={committing}
                          onChange={(st) => setStatus(r.student_id, st)}
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
    </div>
  );
}
