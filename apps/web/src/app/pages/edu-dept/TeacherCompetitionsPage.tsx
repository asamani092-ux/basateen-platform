import { GuardedForm } from "../../components/ui/guarded-form";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Medal, Pencil, Plus, Printer, Trash2, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { useGuardedVoidAction } from "../../lib/guarded-async";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { EduKpiCard } from "../../components/edu/EduKpiCard";
import { Button } from "../../components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
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
import { cn } from "../../components/ui/utils";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import { ds, tajawal } from "../../lib/design-system";

type Comp = { id: number; name_ar: string; start_date: string | null; end_date: string | null };

type LeaderRow = {
  rank: number;
  student_id: number;
  full_name_ar: string;
  total_points: number;
};

function printTeacherCompetition() {
  document.body.classList.add("printing-teacher-competition");
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove("printing-teacher-competition");
  }, 500);
}

function getFriendlyTeacherCompetitionError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "فشل غير معروف");
  if (/created_by_user_id|no such column|SQLITE_ERROR/i.test(msg)) {
    return ds.dbMigrationErrorHint;
  }
  return msg;
}

type TeacherCompetitionsPageProps = {
  /** داخل بوابة المعلم — يخفي العنوان المكرر */
  embedded?: boolean;
};

export function TeacherCompetitionsPage({ embedded = false }: TeacherCompetitionsPageProps) {
  const [items, setItems] = useState<Comp[]>([]);
  const [activeCompetitionId, setActiveCompetitionId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<
    Array<{ id: number; title_ar: string; weight_points: number }>
  >([]);
  const [students, setStudents] = useState<Array<{ id: number; full_name_ar: string }>>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [tab, setTab] = useState<"scores" | "leaderboard">("scores");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskWeight, setTaskWeight] = useState(1);

  const activeCompetition = useMemo(
    () => items.find((c) => c.id === activeCompetitionId) ?? null,
    [items, activeCompetitionId],
  );

  const topLeaderPoints = leaderboard[0]?.total_points ?? 0;

  const loadList = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.eduDeptTeacherCompetitionsList();
      setItems(res.items);
      if (typeof res.default_task_weight === "number") {
        setTaskWeight(res.default_task_weight);
      }
      setActiveCompetitionId((prev) => {
        if (prev != null && res.items.some((c) => c.id === prev)) return prev;
        return res.items[0]?.id ?? null;
      });
    } catch (e) {
      const msg = getFriendlyTeacherCompetitionError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    if (!canUseApi()) return;
    setDetailLoading(true);
    try {
      const [res, lb] = await Promise.all([
        api.eduDeptTeacherCompetitionDetail(id),
        api.eduDeptTeacherCompetitionLeaderboard(id),
      ]);
      setTasks(res.tasks);
      setStudents(res.students);
      setLeaderboard(lb.items);
      const map: Record<string, number> = {};
      for (const s of res.scores) {
        map[`${s.task_id}-${s.student_id}`] = s.points;
      }
      setScores(map);
      setItems((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                name_ar: res.competition.name_ar,
                start_date: res.competition.start_date,
                end_date: res.competition.end_date,
              }
            : c,
        ),
      );
    } catch (e) {
      const msg = getFriendlyTeacherCompetitionError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const deleteTaskIdRef = useRef<number | null>(null);

  const { run: deleteCompetition, pending: deletingComp } = useGuardedVoidAction(async () => {
    if (activeCompetitionId == null) return;
    const deletedId = activeCompetitionId;
    try {
      await api.eduDeptTeacherCompetitionDelete(deletedId);
      setDeleteOpen(false);
      const res = await api.eduDeptTeacherCompetitionsList();
      setItems(res.items);
      const nextId = res.items[0]?.id ?? null;
      setActiveCompetitionId(nextId);
      if (nextId != null) await loadDetail(nextId);
      else {
        setTasks([]);
        setStudents([]);
        setScores({});
        setLeaderboard([]);
      }
      toast.success("تم حذف المنافسة وجميع سجلاتها.");
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    }
  });

  const { run: saveScores, pending: saving } = useGuardedVoidAction(async () => {
    if (activeCompetitionId == null) return;
    setError(null);
    try {
      const payload = Object.entries(scores).map(([key, points]) => {
        const [taskId, studentId] = key.split("-").map(Number);
        return { task_id: taskId, student_id: studentId, points: Number(points) || 0 };
      });
      await api.eduDeptTeacherCompetitionSaveScores(activeCompetitionId, payload);
      toast.success("تم حفظ النقاط.");
      await loadDetail(activeCompetitionId);
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    }
  });

  const { run: runDeleteTask, pending: deletingTask } = useGuardedVoidAction(async () => {
    const taskId = deleteTaskIdRef.current;
    if (activeCompetitionId == null || taskId == null) return;
    try {
      await api.eduDeptTeacherCompetitionDeleteTask(activeCompetitionId, taskId);
      await loadDetail(activeCompetitionId);
      toast.success("تم حذف المهمة.");
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      deleteTaskIdRef.current = null;
    }
  });

  const { run: runAddTask, pending: addingTask } = useGuardedVoidAction(async () => {
    if (activeCompetitionId == null || !taskTitle.trim()) return;
    try {
      await api.eduDeptTeacherCompetitionAddTask(activeCompetitionId, {
        title_ar: taskTitle.trim(),
        weight_points: taskWeight,
      });
      setTaskOpen(false);
      setTaskTitle("");
      setTaskWeight(1);
      await loadDetail(activeCompetitionId);
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    }
  });

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (activeCompetitionId != null) void loadDetail(activeCompetitionId);
    else {
      setTasks([]);
      setStudents([]);
      setScores({});
      setLeaderboard([]);
    }
  }, [activeCompetitionId, loadDetail]);

  function onCompetitionChange(raw: string) {
    const id = raw ? Number(raw) : null;
    setActiveCompetitionId(Number.isFinite(id) ? id : null);
    setError(null);
  }

  async function createCompetition(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const res = await api.eduDeptTeacherCompetitionCreate({ name_ar: newName.trim() });
      setCreateOpen(false);
      setNewName("");
      setActiveCompetitionId(res.id);
      await loadList();
      await loadDetail(res.id);
      toast.success("تم إنشاء المنافسة مع مهام افتراضية.");
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    }
  }

  function openEdit() {
    if (!activeCompetition) return;
    setEditName(activeCompetition.name_ar);
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (activeCompetitionId == null || !editName.trim()) return;
    setEditSaving(true);
    setError(null);
    try {
      await api.eduDeptTeacherCompetitionUpdate(activeCompetitionId, {
        name_ar: editName.trim(),
      });
      setEditOpen(false);
      setItems((prev) =>
        prev.map((c) =>
          c.id === activeCompetitionId ? { ...c, name_ar: editName.trim() } : c,
        ),
      );
      toast.success("تم تحديث المنافسة.");
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    runAddTask();
  }

  function deleteTask(taskId: number) {
    if (activeCompetitionId == null) return;
    if (!window.confirm("حذف هذه المهمة وجميع نقاطها؟")) return;
    deleteTaskIdRef.current = taskId;
    runDeleteTask();
  }

  function scoreKey(taskId: number, studentId: number) {
    return `${taskId}-${studentId}`;
  }

  function setScore(taskId: number, studentId: number, value: number) {
    setScores((prev) => ({ ...prev, [scoreKey(taskId, studentId)]: value }));
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-[1400px] text-right">
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 print:hidden">
          <div className="text-right">
            <h2 className={`${ds.page.title} flex items-center gap-2 justify-start`} style={tajawal}>
              <Trophy className="w-7 h-7 text-primary shrink-0" />
              منافسات الحلقة
            </h2>
            <p className={ds.page.description} style={tajawal}>
              منافسات مع مهام جاهزة — رصد النقاط ومتابعة لوحة الصدارة.
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            className={cn(ds.btnRound, "rounded-full")}
            onClick={() => setCreateOpen(true)}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            منافسة جديدة
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between gap-3 print:hidden">
          <p className="text-sm text-muted-foreground" style={tajawal}>
            رصد نقاط طلاب حلقتك ومتابعة الترتيب.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            className={cn(ds.btnRound, "rounded-full shrink-0")}
            onClick={() => setCreateOpen(true)}
            style={tajawal}
          >
            <Plus className="w-4 h-4" />
            جديد
          </Button>
        </div>
      )}

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className={`${ds.kpiStrip} print:hidden`}>
          <EduKpiCard
            icon={<Trophy className="w-4 h-4 text-primary" />}
            label="المنافسات"
            value={items.length}
            sub={activeCompetition ? activeCompetition.name_ar : "لا منافسة محددة"}
          />
          <EduKpiCard
            icon={<Medal className="w-4 h-4 text-primary" />}
            label="المهام"
            value={tasks.length}
            sub={activeCompetitionId != null ? "في المنافسة النشطة" : "—"}
          />
          <EduKpiCard
            icon={<Users className="w-4 h-4 text-primary" />}
            label="الطلاب"
            value={students.length}
            sub="في حلقتك"
          />
          <EduKpiCard
            icon={<Medal className="w-4 h-4 text-amber-600" />}
            label="أعلى نقاط"
            value={topLeaderPoints}
            sub={leaderboard[0]?.full_name_ar ?? "لا نقاط بعد"}
            highlight={topLeaderPoints > 0}
          />
        </div>
      )}

      <div className={`${ds.card} p-4 space-y-3 text-right print:hidden`} dir="rtl">
        <Label style={tajawal}>المنافسة النشطة</Label>
        <div className="flex flex-col md:flex-row flex-wrap gap-4 md:items-end">
          <select
            className={`${ds.select} w-full md:max-w-xs`}
            value={activeCompetitionId ?? ""}
            onChange={(e) => onCompetitionChange(e.target.value)}
            style={tajawal}
            disabled={loading}
          >
            <option value="">— اختر منافسة —</option>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </select>
          {activeCompetition && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm font-medium px-2" style={tajawal}>
                {activeCompetition.name_ar}
              </span>
              <TableIconAction kind="edit" onClick={openEdit} disabled={detailLoading} />
              <TableIconAction
                kind="delete"
                onClick={() => setDeleteOpen(true)}
                disabled={detailLoading}
              />
            </div>
          )}
        </div>
        {(loading || detailLoading) && (
          <p className="text-xs text-muted-foreground" style={tajawal}>
            {loading ? "جاري تحميل القائمة…" : "جاري تحميل تفاصيل المنافسة…"}
          </p>
        )}
        {activeCompetitionId != null && tab === "scores" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className={cn(ds.btnRound, "rounded-full")}
              onClick={() => setTaskOpen(true)}
              style={tajawal}
            >
              <Plus className="w-4 h-4" />
              مهمة
            </Button>
            <Button
              type="button"
              variant="default"
              className={cn(ds.btnRound, ds.primaryActionBtn, "rounded-full w-full sm:w-auto")}
              loading={saving}
              disabled={saving || tasks.length === 0}
              onClick={saveScores}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : "حفظ النقاط"}
            </Button>
          </div>
        )}
      </div>

      {activeCompetitionId != null && (
        <>
          <div
            className="inline-flex flex-row-reverse items-center gap-1 rounded-full border border-border bg-muted/40 p-1 print:hidden"
            dir="rtl"
            role="tablist"
          >
            {(
              [
                { id: "scores" as const, label: "رصد النقاط" },
                { id: "leaderboard" as const, label: "لوحة الصدارة", icon: Medal },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  style={tajawal}
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" />}
                  {label}
                </button>
              );
            })}
          </div>

          {tab === "scores" && (
            <div className="space-y-4 text-right" dir="rtl">
              {tasks.length > 0 && (
                <div className={`${ds.card} p-4 flex flex-wrap gap-2 justify-start`}>
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
                      style={tajawal}
                    >
                      <span>
                        {t.title_ar}{" "}
                        <span className="text-muted-foreground">({t.weight_points})</span>
                      </span>
                      <button
                        type="button"
                        className="text-destructive hover:bg-destructive/10 rounded-full p-0.5 disabled:opacity-50"
                        title="حذف المهمة"
                        disabled={deletingTask}
                        onClick={() => deleteTask(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tasks.length > 0 && students.length > 0 ? (
                <>
                  {/* Desktop — wide table */}
                  <div className={`${ds.card} overflow-x-auto text-right hidden md:block`} dir="rtl">
                    <Table className={`${ds.tableMin} text-right`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead
                            className={`${ds.table.head} sticky right-0 bg-card z-10 min-w-[140px]`}
                            style={tajawal}
                          >
                            الطالب
                          </TableHead>
                          {tasks.map((t) => (
                            <TableHead
                              key={t.id}
                              className={`${ds.table.head} min-w-[100px] text-center`}
                              style={tajawal}
                            >
                              {t.title_ar}
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                ({t.weight_points})
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((st) => (
                          <TableRow key={st.id}>
                            <TableCell
                              className={`${ds.table.cell} sticky right-0 bg-card font-medium`}
                              style={tajawal}
                            >
                              {st.full_name_ar}
                            </TableCell>
                            {tasks.map((t) => (
                              <TableCell key={t.id} className={ds.table.cell}>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.5"
                                  dir="ltr"
                                  className={`${ds.btnRound} w-20 mx-auto text-center`}
                                  value={scores[scoreKey(t.id, st.id)] ?? 0}
                                  onChange={(e) =>
                                    setScore(t.id, st.id, Number(e.target.value) || 0)
                                  }
                                />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile — accordion cards per student */}
                  <div className="md:hidden space-y-2">
                    <Accordion type="single" collapsible className="space-y-2">
                      {students.map((st) => {
                        const studentTotal = tasks.reduce(
                          (sum, t) => sum + (Number(scores[scoreKey(t.id, st.id)]) || 0),
                          0,
                        );
                        return (
                          <AccordionItem
                            key={st.id}
                            value={String(st.id)}
                            className={`${ds.card} border border-border rounded-2xl px-3 overflow-hidden`}
                          >
                            <AccordionTrigger
                              className="py-2.5 hover:no-underline text-right [&>svg]:mr-auto [&>svg]:ml-0"
                              style={tajawal}
                            >
                              <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                                <p className="font-semibold text-sm truncate">{st.full_name_ar}</p>
                                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                                  {studentTotal}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-3 pt-0">
                              <div className="space-y-2 border-t border-border/80 pt-2">
                                {tasks.map((t) => (
                                  <div
                                    key={t.id}
                                    className="flex items-center justify-between gap-2 min-h-10"
                                  >
                                    <span
                                      className="text-xs font-medium truncate flex-1"
                                      style={tajawal}
                                      title={t.title_ar}
                                    >
                                      {t.title_ar}
                                      <span className="text-muted-foreground ms-1">
                                        ({t.weight_points})
                                      </span>
                                    </span>
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.5"
                                      dir="ltr"
                                      className={`${ds.btnRound} w-20 text-center shrink-0`}
                                      value={scores[scoreKey(t.id, st.id)] ?? 0}
                                      onChange={(e) =>
                                        setScore(t.id, st.id, Number(e.target.value) || 0)
                                      }
                                    />
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="default"
                                  className={cn(
                                    ds.btnRound,
                                    ds.primaryActionBtn,
                                    "rounded-full w-full mt-1",
                                  )}
                                  loading={saving}
                                  disabled={saving}
                                  onClick={saveScores}
                                  style={tajawal}
                                >
                                  {saving ? "جاري الحفظ…" : "حفظ النقاط"}
                                </Button>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                </>
              ) : (
                <p className={ds.alert.info} style={tajawal}>
                  {tasks.length === 0
                    ? "أنشئ منافسة جديدة — ستُضاف مهام افتراضية تلقائياً."
                    : "لا يوجد طلاب في حلقتك."}
                </p>
              )}
            </div>
          )}

          {tab === "leaderboard" && (
            <div id="teacher-competition-print" className="space-y-4 text-right" dir="rtl">
              <div className="teacher-competition-print-header hidden print:block mb-4">
                <h2 className="text-xl font-bold" style={tajawal}>
                  لوحة صدارة — {activeCompetition?.name_ar ?? "منافسة الحلقة"}
                </h2>
                {activeCompetition?.start_date || activeCompetition?.end_date ? (
                  <p className="text-sm text-muted-foreground" style={tajawal}>
                    {activeCompetition.start_date ?? "—"} → {activeCompetition.end_date ?? "—"}
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(ds.btnRound, "rounded-full")}
                  disabled={leaderboard.length === 0}
                  onClick={printTeacherCompetition}
                  style={tajawal}
                >
                  <Printer className="w-4 h-4" />
                  طباعة الترتيب
                </Button>
              </div>
              <div className={`${ds.card} text-right`} dir="rtl">
              {leaderboard.length === 0 ? (
                <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
                  لا توجد نقاط مسجّلة بعد في هذه المنافسة.
                </p>
              ) : (
                <Table className={`${ds.tableMin} text-right`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={`${ds.table.head} w-[12%] text-center`} style={tajawal}>
                        الترتيب
                      </TableHead>
                      <TableHead className={ds.table.head} style={tajawal}>
                        الطالب
                      </TableHead>
                      <TableHead className={`${ds.table.head} w-[20%] text-center`} style={tajawal}>
                        النقاط
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((row) => (
                      <TableRow key={row.student_id}>
                        <TableCell
                          className={cn(
                            `${ds.table.cell} text-center font-bold tabular-nums`,
                            row.rank === 1 && "text-amber-600",
                            row.rank === 2 && "text-muted-foreground",
                            row.rank === 3 && "text-amber-700/80",
                          )}
                          style={tajawal}
                        >
                          {row.rank === 1
                            ? "🥇"
                            : row.rank === 2
                              ? "🥈"
                              : row.rank === 3
                                ? "🥉"
                                : row.rank}
                        </TableCell>
                        <TableTruncatedCell style={tajawal}>{row.full_name_ar}</TableTruncatedCell>
                        <TableCell
                          className={`${ds.table.cell} text-center font-semibold tabular-nums`}
                          style={tajawal}
                        >
                          {row.total_points}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>منافسة جديدة</DialogTitle>
          </DialogHeader>
          <GuardedForm onSubmit={createCompetition} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="new-comp-name" style={tajawal}>
                اسم المنافسة
              </Label>
              <Input
                id="new-comp-name"
                className={ds.field}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: منافسة رمضان"
                style={tajawal}
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2 sm:justify-start flex-row-reverse">
              <Button type="submit" className={cn(ds.btnRound, "rounded-full")} style={tajawal}>
                إنشاء
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(ds.btnRound, "rounded-full")}
                onClick={() => setCreateOpen(false)}
                style={tajawal}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </GuardedForm>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right sm:max-w-md")}>
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 justify-start" style={tajawal}>
              <Pencil className="w-5 h-5" />
              تعديل المنافسة
            </DialogTitle>
          </DialogHeader>
          <GuardedForm onSubmit={saveEdit} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="edit-comp-name" style={tajawal}>
                اسم المنافسة
              </Label>
              <Input
                id="edit-comp-name"
                className={ds.field}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={tajawal}
                required
              />
            </div>
            {tasks.length > 0 && (
              <div className="space-y-2">
                <Label style={tajawal}>المهام</Label>
                <div className="flex flex-wrap gap-2 justify-start">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
                      style={tajawal}
                    >
                      <span>
                        {t.title_ar}{" "}
                        <span className="text-muted-foreground">({t.weight_points})</span>
                      </span>
                      <button
                        type="button"
                        className="text-destructive hover:bg-destructive/10 rounded-full p-0.5 disabled:opacity-50"
                        title="حذف المهمة"
                        disabled={deletingTask}
                        onClick={() => deleteTask(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(ds.btnRound, "rounded-full")}
                  onClick={() => {
                    setEditOpen(false);
                    setTaskOpen(true);
                  }}
                  style={tajawal}
                >
                  <Plus className="w-4 h-4" />
                  إضافة مهمة
                </Button>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2 sm:justify-start flex-row-reverse">
              <Button
                type="submit"
                disabled={editSaving}
                className={cn(ds.btnRound, "rounded-full")}
                style={tajawal}
              >
                {editSaving ? "جاري الحفظ…" : "حفظ التعديلات"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(ds.btnRound, "rounded-full")}
                onClick={() => setEditOpen(false)}
                style={tajawal}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </GuardedForm>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>مهمة جديدة</DialogTitle>
          </DialogHeader>
          <GuardedForm onSubmit={addTask} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="task-title" style={tajawal}>
                عنوان المهمة
              </Label>
              <Input
                id="task-title"
                className={ds.field}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                style={tajawal}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-weight" style={tajawal}>
                وزن النقاط
              </Label>
              <Input
                id="task-weight"
                type="number"
                min={0.5}
                step="0.5"
                dir="ltr"
                className={ds.field}
                value={taskWeight}
                onChange={(e) => setTaskWeight(Number(e.target.value) || 1)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2 sm:justify-start flex-row-reverse">
              <Button type="submit" loading={addingTask} className={cn(ds.btnRound, "rounded-full")} style={tajawal}>
                {addingTask ? "جاري الإضافة…" : "إضافة"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(ds.btnRound, "rounded-full")}
                onClick={() => setTaskOpen(false)}
                style={tajawal}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </GuardedForm>
        </DialogContent>
      </Dialog>

      <DoubleConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف المنافسة"
        description={
          activeCompetition
            ? `هل تريد حذف «${activeCompetition.name_ar}» وجميع مهامها ونقاطها؟ لا يمكن التراجع.`
            : "هل تريد حذف هذه المنافسة وجميع سجلاتها؟"
        }
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={deleteCompetition}
      />
    </div>
  );
}
