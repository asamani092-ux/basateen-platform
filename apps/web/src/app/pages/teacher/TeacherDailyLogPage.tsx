import { useCallback, useEffect, useMemo, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { DatePickerField } from "../../components/teacher/DatePickerField";
import { api, type StudentRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { isUiDevPreview } from "../../lib/dev-preview";
import { ds, tajawal } from "../../lib/design-system";
import type { DailyMetrics } from "../../lib/teacher/daily-metrics";
import {
  flushOfflineQueue,
  enqueueOfflineMark,
  listOfflineMarks,
  offlinePendingCount,
} from "../../lib/teacher/offline-queue";
import { OfflineBanner, StudentDailyCard } from "./StudentDailyCard";

type MarkRow = {
  student_id: number;
  score: number | null;
  metrics: DailyMetrics | null;
  updated_at?: string;
  plan_id?: number | null;
};

type PlanMap = Map<number, { id: number; daily_rabt_faces: number }>;

export function TeacherDailyLogPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [markDate, setMarkDate] = useState(today);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [marks, setMarks] = useState<Map<number, MarkRow>>(new Map());
  const [plans, setPlans] = useState<PlanMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingOffline, setPendingOffline] = useState(offlinePendingCount());
  const canLoad = Boolean(getApiToken()) || isUiDevPreview();

  const loadMarks = useCallback(
    async (date: string) => {
      if (!canLoad) return;
      const res = await api.teacherDailyMarks(date);
      const map = new Map<number, MarkRow>();
      for (const row of res.items) {
        map.set(row.student_id, {
          student_id: row.student_id,
          score: row.score,
          metrics: (row.metrics as DailyMetrics | null) ?? null,
          updated_at: row.updated_at,
          plan_id: row.plan_id,
        });
      }
      setMarks(map);
    },
    [canLoad],
  );

  const syncPending = useCallback(async () => {
    if (!canLoad || !navigator.onLine) return;
    const res = await flushOfflineQueue(async (item) => {
      try {
        await api.teacherDailyUpsert({
          student_id: item.student_id,
          mark_date: item.mark_date,
          metrics: item.metrics,
          plan_id: item.plan_id,
        });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    });
    setPendingOffline(offlinePendingCount());
    if (res.synced > 0) await loadMarks(markDate);
  }, [canLoad, markDate, loadMarks]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!canLoad) {
      setStudents([]);
      setLoading(false);
      return;
    }
    try {
      const [stuRes, planRes] = await Promise.all([
        api.students(),
        api.teacherPlansList(),
      ]);
      setStudents(
        stuRes.items.filter((s) => s.admission_status !== "pending_placement"),
      );
      const pMap: PlanMap = new Map();
      for (const p of planRes.items as Array<{
        student_id: number;
        id: number;
        daily_rabt_faces: number;
      }>) {
        pMap.set(p.student_id, {
          id: p.id,
          daily_rabt_faces: Number(p.daily_rabt_faces) || 0,
        });
      }
      setPlans(pMap);
      await loadMarks(markDate);
      await syncPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [canLoad, markDate, loadMarks, syncPending]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    void loadMarks(markDate);
  }, [markDate, loadMarks]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncPending();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncPending]);

  async function saveMark(studentId: number, metrics: DailyMetrics) {
    const plan = plans.get(studentId);
    const payload = {
      student_id: studentId,
      mark_date: markDate,
      metrics,
      plan_id: plan?.id ?? null,
    };

    if (!canLoad) return;

    if (!online) {
      enqueueOfflineMark(payload);
      setPendingOffline(offlinePendingCount());
      setMarks((prev) => {
        const next = new Map(prev);
        next.set(studentId, {
          student_id: studentId,
          score: null,
          metrics,
          updated_at: new Date().toISOString(),
        });
        return next;
      });
      return;
    }

    setSavingId(studentId);
    setError(null);
    try {
      const res = await api.teacherDailyUpsert(payload);
      setMarks((prev) => {
        const next = new Map(prev);
        next.set(studentId, {
          student_id: studentId,
          score: res.score ?? null,
          metrics: res.metrics ?? metrics,
          updated_at: res.updated_at,
          plan_id: res.plan_id,
        });
        return next;
      });
    } catch (e) {
      enqueueOfflineMark(payload);
      setPendingOffline(offlinePendingCount());
      setError(
        (e instanceof Error ? e.message : "فشل الحفظ") +
          " — تم التخزين محلياً",
      );
    } finally {
      setSavingId(null);
    }
  }

  const offlineMarks = listOfflineMarks();

  return (
    <div className="space-y-4">
      <Card className={ds.card}>
        <CardHeader>
          <CardTitle className={ds.page.section} style={tajawal}>
            الرصد اليومي
          </CardTitle>
          <CardDescription style={tajawal}>
            أي رصد يُسجّل حضور الطالب تلقائياً. الربط بدون عدادات — عند «نعم» يُحتسب
            من الخطة.
          </CardDescription>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground" style={tajawal}>
              تاريخ الرصد
            </p>
            <DatePickerField
              value={markDate}
              maxDate={today}
              onChange={setMarkDate}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {online ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Wifi className="size-3.5" />
                متصل
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                <WifiOff className="size-3.5" />
                دون اتصال — الحفظ محلي
              </span>
            )}
            {pendingOffline > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ds.btnRound}
                onClick={() => void syncPending()}
                style={tajawal}
              >
                مزامنة ({pendingOffline})
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <OfflineBanner count={pendingOffline} />

      {error && (
        <p className="text-sm text-destructive px-1" style={tajawal}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm px-1" style={tajawal}>
          جاري التحميل…
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {students.map((s) => {
            const saved = marks.get(s.id);
            const local = offlineMarks.find(
              (o) => o.student_id === s.id && o.mark_date === markDate,
            );
            return (
              <StudentDailyCard
                key={`${s.id}-${markDate}`}
                student={s}
                plan={plans.get(s.id) ?? null}
                saved={
                  saved
                    ? {
                        metrics: saved.metrics,
                        score: saved.score,
                        updated_at: saved.updated_at,
                      }
                    : local
                      ? { metrics: local.metrics, score: null }
                      : undefined
                }
                saving={savingId === s.id}
                onSave={(m) => void saveMark(s.id, m)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
