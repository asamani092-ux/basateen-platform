import { useCallback, useEffect, useMemo, useState } from "react";

import { AttendanceStatusGrid } from "../../components/attendance/AttendanceStatusGrid";

import { AttendanceFilterBar } from "../../components/attendance/AttendanceFilterBar";

import { api } from "../../lib/api-client";

import { canUseApi } from "../../lib/api-access";

import { normalizeAttendanceStatus } from "../../lib/attendance-status";

import { matchesArabicName } from "../../lib/attendance-search";

import { stageLabel } from "../../lib/stages";

import { ds, tajawal } from "../../lib/design-system";



type Row = {

  student_id: number;

  full_name_ar: string;

  stage_id: number | null;

  circle_name: string | null;

  status: string;

};



/** تحضير الطلاب عند غياب المعلم — لا يُحتسب إنجازاً قرآنياً */

export function GsStudentAttendancePage() {

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [rows, setRows] = useState<Row[]>([]);

  const [baseline, setBaseline] = useState<Record<number, string>>({});

  const [scopeLabel, setScopeLabel] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [committing, setCommitting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [nameQuery, setNameQuery] = useState("");

  const [circleFilter, setCircleFilter] = useState("");



  const load = useCallback(async () => {

    if (!canUseApi()) {

      setError("أعد تسجيل الدخول");

      setLoading(false);

      return;

    }

    setLoading(true);

    setError(null);

    try {

      await api.gsStudentAttendanceInitToday();

      const res = await api.gsStudentAttendanceToday(date);

      const items = res.items.map((r) => ({

        ...r,

        status: normalizeAttendanceStatus(r.status),

      }));

      setRows(items);

      const base: Record<number, string> = {};

      for (const r of items) base[r.student_id] = r.status;

      setBaseline(base);

      const sc = res.scope as { type?: string; stageIds?: number[] };

      if (sc?.type === "global") setScopeLabel("كل المجمع");

      else if (sc?.stageIds?.length) {

        setScopeLabel(sc.stageIds.map((id) => stageLabel(id)).join("، "));

      } else setScopeLabel(null);

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



  const circleOptions = useMemo(() => {

    const names = new Set<string>();

    for (const r of rows) {

      const c = r.circle_name?.trim();

      if (c) names.add(c);

    }

    return [...names].sort((a, b) => a.localeCompare(b, "ar")).map((n) => ({

      value: n,

      label: n,

    }));

  }, [rows]);



  const filteredRows = useMemo(() => {

    return rows.filter((r) => {

      if (circleFilter && (r.circle_name ?? "") !== circleFilter) return false;

      if (!matchesArabicName(nameQuery, r.full_name_ar)) return false;

      return true;

    });

  }, [rows, nameQuery, circleFilter]);



  const hiddenDirty = useMemo(() => {

    const visibleIds = new Set(filteredRows.map((r) => r.student_id));

    return rows.filter(

      (r) =>

        !visibleIds.has(r.student_id) &&

        (baseline[r.student_id] ?? "present") !== r.status,

    ).length;

  }, [rows, filteredRows, baseline]);



  const gridRows = useMemo(

    () =>

      rows.map((r) => ({

        id: r.student_id,

        title: r.full_name_ar,

        subtitle: `${r.circle_name ?? "—"} · ${stageLabel(r.stage_id)}`,

        status: r.status,

      })),

    [rows],

  );



  const visibleGridRows = useMemo(

    () =>

      filteredRows.map((r) => ({

        id: r.student_id,

        title: r.full_name_ar,

        subtitle: `${r.circle_name ?? "—"} · ${stageLabel(r.stage_id)}`,

        status: r.status,

      })),

    [filteredRows],

  );



  function pickStatus(studentId: number, status: string) {

    setRows((prev) =>

      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)),

    );

  }



  async function commit() {

    setCommitting(true);

    setError(null);

    try {

      const changed = rows.filter(

        (r) => (baseline[r.student_id] ?? "present") !== r.status,

      );

      for (const r of changed) {

        await api.gsStudentAttendanceUpsert({

          student_id: r.student_id,

          status: r.status,

          attendance_date: date,

        });

      }

      const base: Record<number, string> = {};

      for (const r of rows) base[r.student_id] = r.status;

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

          تحضير الطلاب

        </h2>

        <p className={ds.page.description} style={tajawal}>

          عند غياب المعلم — يُسجَّل حضور/غياب/استئذان لليوم فقط ولا يُحتسب إنجازاً

          قرآنياً

        </p>

        {scopeLabel && (

          <p className="text-xs text-muted-foreground mt-1" style={tajawal}>

            النطاق: {scopeLabel}

          </p>

        )}

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

        commitLabel="اعتماد تحضير الطلاب"

        hint="الافتراضي حاضر. استخدم البحث أو فلتر الحلقة ثم اعتمد."

        filterSlot={

          <AttendanceFilterBar

            nameQuery={nameQuery}

            onNameQueryChange={setNameQuery}

            groupLabel="الحلقة"

            groupValue={circleFilter}

            onGroupChange={setCircleFilter}

            groupOptions={circleOptions}

            shownCount={filteredRows.length}

            totalCount={rows.length}

            hiddenDirty={hiddenDirty}

          />

        }

      />

    </div>

  );

}

