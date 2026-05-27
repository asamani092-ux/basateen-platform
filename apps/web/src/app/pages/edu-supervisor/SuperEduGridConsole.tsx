import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api-client";
import { ds, tajawal } from "../../lib/design-system";
import { Input } from "../../components/ui/input";

type GridRow = {
  student_id: number;
  full_name_ar: string;
  school_grade: string | null;
  circle_id: number | null;
  circle_name: string | null;
  has_memorized: number | null;
  has_repeated: number | null;
  has_reviewed: number | null;
  has_linked: number | null;
  memorization_errors: number | null;
  memorization_warnings: number | null;
};

export function SuperEduGridConsole() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [circleFilter, setCircleFilter] = useState("");
  const [rows, setRows] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"name" | "circle">("name");
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (circleFilter.trim()) params.set("circle_id", circleFilter.trim());
      const data = await api.eduSupervisorMasterGrid(params.toString());
      setRows((data.rows ?? []) as GridRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الشبكة");
    } finally {
      setLoading(false);
    }
  }, [date, circleFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "circle") {
        return String(a.circle_name ?? "").localeCompare(
          String(b.circle_name ?? ""),
          "ar",
        );
      }
      return a.full_name_ar.localeCompare(b.full_name_ar, "ar");
    });
    return copy;
  }, [rows, sortKey]);

  function scheduleSave(row: GridRow) {
    const existing = saveTimers.current.get(row.student_id);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      row.student_id,
      setTimeout(async () => {
        if (!row.circle_id) return;
        try {
          await api.eduSupervisorUpsertLog({
            student_id: row.student_id,
            circle_id: row.circle_id,
            mark_date: date,
            has_memorized: row.has_memorized ?? 0,
            has_repeated: row.has_repeated ?? 0,
            has_reviewed: row.has_reviewed ?? 0,
            has_linked: row.has_linked ?? 0,
            memorization_errors: row.memorization_errors ?? 0,
            memorization_warnings: row.memorization_warnings ?? 0,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "فشل الحفظ التلقائي");
        }
      }, 450),
    );
  }

  function updateRow(studentId: number, patch: Partial<GridRow>) {
    setRows((prev) => {
      const next = prev.map((r) =>
        r.student_id === studentId ? { ...r, ...patch } : r,
      );
      const row = next.find((r) => r.student_id === studentId);
      if (row) scheduleSave(row);
      return next;
    });
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          شبكة الرصد الموحدة
        </h2>
        <p className={ds.page.description} style={tajawal}>
          جميع طلاب المجمع — حفظ تلقائي لكل سطر
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1" style={tajawal}>
            التاريخ
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={ds.btnRound}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1" style={tajawal}>
            فلترة حلقة (معرّف)
          </label>
          <Input
            value={circleFilter}
            onChange={(e) => setCircleFilter(e.target.value)}
            placeholder="معرّف الحلقة"
            className={ds.btnRound}
            style={tajawal}
          />
        </div>
        <button
          type="button"
          className={`${ds.btnRound} px-4 py-2 bg-primary text-primary-foreground`}
          onClick={() => setSortKey((k) => (k === "name" ? "circle" : "name"))}
          style={tajawal}
        >
          فرز: {sortKey === "name" ? "بالاسم" : "بالحلقة"}
        </button>
      </div>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-muted-foreground" style={tajawal}>
          جاري التحميل…
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border max-h-[70vh]">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="p-2 text-right" style={tajawal}>
                  الطالب
                </th>
                <th className="p-2 text-right" style={tajawal}>
                  الحلقة
                </th>
                <th className="p-2 text-center" style={tajawal}>
                  حفظ
                </th>
                <th className="p-2 text-center" style={tajawal}>
                  مراجعة
                </th>
                <th className="p-2 text-center" style={tajawal}>
                  ربط
                </th>
                <th className="p-2 text-center" style={tajawal}>
                  أخطاء
                </th>
                <th className="p-2 text-center" style={tajawal}>
                  تنبيهات
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.student_id} className="border-t border-border">
                  <td className="p-2 font-medium" style={tajawal}>
                    {row.full_name_ar}
                  </td>
                  <td className="p-2 text-muted-foreground" style={tajawal}>
                    {row.circle_name ?? "—"}
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.has_memorized === 1}
                      disabled={!row.circle_id}
                      onChange={(e) =>
                        updateRow(row.student_id, {
                          has_memorized: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.has_reviewed === 1}
                      disabled={!row.circle_id}
                      onChange={(e) =>
                        updateRow(row.student_id, {
                          has_reviewed: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.has_linked === 1}
                      disabled={!row.circle_id}
                      onChange={(e) =>
                        updateRow(row.student_id, {
                          has_linked: e.target.checked ? 1 : 0,
                        })
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 text-center rounded border"
                      value={row.memorization_errors ?? 0}
                      disabled={!row.circle_id}
                      onChange={(e) =>
                        updateRow(row.student_id, {
                          memorization_errors: Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 text-center rounded border"
                      value={row.memorization_warnings ?? 0}
                      disabled={!row.circle_id}
                      onChange={(e) =>
                        updateRow(row.student_id, {
                          memorization_warnings: Number(e.target.value),
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
