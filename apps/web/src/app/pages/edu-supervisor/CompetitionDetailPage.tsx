import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import {
  BarChart3,
  Copy,
  Link2,
  ListChecks,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Printer,
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
import { CompetitionGradingGrid } from "../../components/edu/CompetitionGradingGrid";
import { CompetitionLeaderboardPanel } from "../../components/edu/CompetitionLeaderboardPanel";
import { CompetitionLeaderboardPrint } from "../../components/edu/CompetitionLeaderboardPrint";
import {
  CompetitionTargetsTable,
  type CompetitionTargetRow,
} from "../../components/edu/CompetitionTargetsTable";
import type { CompetitionLeaderRow } from "../../components/edu/competition-leaderboard-types";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import {
  categoryLabel,
  DEFAULT_SIRD_SETTINGS,
  defaultInputTypeFromTaskType,
  inputTypeOptionsForTaskType,
  isRecitationCategory,
  parseSirdSettings,
  TASK_INPUT_TYPE_OPTIONS,
  type SirdSettings,
} from "../../lib/competition-engine";
import { matchesArabicName } from "../../lib/attendance-search";
import {
  convertToFaces,
  formatFacesToText,
} from "../../lib/quran-memorization";
import { defaultDateRange } from "../../lib/local-iso-date";
import {
  resolveCompetitionScopeLabel,
  sortLeadersByAchievement,
} from "../../lib/competition-table-pagination";
import { ds, tajawal } from "../../lib/design-system";

type TabId = "dashboard" | "targets" | "tasks" | "grading" | "live";
type LeaderboardMode = "top" | "all";

type TaskRow = {
  id: number;
  name_ar: string;
  weight: number;
  type: "addition" | "deduction";
  input_type?: string;
};

type TargetRow = CompetitionTargetRow;

function memorizationJuzLabel(juz: number | string): string {
  const faces = convertToFaces(Number(juz) || 0, "juz");
  return formatFacesToText(faces) || "—";
}

function runCompetitionDashboardPrint(onMount: (mounted: boolean) => void) {
  onMount(true);
  requestAnimationFrame(() => {
    document.body.classList.add("printing-competition-dashboard");
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-competition-dashboard");
      onMount(false);
    }, 500);
  });
}

export function CompetitionDetailPage() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveLink, setLiveLink] = useState<string | null>(null);
  const [accessPin, setAccessPin] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null);
  const [editTargetAmount, setEditTargetAmount] = useState("");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskWeight, setNewTaskWeight] = useState(1);
  const [newTaskType, setNewTaskType] = useState<"addition" | "deduction">("addition");
  const [newTaskInputType, setNewTaskInputType] = useState<
    "boolean" | "numeric" | "counter"
  >("boolean");
  const newTaskInputOptions = useMemo(
    () => inputTypeOptionsForTaskType(newTaskType, TASK_INPUT_TYPE_OPTIONS),
    [newTaskType],
  );
  const [dashRange, setDashRange] = useState(defaultDateRange(7));
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("top");
  const [leaderSearch, setLeaderSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [sirdSettings, setSirdSettings] = useState<SirdSettings>({
    ...DEFAULT_SIRD_SETTINGS,
  });
  const [printLeaderboardMount, setPrintLeaderboardMount] = useState(false);
  const [filterCircles, setFilterCircles] = useState<
    Array<{ id: number; name_ar: string }>
  >([]);
  const [filterTracks, setFilterTracks] = useState<
    Array<{ id: number; name_ar: string }>
  >([]);

  const load = useCallback(async () => {
    if (!canUseApi() || !id) return;
    setLoading(true);
    setError(null);
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
          input_type: t.input_type != null ? String(t.input_type) : undefined,
        })),
      );
      setTargets(
        (res.targets as Array<Record<string, unknown>>).map((t) => ({
          student_id: Number(t.student_id),
          full_name_ar: String(t.full_name_ar ?? ""),
          current_memorization: Number(t.current_memorization ?? 0),
          target_amount: Number(t.target_amount ?? 0),
          achieved_amount: Number(t.achieved_amount ?? 0),
        })),
      );
      const comp = res.competition as Record<string, unknown>;
      setDashRange({
        start: String(comp.start_date),
        end: String(comp.end_date),
      });
      setEditName(String(comp.name_ar ?? ""));
      setEditStartDate(String(comp.start_date ?? ""));
      setEditEndDate(String(comp.end_date ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadDashboard = useCallback(async () => {
    if (!canUseApi() || !id) return;
    setDashboardLoading(true);
    setError(null);
    try {
      const res = await api.competitionsDashboard(id, {
        date_from: dashRange.start,
        date_to: dashRange.end,
        leaderboard_mode: "all",
      });
      setDashboard(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المؤشرات");
    } finally {
      setDashboardLoading(false);
    }
  }, [id, dashRange.start, dashRange.end]);

  const comp = data?.competition as Record<string, unknown> | undefined;
  const category = String(comp?.category ?? "recitation");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canUseApi()) return;
    void api.competitionsFilterOptions().then((res) => {
      setFilterCircles(
        (res.circles ?? []).map((c) => ({
          id: Number(c.id),
          name_ar: String(c.name_ar ?? ""),
        })),
      );
      setFilterTracks(
        (res.tracks ?? []).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar ?? ""),
        })),
      );
    });
  }, []);

  useEffect(() => {
    if (tab === "tasks" && isRecitationCategory(category)) {
      setTab("dashboard");
    }
  }, [tab, category]);

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
  }, [tab, loadDashboard]);

  useEffect(() => {
    if (comp?.rules) {
      setSirdSettings(parseSirdSettings(comp.rules as Record<string, unknown>));
    }
  }, [comp?.rules]);
  const logs = (data?.logs as Array<Record<string, unknown>>) ?? [];
  const kpis = (dashboard?.kpis ?? {}) as Record<string, number>;
  const leaders = (dashboard?.leaders ?? []) as CompetitionLeaderRow[];
  const scopeLabel = useMemo(
    () =>
      resolveCompetitionScopeLabel(
        (comp?.target_scope as { circle_ids?: number[]; track_ids?: number[] }) ??
          undefined,
        filterCircles,
        filterTracks,
      ),
    [comp?.target_scope, filterCircles, filterTracks],
  );
  const isNewMemorization = category === "new_memorization";
  const isReview = category === "review";
  const isRecitation = isRecitationCategory(category);
  const rankedLeaders = useMemo(
    () => sortLeadersByAchievement(leaders, isRecitation),
    [leaders, isRecitation],
  );
  const filteredLeaders = useMemo(
    () =>
      rankedLeaders.filter((l) =>
        matchesArabicName(leaderSearch, l.full_name_ar ?? `طالب #${l.student_id}`),
      ),
    [rankedLeaders, leaderSearch],
  );
  const canCloseWithoutSync =
    (isReview || category === "recitation") && comp?.status !== "closed";

  async function saveCompetitionMeta() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.competitionsPatch(id, {
        name_ar: editName.trim(),
        start_date: editStartDate,
        end_date: editEndDate,
      });
      setEditOpen(false);
      setDashRange({ start: editStartDate, end: editEndDate });
      await load();
      if (tab === "dashboard") await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ بيانات المنافسة");
    } finally {
      setSaving(false);
    }
  }

  async function addTask() {
    if (!id || !newTaskName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.competitionsAddTask(id, {
        name_ar: newTaskName.trim(),
        weight: newTaskWeight,
        type: newTaskType,
        input_type: newTaskInputType,
      });
      setNewTaskName("");
      setNewTaskWeight(1);
      setNewTaskType("addition");
      setNewTaskInputType("boolean");
      toast.success("تم إدراج المهمة بنجاح");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إضافة المهمة");
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(taskId: number) {
    if (!id) return;
    const removed = tasks.find((t) => t.id === taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSaving(true);
    setError(null);
    try {
      await api.competitionsDeleteTask(id, taskId);
      toast.success("تم حذف المهمة");
    } catch (e) {
      if (removed) {
        setTasks((prev) =>
          prev.some((t) => t.id === taskId) ? prev : [...prev, removed],
        );
      }
      const msg = e instanceof Error ? e.message : "فشل حذف المهمة";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function closeCompetitionOnly() {
    if (!id) return;
    const msg = isReview
      ? "سيتم إنهاء المنافسة دون تحديث سجل الحفظ المركزي للطلاب. متابعة؟"
      : "سيتم إنهاء المنافسة دون تحديث المحفوظ. متابعة؟";
    if (!window.confirm(msg)) return;
    setSaving(true);
    setError(null);
    try {
      await api.competitionsPatch(id, { status: "closed" });
      await load();
      toast.success("تم إنهاء المنافسة");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنهاء المنافسة");
    } finally {
      setSaving(false);
    }
  }

  async function syncMemorization() {
    if (!id) return;
    const alreadyClosed = comp?.status === "closed";
    if (
      !window.confirm(
        alreadyClosed
          ? "سيتم إعادة حساب الإنجاز من سجلات الرصد وتحديث المحفوظ في ملفات الطلاب. متابعة؟"
          : "سيتم إنهاء المنافسة وتحديث مقدار الحفظ في سجل الطلاب (من إنجاز اليوم + مهمة الحفظ). متابعة؟",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.competitionsSyncMemorization(id);
      await load();
      if (res.updated_count > 0) {
        toast.success(`تم التحديث لـ ${res.updated_count} طالب`);
      } else {
        toast.warning(
          "لم يُحدَّث أي طالب — تأكد من حفظ الرصد (إنجاز اليوم أو مهمة الحفظ) قبل المزامنة.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التزامن");
    } finally {
      setSaving(false);
    }
  }

  async function enableLiveLog() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.competitionsLiveLogToken(
        id,
        accessPin.trim() || undefined,
      );
      const url = `${window.location.origin}/live-log/${res.live_log_token}`;
      setLiveLink(url);
      await navigator.clipboard.writeText(url);
      toast.success("تم توليد الرابط ونسخه");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد الرابط");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLiveLogLink() {
    if (!id) return;
    if (!window.confirm("حذف رابط الرصد؟ لن يتمكن المقرئ من الدخول عبر هذا الرابط.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.competitionsDeleteLiveLogToken(id);
      setLiveLink(null);
      toast.success("تم حذف الرابط");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حذف الرابط");
    } finally {
      setSaving(false);
    }
  }

  async function saveTargetEdit(studentId: number) {
    if (!id) return;
    const amount = Number(editTargetAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("أدخل قيمة مستهدفة صحيحة");
      return;
    }
    setSaving(true);
    try {
      await api.competitionsUpdateTarget(id, studentId, amount);
      setTargets((prev) =>
        prev.map((t) =>
          t.student_id === studentId ? { ...t, target_amount: amount } : t,
        ),
      );
      setEditingTargetId(null);
      toast.success("تم تحديث المستهدف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setSaving(false);
    }
  }

  async function removeTarget(studentId: number) {
    if (!id) return;
    if (!window.confirm("إزالة هذا الطالب من المنافسة؟")) return;
    const removed = targets.find((t) => t.student_id === studentId);
    setTargets((prev) => prev.filter((t) => t.student_id !== studentId));
    setSaving(true);
    try {
      await api.competitionsDeleteTarget(id, studentId);
      toast.success("تم حذف الطالب من المستهدفين");
    } catch (e) {
      if (removed) setTargets((prev) => [...prev, removed]);
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "مؤشرات المنافسة", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "targets", label: "المستهدفون", icon: <Users className="w-4 h-4" /> },
    ...(!isRecitation
      ? [{ id: "tasks" as TabId, label: "المهام والأوزان", icon: <ListChecks className="w-4 h-4" /> }]
      : []),
    { id: "grading", label: "الرصد المباشر", icon: <Pencil className="w-4 h-4" /> },
    { id: "live", label: "الرصد والروابط", icon: <Link2 className="w-4 h-4" /> },
  ];

  async function saveSirdSettings() {
    if (!id) return;
    setSaving(true);
    try {
      await api.competitionsPatch(id, { rules: { sird: sirdSettings } });
      toast.success("تم حفظ إعدادات السرد");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground" style={tajawal}>
          جاري تحميل المنافسة…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Button asChild variant="outline" className={`${ds.btnRound} print:hidden`} style={tajawal}>
        <Link to="/edu-dept/competitions">← المنافسات</Link>
      </Button>

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {error}
        </p>
      )}

      {comp && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
            <div>
              <h2 className={ds.page.title} style={tajawal}>
                {String(comp.name_ar)}
              </h2>
              <p className="text-sm text-primary/80 mt-1" style={tajawal}>
                {categoryLabel(String(comp.category))}
              </p>
              <p className={ds.page.description} style={tajawal}>
                {String(comp.start_date)} → {String(comp.end_date)} · {String(comp.status)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={() => setEditOpen((v) => !v)}
                style={tajawal}
              >
                <Pencil className="w-4 h-4" />
                {editOpen ? "إغلاق التعديل" : "تعديل البيانات"}
              </Button>
            {isNewMemorization && (
              <Button
                type="button"
                variant="default"
                className={ds.btnRound}
                disabled={saving}
                onClick={() => void syncMemorization()}
                style={tajawal}
              >
                <RefreshCw className="w-4 h-4" />
                {comp.status === "closed"
                  ? "إعادة مزامنة المحفوظ"
                  : "إنهاء المنافسة وتحديث المحفوظ"}
              </Button>
            )}
            {canCloseWithoutSync && (
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                disabled={saving}
                onClick={() => void closeCompetitionOnly()}
                style={tajawal}
              >
                إنهاء المنافسة
              </Button>
            )}
            </div>
          </div>

          {editOpen && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>تعديل المنافسة</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-3 space-y-2">
                  <Label style={tajawal}>اسم المنافسة</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={tajawal}>تاريخ البداية</Label>
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={tajawal}>تاريخ النهاية</Label>
                  <Input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className={ds.btnRound}
                  />
                </div>
                <Button
                  type="button"
                  className={ds.btnRound}
                  disabled={saving || !editName.trim() || !editStartDate || !editEndDate}
                  onClick={() => void saveCompetitionMeta()}
                  style={tajawal}
                >
                  {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2 print:hidden">
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
            <div className="space-y-4" id="competition-dashboard-print">
              <div className="competition-print-header hidden print:block mb-4">
                <h2 className="text-xl font-bold" style={tajawal}>
                  تقرير مؤشرات المنافسة — {String(comp.name_ar)}
                </h2>
                <p className="text-sm text-muted-foreground" style={tajawal}>
                  {dashRange.start} → {dashRange.end}
                </p>
                {scopeLabel ? (
                  <p className="text-sm font-medium" style={tajawal}>
                    {scopeLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 items-end print:hidden">
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
                  disabled={dashboardLoading}
                  onClick={() => void loadDashboard()}
                  style={tajawal}
                >
                  {dashboardLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري التحميل…
                    </>
                  ) : (
                    "تطبيق"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={ds.btnRound}
                  onClick={() => runCompetitionDashboardPrint(setPrintLeaderboardMount)}
                  style={tajawal}
                >
                  <Printer className="w-4 h-4" />
                  طباعة التقرير
                </Button>
              </div>
              {dashboardLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span style={tajawal}>جاري جلب المؤشرات…</span>
                </div>
              ) : (
                <>
                  <Card className={ds.card}>
                    <CardHeader>
                      <CardTitle style={tajawal}>بطاقة المؤشرات الشاملة</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <EduKpiCard
                        label="الأجزاء المستهدفة"
                        value={kpis.target_juz ?? 0}
                        sub="إجمالي المستهدفين"
                      />
                      <EduKpiCard
                        label="الأحزاب المستهدفة"
                        value={kpis.target_hizb ?? 0}
                        sub="جزء = حزبان"
                      />
                      <EduKpiCard
                        label="الأوجه المستهدفة"
                        value={kpis.target_faces ?? 0}
                        sub="إجمالي الحجم"
                      />
                      <EduKpiCard
                        label="الأوجه المقروءة"
                        value={kpis.read_faces ?? 0}
                        sub="مجموع الرصد الفعلي"
                      />
                    </CardContent>
                  </Card>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <EduKpiCard
                      icon={<BarChart3 className="w-4 h-4" />}
                      label="نسبة الانضباط"
                      value={`${kpis.discipline_pct ?? 0}%`}
                      sub="من مهمة الحضور في شبكة الرصد"
                    />
                    <EduKpiCard
                      icon={<Users className="w-4 h-4" />}
                      label={isRecitation ? "نسبة الإتقان" : "نسبة الإتقان الكلية"}
                      value={`${isRecitation ? (kpis.mastery_pct ?? kpis.achievement_pct ?? 0) : (kpis.overall_pct ?? kpis.achievement_pct ?? 0)}%`}
                      sub={
                        isRecitation
                          ? `${kpis.total_passed ?? 0} مجتاز من ${kpis.total_read ?? 0} مقروء`
                          : "متوسط الطلاب — (مجموع الدرجات ÷ أيام الرصد × أوزان المهام)"
                      }
                    />
                    <EduKpiCard
                      label="المشاركون"
                      value={kpis.participants ?? 0}
                      sub="طلاب مستهدفون"
                    />
                  </div>
                  <CompetitionLeaderboardPanel
                    isRecitation={isRecitation}
                    leaderboardMode={leaderboardMode}
                    onLeaderboardModeChange={setLeaderboardMode}
                    leaderSearch={leaderSearch}
                    onLeaderSearchChange={setLeaderSearch}
                      leaders={filteredLeaders}
                    />
                  {printLeaderboardMount ? (
                    <CompetitionLeaderboardPrint
                      competitionName={String(comp.name_ar)}
                      dateFrom={dashRange.start}
                      dateTo={dashRange.end}
                      scopeLabel={scopeLabel}
                      isRecitation={isRecitation}
                      leaders={rankedLeaders}
                    />
                  ) : null}
                </>
              )}
            </div>
          )}

          {tab === "targets" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>المستهدفون الفرديون</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <CompetitionTargetsTable
                  targets={targets}
                  saving={saving}
                  editingTargetId={editingTargetId}
                  editTargetAmount={editTargetAmount}
                  onEditTargetAmountChange={setEditTargetAmount}
                  onStartEdit={(t) => {
                    setEditingTargetId(t.student_id);
                    setEditTargetAmount(String(t.target_amount));
                  }}
                  onCancelEdit={() => setEditingTargetId(null)}
                  onSaveEdit={(studentId) => void saveTargetEdit(studentId)}
                  onRemove={(studentId) => void removeTarget(studentId)}
                  memorizationLabel={memorizationJuzLabel}
                />
              </CardContent>
            </Card>
          )}

          {tab === "tasks" && !isRecitation && (
            <div className="space-y-4">
              <Card className={ds.card}>
                <CardHeader>
                  <CardTitle style={tajawal}>إضافة مهمة جديدة</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-5 gap-3 items-end">
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
                      onValueChange={(v) => {
                        const type = v as "addition" | "deduction";
                        setNewTaskType(type);
                        setNewTaskInputType(defaultInputTypeFromTaskType(type));
                      }}
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
                  <div className="space-y-2">
                    <Label style={tajawal}>نوع الإدخال</Label>
                    <Select
                      value={newTaskInputType}
                      onValueChange={(v) =>
                        setNewTaskInputType(v as "boolean" | "numeric" | "counter")
                      }
                    >
                      <SelectTrigger className={ds.btnRound}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {newTaskInputOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    className={`${ds.btnRound} sm:col-span-5`}
                    disabled={saving || !newTaskName.trim()}
                    onClick={() => void addTask()}
                    style={tajawal}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        جاري الإضافة…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        إضافة مهمة
                      </>
                    )}
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
                            <Plus className="w-4 h-4 text-success" />
                          ) : (
                            <Minus className="w-4 h-4 text-destructive" />
                          )}
                          <span>{task.name_ar}</span>
                          <span className="text-muted-foreground tabular-nums">
                            وزن {task.weight}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {TASK_INPUT_TYPE_OPTIONS.find((o) => o.value === task.input_type)
                              ?.label ?? "—"}
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

          {isRecitation && tab === "grading" && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>إعدادات أوزان السرد</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3 max-w-xl">
                <div className="space-y-1">
                  <Label style={tajawal}>درجة الحزب الأساسية</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={sirdSettings.base_hizb_score}
                    onChange={(e) =>
                      setSirdSettings((s) => ({
                        ...s,
                        base_hizb_score: Number(e.target.value),
                      }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-1">
                  <Label style={tajawal}>خصم الخطأ</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={sirdSettings.mistake_deduction}
                    onChange={(e) =>
                      setSirdSettings((s) => ({
                        ...s,
                        mistake_deduction: Number(e.target.value),
                      }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-1">
                  <Label style={tajawal}>خصم التنبيه</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={sirdSettings.warning_deduction}
                    onChange={(e) =>
                      setSirdSettings((s) => ({
                        ...s,
                        warning_deduction: Number(e.target.value),
                      }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <div className="space-y-1">
                  <Label style={tajawal}>حد الاجتياز</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={sirdSettings.pass_threshold}
                    onChange={(e) =>
                      setSirdSettings((s) => ({
                        ...s,
                        pass_threshold: Number(e.target.value),
                      }))
                    }
                    className={ds.btnRound}
                  />
                </div>
                <Button
                  type="button"
                  className={`${ds.btnRound} sm:col-span-2`}
                  disabled={saving}
                  onClick={() => void saveSirdSettings()}
                  style={tajawal}
                >
                  حفظ إعدادات السرد
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === "grading" && id > 0 && (
            <Card className={ds.card}>
              <CardHeader>
                <CardTitle style={tajawal}>شبكة الرصد التفاعلية</CardTitle>
              </CardHeader>
              <CardContent>
                <CompetitionGradingGrid competitionId={id} />
              </CardContent>
            </Card>
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
                <div className="space-y-2 max-w-sm">
                  <Label style={tajawal}>رمز تحقق الرابط / Access Token</Label>
                  <Input
                    value={accessPin}
                    onChange={(e) => setAccessPin(e.target.value)}
                    placeholder="مثال: 1234 (اختياري — الافتراضي 1234)"
                    className={ds.btnRound}
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground" style={tajawal}>
                    يُطلب من المقرئ إدخال هذا الرمز قبل فتح قائمة الطلاب.
                  </p>
                </div>
                {comp.live_log_token ? (
                  <code className="text-xs break-all block p-3 bg-muted rounded-xl" dir="ltr">
                    {`${window.location.origin}/live-log/${String(comp.live_log_token)}`}
                  </code>
                ) : (
                  <p className="text-sm" style={tajawal}>
                    لم يُولَّد رابط بعد.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className={ds.btnRound}
                    disabled={saving}
                    onClick={() => void enableLiveLog()}
                    style={tajawal}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    {comp.live_log_token ? "تجديد الرابط" : "توليد الرابط"}
                  </Button>
                  {comp.live_log_token ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className={ds.btnRound}
                      disabled={saving}
                      onClick={() => void deleteLiveLogLink()}
                      style={tajawal}
                    >
                      <Trash2 className="w-4 h-4" />
                      حذف الرابط
                    </Button>
                  ) : null}
                </div>
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

        </>
      )}
    </div>
  );
}
