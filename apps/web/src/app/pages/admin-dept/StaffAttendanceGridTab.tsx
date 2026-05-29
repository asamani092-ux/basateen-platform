import { useCallback, useEffect, useMemo, useState } from "react";
import { AttendanceStatusGrid } from "../../components/attendance/AttendanceStatusGrid";
import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

type Row = {
  user_id: number;
  full_name_ar: string;
  role: string;
  status: string;
};

export function StaffAttendanceGridTab() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setError("أعد تسجيل الدخول");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.gsStaffAttendanceInitToday();
      const res = await api.gsStaffAttendanceToday(date);
      const items = res.items.map((r) => ({
        ...r,
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

  function pickStatus(userId: number, status: string) {
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, status } : r)),
    );
  }

  const roleOptions = useMemo(() => {
    const roles = new Set(rows.map((r) => r.role));
    return [...roles].sort().map((role) => ({ value: role, label: role }));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (roleFilter && r.role !== roleFilter) return false;
        if (!matchesArabicName(nameQuery, r.full_name_ar)) return false;
        return true;
      }),
    [rows, nameQuery, roleFilter],
  );

  const hiddenDirty = useMemo(() => {
    const visibleIds = new Set(filteredRows.map((r) => r.user_id));
    return rows.filter(
      (r) =>
        !visibleIds.has(r.user_id) &&
        (baseline[r.user_id] ?? "present") !== r.status,
    ).length;
  }, [rows, filteredRows, baseline]);

  const gridRows = useMemo(
    () =>
      rows.map((r) => ({
        id: r.user_id,
        title: r.full_name_ar,
        subtitle: r.role,
        status: r.status,
      })),
    [rows],
  );

  const visibleGridRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        id: r.user_id,
        title: r.full_name_ar,
        subtitle: r.role,
        status: r.status,
      })),
    [filteredRows],
  );

  async function commit() {
    setCommitting(true);
    setError(null);
    try {
      const changed = rows.filter(
        (r) => (baseline[r.user_id] ?? "present") !== r.status,
      );
      for (const r of changed) {
        await api.gsStaffAttendanceUpsert({
          user_id: r.user_id,
          status: r.status,
          attendance_date: date,
        });
      }
      const base: Record<number, string> = {};
      for (const r of rows) base[r.user_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل اعتماد التحضير");
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
          حاضر / غائب / معتذر — ثم اعتماد التحضير
        </p>
      </div>
      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
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
        commitLabel="اعتماد تحضير المنسوبين"
        hint="ابحث بالاسم أو فلتر الدور ثم اعتمد التحضير."
        filterSlot={
          <AttendanceFilterBar
            nameQuery={nameQuery}
            onNameQueryChange={setNameQuery}
            groupLabel="الدور"
            groupValue={roleFilter}
            onGroupChange={setRoleFilter}
            groupOptions={roleOptions}
            shownCount={filteredRows.length}
            totalCount={rows.length}
            hiddenDirty={hiddenDirty}
          />
        }
      />
    </div>
  );
}
