import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { AttendanceMagicLinksModal } from "../../components/attendance/AttendanceMagicLinksModal";
import { AttendanceStatusGrid } from "../../components/attendance/AttendanceStatusGrid";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { api, type CircleOption } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  status: string;
};

/**
 * تحضير الطلاب اليومي + روابط التحضير — design-system (system_D) + ui.
 */
export function StudentDailyAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [circleId, setCircleId] = useState<string>("");
  const [circleName, setCircleName] = useState<string>("");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [linksModalOpen, setLinksModalOpen] = useState(false);

  useEffect(() => {
    if (!canUseApi()) {
      setLoadingCircles(false);
      return;
    }
    api
      .circles()
      .then((res) => setCircles(res.items ?? []))
      .catch(() => setCircles([]))
      .finally(() => setLoadingCircles(false));
  }, []);

  const loadStudents = useCallback(async () => {
    const cid = Number(circleId);
    if (!canUseApi() || !Number.isFinite(cid)) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDeptStudentAttendance(cid, date);
      const items = (res.items ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: normalizeAttendanceStatus(r.status),
      }));
      setRows(items);
      const base: Record<number, string> = {};
      for (const r of items) base[r.student_id] = r.status;
      setBaseline(base);
      setCircleName(res.circle?.name_ar ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [circleId, date]);

  useEffect(() => {
    if (!circleId) {
      setRows([]);
      setBaseline({});
      setCircleName("");
      setError(null);
      return;
    }
    loadStudents();
  }, [circleId, loadStudents]);

  function pickStatus(studentId: number, status: string) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)),
    );
  }

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesArabicName(nameQuery, r.full_name_ar)),
    [rows, nameQuery],
  );

  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        id: r.student_id,
        title: r.full_name_ar,
        status: r.status,
      })),
    [rows],
  );

  const visibleGridRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        id: r.student_id,
        title: r.full_name_ar,
        status: r.status,
      })),
    [filteredRows],
  );

  async function commit() {
    const cid = Number(circleId);
    if (!Number.isFinite(cid)) return;
    const changed = rows.filter(
      (r) => (baseline[r.student_id] ?? "present") !== r.status,
    );
    if (changed.length === 0) return;

    setCommitting(true);
    setError(null);
    try {
      await api.adminDeptSaveStudentAttendance({
        circle_id: cid,
        attendance_date: date,
        records: changed.map((r) => ({
          student_id: r.student_id,
          status: r.status,
        })),
      });
      const base: Record<number, string> = {};
      for (const r of rows) base[r.student_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التحضير");
    } finally {
      setCommitting(false);
    }
  }

  const selectedCircle = circles.find((c) => String(c.id) === circleId);

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            تحضير الطلاب
          </h2>
          <p className={ds.page.description} style={tajawal}>
            اختر الحلقة وسجّل الحضور — التغييرات تُحفظ عند الاعتماد فقط. الروابط
            السحرية تعرض يوم اليوم تلقائياً.
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
        defaultCircleId={Number(circleId) || undefined}
        defaultCircleName={selectedCircle?.name_ar ?? circleName}
      />

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label style={tajawal}>الحلقة</Label>
            <Select
              value={circleId}
              onValueChange={(v) => {
                setCircleId(v);
                setMagicLink(null);
              }}
              disabled={loadingCircles}
            >
              <SelectTrigger className={ds.btnRound}>
                <SelectValue
                  placeholder={loadingCircles ? "جاري التحميل…" : "اختر الحلقة"}
                />
              </SelectTrigger>
              <SelectContent>
                {circles.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!circleId ? (
        <p className={ds.alert.info} style={tajawal}>
          اختر حلقة لعرض قائمة الطلاب.
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
            totalCount={rows.length}
            hiddenDirty={0}
            hideGroupFilter
          />

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              disabled={loading}
              onClick={loadStudents}
              style={tajawal}
            >
              <RefreshCw className="w-4 h-4" />
              تحديث القائمة
            </Button>
          </div>

          <AttendanceStatusGrid
            rows={gridRows}
            visibleRows={visibleGridRows}
            loading={loading}
            date={date}
            onDateChange={setDate}
            onStatusPick={pickStatus}
            onCommit={commit}
            committing={committing}
            savedBaseline={baseline}
            commitLabel="اعتماد حفظ التحضير 💾"
            hint="الافتراضي حاضر في الواجهة فقط — اعتمد لحفظ التغييرات في قاعدة البيانات."
          />
        </>
      )}
    </div>
  );
}
