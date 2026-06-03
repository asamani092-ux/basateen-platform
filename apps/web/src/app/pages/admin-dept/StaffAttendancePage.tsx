import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { AttendanceStatusButtons } from "../../components/attendance/AttendanceStatusButtons";
import { Badge } from "../../components/ui/badge";
import { ds, tajawal } from "../../lib/design-system";
import { roleLabelAr } from "../../lib/role-labels";

type Row = {
  user_id: number;
  full_name_ar: string;
  role: string | null;
  status: string;
};

/**
 * تحضير المنسوبين — يستخدم design-system (system_D) + مكونات ui المعتمدة.
 */
export function StaffAttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");

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
      const items = res.items.map((r) => ({
        user_id: r.user_id,
        full_name_ar: r.full_name_ar,
        role: r.role ?? null,
        status: normalizeAttendanceStatus(r.status),
      }));
      setRows(items);
      const base: Record<number, string> = {};
      for (const r of items) base[r.user_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  function setStatus(userId: number, status: string) {
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, status } : r)),
    );
  }

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!matchesArabicName(nameQuery, r.full_name_ar)) return false;
        return true;
      }),
    [rows, nameQuery],
  );

  const dirtyCount = useMemo(
    () =>
      rows.filter((r) => (baseline[r.user_id] ?? "present") !== r.status).length,
    [rows, baseline],
  );

  async function commit() {
    const changed = rows.filter(
      (r) => (baseline[r.user_id] ?? "present") !== r.status,
    );
    if (changed.length === 0) return;

    setCommitting(true);
    setError(null);
    try {
      await api.adminDeptSaveStaffAttendance({
        attendance_date: date,
        records: changed.map((r) => ({
          user_id: r.user_id,
          status: r.status,
        })),
      });
      const base: Record<number, string> = {};
      for (const r of rows) base[r.user_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التحضير");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          تحضير المنسوبين
        </h2>
        <p className={ds.page.description} style={tajawal}>
          الحالة الافتراضية «حاضر» في الواجهة فقط — لا يُحفظ شيء في قاعدة البيانات حتى
          تضغط «اعتماد حفظ التحضير».
        </p>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <p className={ds.alert.info} style={tajawal}>
        ابحث بالاسم. التغييرات تُرسل دفعة واحدة عند الحفظ.
      </p>

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
          <Button
            type="button"
            className={`${ds.btnRound} w-full sm:w-auto min-h-11`}
            disabled={committing || dirtyCount === 0 || loading}
            onClick={commit}
            style={tajawal}
          >
            <CheckCircle2 className="w-4 h-4" />
            {committing ? "جاري الاعتماد…" : "اعتماد حفظ التحضير 💾"}
            {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : filteredRows.length === 0 ? (
          <p className={ds.alert.info} style={tajawal}>
            لا يوجد منسوبون يطابقون البحث.
          </p>
        ) : (
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-[40%]" style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className="text-right w-[60%]" style={tajawal}>
                  الحالة
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="text-right align-top" style={tajawal}>
                    <p className="font-medium">{r.full_name_ar}</p>
                    {r.role && (
                      <Badge variant="secondary" className="mt-1 text-xs font-normal">
                        {roleLabelAr(r.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <AttendanceStatusButtons
                      value={r.status}
                      disabled={committing}
                      onChange={(st) => setStatus(r.user_id, st)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
