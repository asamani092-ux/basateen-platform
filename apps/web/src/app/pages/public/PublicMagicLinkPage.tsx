import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api-client";
import { normalizeAttendanceStatus } from "../../lib/attendance-status";
import { ds, tajawal } from "../../lib/design-system";

type Row = { student_id: number; full_name_ar: string; status: string };

/** تحضير عام بدون تسجيل دخول — رابط سحري (حلقة أو مسار) */
export function PublicMagicLinkPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [date, setDate] = useState("");
  const [entityType, setEntityType] = useState<"circle" | "track">("circle");
  const [entityName, setEntityName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [baseline, setBaseline] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.publicAttendanceGet(token);
      setDate(res.attendance_date);
      setEntityType(res.entity_type ?? (res.track ? "track" : "circle"));
      setEntityName(
        res.entity_type === "track"
          ? (res.track?.name_ar ?? "")
          : (res.circle?.name_ar ?? ""),
      );
      const items = (res.items ?? []).map((r) => ({
        student_id: r.student_id,
        full_name_ar: r.full_name_ar,
        status: normalizeAttendanceStatus(r.status),
      }));
      setRows(items);
      const base: Record<number, string> = {};
      for (const r of items) base[r.student_id] = r.status;
      setBaseline(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "الرابط غير صالح أو موقوف");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function pickStatus(studentId: number, status: string) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)),
    );
  }

  async function save() {
    const changed = rows.filter(
      (r) => (baseline[r.student_id] ?? "present") !== r.status,
    );
    if (changed.length === 0) {
      setDone(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.publicAttendanceSave(token, {
        records: changed.map((r) => ({
          student_id: r.student_id,
          status: r.status,
        })),
      });
      const base: Record<number, string> = {};
      for (const r of rows) base[r.student_id] = r.status;
      setBaseline(base);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const title =
    entityType === "track" ? "تحضير المسار" : "تحضير الحلقة";
  const emptyMsg =
    entityType === "track"
      ? "لا يوجد طلاب في هذا المسار."
      : "لا يوجد طلاب في هذه الحلقة.";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8" dir="rtl">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <img
            src="/logo-light.png"
            alt="بساتين"
            className="h-20 mx-auto mb-3 dark:hidden"
          />
          <h1 className={ds.page.title} style={tajawal}>
            {title}
          </h1>
          <p className={ds.page.description} style={tajawal}>
            {entityName || "—"} · تحضير يوم {date || "اليوم"}
          </p>
        </div>

        {error && (
          <p className={ds.alert.error} style={tajawal}>
            {error}
          </p>
        )}
        {done && !error && (
          <p className={ds.alert.success} style={tajawal}>
            تم حفظ التحضير بنجاح. شكراً لكم.
          </p>
        )}

        {loading ? (
          <p className="text-center text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <div className={`${ds.card} p-4 space-y-3`}>
            {rows.map((r) => (
              <div
                key={r.student_id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3 last:border-0"
              >
                <span className="font-medium" style={tajawal}>
                  {r.full_name_ar}
                </span>
                <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:flex-wrap sm:justify-end">
                  {(["present", "absent", "excused"] as const).map((st) => {
                    const labels = {
                      present: "حاضر",
                      absent: "غائب",
                      excused: "مستأذن",
                    };
                    const active = r.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={saving}
                        onClick={() => pickStatus(r.student_id, st)}
                        className={`w-full sm:w-auto h-11 px-3 rounded-full text-xs font-medium touch-manipulation ${
                          active ? ds.tab.active : ds.tab.idle
                        }`}
                        style={tajawal}
                      >
                        {labels[st]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {rows.length === 0 && !error && (
              <p className={ds.alert.info} style={tajawal}>
                {emptyMsg}
              </p>
            )}
          </div>
        )}

        <Button
          type="button"
          className={`w-full min-h-11 ${ds.btnRound}`}
          disabled={loading || saving || rows.length === 0}
          onClick={save}
          style={tajawal}
        >
          <CheckCircle2 className="w-4 h-4" />
          {saving ? "جاري الحفظ…" : "حفظ التحضير"}
        </Button>
      </div>
    </div>
  );
}
