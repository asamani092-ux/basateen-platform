import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { AttendanceStatusGrid } from "../../components/attendance/AttendanceStatusGrid";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
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

type MagicLinkState = {
  id: number;
  token: string;
  publicPath: string;
  isActive: number;
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
  const [magicLink, setMagicLink] = useState<MagicLinkState | null>(null);
  const [magicBusy, setMagicBusy] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);

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

  const publicUrl = useMemo(() => {
    if (!magicLink?.publicPath) return "";
    if (typeof window === "undefined") return magicLink.publicPath;
    return `${window.location.origin}${magicLink.publicPath}`;
  }, [magicLink]);

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

  async function createMagicLink() {
    const cid = Number(circleId);
    if (!Number.isFinite(cid)) {
      setError("اختر الحلقة أولاً");
      return;
    }
    setMagicBusy(true);
    setError(null);
    try {
      const res = await api.adminDeptCreateMagicLink({
        circle_id: cid,
        attendance_date: date,
        feature_name: "student_attendance",
      });
      setMagicLink({
        id: res.id,
        token: res.token,
        publicPath: res.public_path,
        isActive: res.is_active,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنشاء الرابط");
    } finally {
      setMagicBusy(false);
    }
  }

  async function toggleMagicLink() {
    if (!magicLink) return;
    setMagicBusy(true);
    try {
      const res = await api.adminDeptToggleMagicLink(magicLink.id);
      setMagicLink((prev) =>
        prev ? { ...prev, isActive: res.is_active } : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تبديل حالة الرابط");
    } finally {
      setMagicBusy(false);
    }
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyHint("تم نسخ الرابط");
      setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("تعذر النسخ — انسخ يدوياً");
    }
  }

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          التحضير اليومي للطلاب
        </h2>
        <p className={ds.page.description} style={tajawal}>
          اختر الحلقة، سجّل الغياب أو الاستئذان، أو شارك رابط تحضير للحلقة.
        </p>
      </div>

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
          <div className="flex flex-col justify-end gap-2">
            <Button
              type="button"
              variant="default"
              className={`${ds.btnRound} min-h-11`}
              disabled={!circleId || magicBusy}
              onClick={createMagicLink}
              style={tajawal}
            >
              <Link2 className="w-4 h-4" />
              {magicBusy ? "جاري التوليد…" : "إنشاء / نسخ رابط التحضير"}
            </Button>
          </div>
        </div>

        {magicLink && (
          <div className={ds.alert.success}>
            <p className="font-medium mb-2" style={tajawal}>
              رابط التحضير — {circleName || "الحلقة"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                readOnly
                value={publicUrl}
                className={ds.btnRound}
                dir="ltr"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  onClick={copyPublicLink}
                  style={tajawal}
                >
                  <Copy className="w-4 h-4" />
                  نسخ
                </Button>
                <div className="flex items-center gap-2 px-2">
                  <Switch
                    checked={magicLink.isActive === 1}
                    disabled={magicBusy}
                    onCheckedChange={toggleMagicLink}
                    aria-label="تفعيل الرابط"
                  />
                  <span className="text-sm" style={tajawal}>
                    {magicLink.isActive === 1 ? "مفعّل" : "موقوف"}
                  </span>
                </div>
              </div>
            </div>
            {copyHint && (
              <p className="text-xs mt-2 text-muted-foreground" style={tajawal}>
                {copyHint}
              </p>
            )}
          </div>
        )}
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
            commitLabel="حفظ تحضير الطلاب"
            hint="الافتراضي حاضر — غيّر الحالة ثم احفظ."
          />
        </>
      )}
    </div>
  );
}
