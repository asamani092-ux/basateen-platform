import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  BarChart3,
  ClipboardCheck,
  Copy,
  Link2,
  ListChecks,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { EduKpiCard } from "../../components/edu/EduKpiCard";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { categoryLabel } from "../../lib/competition-engine";
import { defaultDateRange } from "../../lib/local-iso-date";
import { ds, tajawal } from "../../lib/design-system";

type TabId = "dashboard" | "targets" | "tasks" | "live" | "attendance";

type TaskRow = {
  id: number;
  name_ar: string;
  weight: number;
  type: "addition" | "deduction";
};

export function CompetitionDetailPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [attendance, setAttendance] = useState<{
    date: string;
    items: Array<{ student_id: number; full_name_ar: string; present: boolean }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [liveLink, setLiveLink] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskWeight, setNewTaskWeight] = useState(1);
  const [newTaskType, setNewTaskType] = useState<"addition" | "deduction">("addition");
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dashRange, setDashRange] = useState(defaultDateRange(7));

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsDetail(id);
      setData(res);
      setTasks(
        (res.tasks as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
          weight: Number(t.weight ?? 1),
          type: (t.type === "deduction" ? "deduction" : "addition") as
            | "addition"
            | "deduction",
        })),
      );
      const comp = res.competition as Record<string, unknown>;
      setDashRange({
        start: String(comp.start_date),
        end: String(comp.end_date),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    }
  }, [id]);

  const loadDashboard = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsDashboard(id, {
        date_from: dashRange.start,
        date_to: dashRange.end,
      });
      setDashboard(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المؤشرات");
    }
  }, [id, dashRange.start, dashRange.end]);

  const loadAttendance = useCallback(async () => {
    if (!canUseApi() || !id) return;
    try {
      const res = await api.competitionsAttendanceGet(id, attDate);
      setAttendance({
        date: res.date,
        items: res.items as Array<{
          student_id: number;
          full_name_ar: string;
          present: boolean;
        }>,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التحضير");
    }
  }, [id, attDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
  }, [tab, loadDashboard]);

  useEffect(() => {
    if (tab === "attendance") void loadAttendance();
  }, [tab, loadAttendance]);

  const comp = data?.competition as Record<string, unknown> | undefined;
  const targets = (data?.targets as Array<Record<string, unknown>>) ?? [];
  const logs = (data?.logs as Array<Record<string, unknown>>) ?? [];
  const kpis = (dashboard?.kpis ?? {}) as Record<string, number>;
  const leaders = (dashboard?.leaders ?? []) as Array<{
    student_id: number;
    score: number;
    full_name_ar?: string;
  }>;
  const category = String(comp?.category ?? "recitation");
  const isNewMemorization = category === "new_memorization";

  async function addTask() {
    if (!id || !newTaskName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.competitionsAddTask(id, {
        name_ar: newTaskName.trim(),
        weight: newTaskWeight,
        type: newTaskType,
      });
      setNewTaskName("");
      setNewTaskWeight(1);
      setNewTaskType("addition");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إضافة المهمة");
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(taskId: number) {
    if (!id) return;
    setSaving(true);
    try {
      await api.competitionsDeleteTask(id, taskId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف المهمة");
    } finally {
      setSaving(false);
    }
  }

  async function syncMemorization() {
    if (!id) return;
    if (
      !window.confirm(
        "سيتم إنهاء المنافسة وتحديث مقدار الحفظ في سجل الطلاب للحفظ الجديد فقط. متابعة؟",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.competitionsSyncMemorization(id);
      await load();
      alert(`تم التحديث لـ ${res.updated_count} طالب.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التزامن");
    } finally {
      setSaving(false);
    }
  }

  async function enableLiveLog() {
    if (!id) return;
    try {
      const res = await api.competitionsLiveLogToken(id);
      const url = `${window.location.origin}/live-log/${res.live_log_token}`;
      setLiveLink(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد الرابط");
    }
  }

  async function saveAttendance() {
    if (!id || !attendance) return;
    setSaving(true);
    try {
      await api.competitionsAttendanceSave(id, {
        date: attDate,
        records: attendance.items.map((i) => ({
          student_id: i.student_id,
          present: i.present,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ التحضير");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "مؤشرات المنافسة", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "targets", label: "المستهدفون", icon: <Users className="w-4 h-4" /> },
    { id: "tasks", label: "المهام والأوزان", icon: <ListChecks className="w-4 h-4" /> },
    { id: "live", label: "الرصد والروابط", icon: <Link2 className="w-4 h-4" /> },
    { id: "attendance", label: "تحضير المنافسة", icon: <ClipboardCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Button asChild variant="outline" className={ds.btnRound} style={tajawal}>
        <Link to="/edu-dept/competitions">← المنافسات</Link>
      </Button>

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      {comp && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className={ds.page.title} style={tajawal}>
                {String(comp.name_ar)}
              </h2>
              <p className="text-sm text-primary/80 mt-1" style={tajawal}>
                {categoryLabel(String(comp.category), comp.custom_category as string)}
              </p>
              <p className={ds.page.description} style={tajawal}>
                {String(comp.start_date)} → {String(comp.end_date)} · {String(comp.status)}
              </p>
            </div>
            {isNewMemorization && comp.status !== "closed" && (
              <Button
                type="button"
                variant="default"
                className={ds.btnRound}
                disabled={saving}
                onClick={() => void syncMemorization()}
                style={tajawal}
              >
                <RefreshCw className="w-4 h-4" />
                إنهاء المنافسة وتحديث المحفوظ
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant={tab === t.id ? "default" : "outline"}
                className={ds.btnRound}
                onClick={() => setTab(t.id)}
                style={tajawal}
              >
                {t.icon}
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "dashboard" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label style={tajawal}>من تاريخ</Label>
                  <Input
                    type="date"
                    value={dashRange.start}
                    onChange={(e) =>
                      setDashRange((r) => ({ ...r, start: e.target.value }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-1">
                  <Label style={tajawal}>إلى تاريخ</Label>
                  <Input
                    type="date"
                    value={dashRange.end}
                    onChange={(e) =>
                      setDashRange((r) => ({ ...r, end: e.target.value }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <Button
                  type="button"
                  className={ds.btnRound}
                  onClick={() => void loadDashboard()}
                  style={tajawal}
                >
                  تطبيق
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <EduKpiCard
                  icon={<BarChart3 className="w-4 h-4" />}
                  label="نسبة الانضباط"
                  value={`${kpis.discipline_pct ?? 0}%`}
                  sub="حضور المنافسة فقط"
                />
                <EduKpiCard
                  icon={<Users className="w-4 h-4" />}
                  label="الإنجاز مقابل المستهدف"
                  value={`${kpis.achievement_pct ?? 0}%`}
                  sub={`${kpis.achieved_juz ?? 0} / ${kpis.target_juz ?? 0} جزء`}
                />
                <EduKpiCard
                  label="المشاركون"
                  value={kpis.participants ?? 0}
                  sub="طلاب مستهدفون"
                />
              </div>
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>الأوائل</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm" style={tajawal}>
                  {leaders.length === 0 ? (
                    <p className="text-muted-foreground">لا بيانات إنجاز بعد.</p>
                  ) : (
                    leaders.map((l, i) => (
                      <div
                        key={l.student_id}
                        className="flex justify-between border-b py-2"
                      >
                        <span>
                          {i + 1}. {l.full_name_ar ?? `طالب #${l.student_id}`}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {Math.round(l.score * 100) / 100} جزء
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "targets" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>المستهدفون الفرديون</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {targets.length === 0 ? (
                  <p className="text-muted-foreground text-sm" style={tajawal}>
                    لا مستهدفين — أُنشئت المنافسة بدون طلاب.
                  </p>
                ) : (
                  <table className="w-full text-sm" style={tajawal}>
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-right p-2">الطالب</th>
                        <th className="text-right p-2">الحفظ عند البدء</th>
                        <th className="text-right p-2">المستهدف</th>
                        <th className="text-right p-2">المُنجَز</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((t) => (
                        <tr key={String(t.student_id)} className="border-t">
                          <td className="p-2">{String(t.full_name_ar)}</td>
                          <td className="p-2 tabular-nums">
                            {String(t.current_memorization)}
                          </td>
                          <td className="p-2 tabular-nums">{String(t.target_amount)}</td>
                          <td className="p-2 tabular-nums">
                            {String(t.achieved_amount ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "tasks" && (
            <div className="space-y-4">
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>إضافة مهمة جديدة</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2 space-y-2">
                    <Label style={tajawal}>اسم المهمة</Label>
                    <Input
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      className={ds.btnRound}
                      placeholder="مثال: سرد، حضور، خطأ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={tajawal}>الوزن</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={newTaskWeight}
                      onChange={(e) => setNewTaskWeight(Number(e.target.value))}
                      className={ds.btnRound}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label style={tajawal}>نوع المهمة</Label>
                    <Select
                      value={newTaskType}
                      onValueChange={(v) =>
                        setNewTaskType(v as "addition" | "deduction")
                      }
                    >
                      <SelectTrigger className={ds.btnRound}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="addition">إضافة نقاط ➕</SelectItem>
                        <SelectItem value="deduction">خصم نقاط ➖</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    className={`${ds.btnRound} sm:col-span-4`}
                    disabled={saving || !newTaskName.trim()}
                    onClick={() => void addTask()}
                    style={tajawal}
                  >
                    <Plus className="w-4 h-4" />
                    إضافة مهمة
                  </Button>
                </CardContent>
              </Card>

              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>مهام المنافسة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground" style={tajawal}>
                      لا مهام بعد. أضف مهام الرصد والتقييم.
                    </p>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between border-b py-2 text-sm"
                        style={tajawal}
                      >
                        <div className="flex items-center gap-2">
                          {task.type === "addition" ? (
                            <Plus className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Minus className="w-4 h-4 text-destructive" />
                          )}
                          <span>{task.name_ar}</span>
                          <span className="text-muted-foreground tabular-nums">
                            وزن {task.weight}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => void removeTask(task.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "live" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>رابط الرصد الميداني</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  رابط مستقل للمُختبِر/المعلم لرصد الإنجاز — معزول عن الرصد اليومي للحلقة.
                </p>
                {comp.live_log_token ? (
                  <code className="text-xs break-all block p-3 bg-muted rounded-xl" dir="ltr">
                    {`${window.location.origin}/live-log/${String(comp.live_log_token)}`}
                  </code>
                ) : (
                  <p className="text-sm" style={tajawal}>
                    لم يُولَّد رابط بعد.
                  </p>
                )}
                <Button
                  type="button"
                  className={ds.btnRound}
                  onClick={() => void enableLiveLog()}
                  style={tajawal}
                >
                  <Link2 className="w-4 h-4" />
                  {comp.live_log_token ? "تجديد الرابط" : "توليد الرابط"}
                </Button>
                {liveLink && (
                  <div className={ds.alert.info}>
                    <code className="text-xs break-all block mb-2" dir="ltr">
                      {liveLink}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={ds.btnRound}
                      onClick={() => void navigator.clipboard.writeText(liveLink)}
                      style={tajawal}
                    >
                      <Copy className="w-4 h-4" />
                      نسخ الرابط
                    </Button>
                  </div>
                )}
                {logs.length > 0 && (
                  <div className="pt-4 border-t space-y-2 text-sm" style={tajawal}>
                    <p className="font-semibold">آخر سجلات الرصد</p>
                    {logs.slice(0, 10).map((row, idx) => (
                      <div
                        key={`${row.student_id}-${row.log_date}-${idx}`}
                        className="flex justify-between border-b py-1"
                      >
                        <span>{String(row.full_name_ar ?? row.student_id)}</span>
                        <span className="text-muted-foreground">
                          {String(row.log_date ?? row.recorded_at ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "attendance" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>تحضير المنافسة (مستقل)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  كشف حضور خاص بهذه المنافسة فقط — لا يؤثر على التحضير الإداري اليومي.
                </p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <Label style={tajawal}>التاريخ</Label>
                    <Input
                      type="date"
                      value={attDate}
                      onChange={(e) => setAttDate(e.target.value)}
                      className={ds.btnRound}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className={ds.btnRound}
                    onClick={() => void loadAttendance()}
                    style={tajawal}
                  >
                    تحميل
                  </Button>
                </div>
                {attendance && (
                  <div className="space-y-2">
                    {attendance.items.map((item) => (
                      <label
                        key={item.student_id}
                        className="flex items-center gap-3 py-2 border-b cursor-pointer"
                        style={tajawal}
                      >
                        <input
                          type="checkbox"
                          checked={item.present}
                          onChange={(e) => {
                            setAttendance((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((i) =>
                                      i.student_id === item.student_id
                                        ? { ...i, present: e.target.checked }
                                        : i,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                        <span className={item.present ? "" : "text-muted-foreground line-through"}>
                          {item.full_name_ar}
                        </span>
                      </label>
                    ))}
                    <Button
                      type="button"
                      className={ds.btnRound}
                      disabled={saving}
                      onClick={() => void saveAttendance()}
                      style={tajawal}
                    >
                      {saving ? "جاري الحفظ…" : "حفظ التحضير"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
