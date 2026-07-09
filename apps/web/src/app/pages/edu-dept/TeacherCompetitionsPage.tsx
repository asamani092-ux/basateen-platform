import { GuardedForm } from "../../components/ui/guarded-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "../../lib/query-keys";
import { RecitationTableSkeleton } from "../../components/shared/RecitationTableSkeleton";
import { TaskInputCell, type TaskInputCol } from "../../components/edu/TaskInputCell";
import {
  normalizeTaskInput,
  signedTaskPoints,
  TEACHER_TASK_INPUT_OPTIONS,
  TEACHER_TASK_TYPE_OPTIONS,
  type TaskInputType,
  type TaskType,
} from "../../lib/competition-engine";

type TeacherCompetitionTask = {
  id: number;
  title_ar: string;
  weight_points: number;
  sort_order?: number;
  type?: string;
  input_type?: string;
};

function toTaskInputCol(t: TeacherCompetitionTask): TaskInputCol {
  return {
    id: t.id,
    name_ar: t.title_ar,
    weight: t.weight_points,
    type: t.type === "deduction" ? "deduction" : "addition",
    input_type: t.input_type,
  };
}

function taskTypeLabel(type?: string): string {
  return (
    TEACHER_TASK_TYPE_OPTIONS.find((o) => o.value === type)?.label ??
    TEACHER_TASK_TYPE_OPTIONS[0].label
  );
}

function taskInputLabel(inputType?: string): string {
  return (
    TEACHER_TASK_INPUT_OPTIONS.find((o) => o.value === inputType)?.label ??
    TEACHER_TASK_INPUT_OPTIONS[0].label
  );
}

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
  const queryClient = useQueryClient();
  const [activeCompetitionId, setActiveCompetitionId] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"scores" | "leaderboard">("scores");
  const [error, setError] = useState<string | null>(null);
  const [defaultTaskWeight, setDefaultTaskWeight] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskWeight, setTaskWeight] = useState(1);
  const [taskType, setTaskType] = useState<TaskType>("addition");
  const [taskInputType, setTaskInputType] = useState<TaskInputType>("boolean");

  const listQuery = useQuery({
    queryKey: queryKeys.eduDept.teacherCompetitions,
    queryFn: () => api.eduDeptTeacherCompetitionsList(),
    enabled: canUseApi(),
    staleTime: 60_000,
  });

  const items = listQuery.data?.items ?? [];

  useEffect(() => {
    if (!listQuery.data) return;
    if (typeof listQuery.data.default_task_weight === "number") {
      setDefaultTaskWeight(listQuery.data.default_task_weight);
    }
    setActiveCompetitionId((prev) => {
      if (prev != null && listQuery.data!.items.some((c) => c.id === prev)) return prev;
      return listQuery.data!.items[0]?.id ?? null;
    });
  }, [listQuery.data]);

  useEffect(() => {
    if (listQuery.isError) {
      const msg = getFriendlyTeacherCompetitionError(listQuery.error);
      setError(msg);
      toast.error(msg);
    } else if (listQuery.isSuccess) {
      setError(null);
    }
  }, [listQuery.isError, listQuery.isSuccess, listQuery.error]);

  const detailQuery = useQuery({
    queryKey:
      activeCompetitionId != null
        ? queryKeys.eduDept.teacherCompetitionDetail(activeCompetitionId)
        : ["edu-dept", "teacher-competition", "none"],
    queryFn: async () => {
      const id = activeCompetitionId!;
      const [res, lb] = await Promise.all([
        api.eduDeptTeacherCompetitionDetail(id),
        api.eduDeptTeacherCompetitionLeaderboard(id),
      ]);
      return { detail: res, leaderboard: lb.items };
    },
    enabled: canUseApi() && activeCompetitionId != null,
    staleTime: 60_000,
  });

  const tasks = detailQuery.data?.detail.tasks ?? [];
  const students = detailQuery.data?.detail.students ?? [];
  const leaderboard = detailQuery.data?.leaderboard ?? [];

  useEffect(() => {
    const res = detailQuery.data?.detail;
    if (!res || activeCompetitionId == null) return;
    const map: Record<string, number> = {};
    for (const s of res.scores) {
      map[`${s.task_id}-${s.student_id}`] = s.points;
    }
    setScores(map);
  }, [detailQuery.data, activeCompetitionId]);

  useEffect(() => {
    if (detailQuery.isError) {
      const msg = getFriendlyTeacherCompetitionError(detailQuery.error);
      setError(msg);
      toast.error(msg);
    }
  }, [detailQuery.isError, detailQuery.error]);

  useEffect(() => {
    if (activeCompetitionId == null) {
      setScores({});
    }
  }, [activeCompetitionId]);

  const loading = listQuery.isPending && !listQuery.data;
  const detailLoading = activeCompetitionId != null && detailQuery.isPending;

  async function invalidateCompetitionQueries(competitionId?: number | null) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.eduDept.teacherCompetitions });
    if (competitionId != null) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.eduDept.teacherCompetitionDetail(competitionId),
      });
    }
  }

  /** O(T) — إدراج مهمة في كاش التفاصيل فوراً دون انتظار refetch كامل */
  function patchDetailTasksCache(
    competitionId: number,
    updater: (
      tasks: TeacherCompetitionTask[],
    ) => TeacherCompetitionTask[],
  ) {
    const key = queryKeys.eduDept.teacherCompetitionDetail(competitionId);
    queryClient.setQueryData(
      key,
      (
        prev:
          | {
              detail: {
                competition: {
                  id: number;
                  name_ar: string;
                  start_date: string | null;
                  end_date: string | null;
                };
                tasks: TeacherCompetitionTask[];
                students: Array<{ id: number; full_name_ar: string }>;
                scores: Array<{ task_id: number; student_id: number; points: number }>;
                circle_id?: number | null;
                circle_name?: string | null;
              };
              leaderboard: Array<{
                rank: number;
                student_id: number;
                full_name_ar: string;
                total_points: number;
              }>;
            }
          | undefined,
      ) => {
        if (!prev) return prev;
        return {
          ...prev,
          detail: {
            ...prev.detail,
            tasks: updater(prev.detail.tasks ?? []),
          },
        };
      },
    );
  }

  const activeCompetition = useMemo(
    () => items.find((c) => c.id === activeCompetitionId) ?? null,
    [items, activeCompetitionId],
  );

  const circleName =
    detailQuery.data?.detail.circle_name ??
    listQuery.data?.circle_name ??
    null;

  const topLeaderPoints = leaderboard[0]?.total_points ?? 0;

  const deleteTaskIdRef = useRef<number | null>(null);

  const { run: deleteCompetition } = useGuardedVoidAction(async () => {
    if (activeCompetitionId == null) return;
    const deletedId = activeCompetitionId;
    try {
      await api.eduDeptTeacherCompetitionDelete(deletedId);
      setDeleteOpen(false);
      await invalidateCompetitionQueries(deletedId);
      const res = await api.eduDeptTeacherCompetitionsList();
      const nextId = res.items[0]?.id ?? null;
      setActiveCompetitionId(nextId);
      if (nextId == null) setScores({});
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
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const payload = Object.entries(scores).flatMap(([key, raw]) => {
        const [taskId, studentId] = key.split("-").map(Number);
        const task = taskById.get(taskId);
        if (!task) return [];
        const col = toTaskInputCol(task);
        return [
          {
            task_id: taskId,
            student_id: studentId,
            points: normalizeTaskInput(col, Number(raw) || 0),
          },
        ];
      });
      await api.eduDeptTeacherCompetitionSaveScores(activeCompetitionId, payload);
      toast.success("تم حفظ النقاط.");
      // لا ننتظر refetch — وإلا يبقى زر الحفظ في حالة loading
      void invalidateCompetitionQueries(activeCompetitionId);
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
      patchDetailTasksCache(activeCompetitionId, (prev) =>
        prev.filter((t) => t.id !== taskId),
      );
      toast.success("تم حذف المهمة.");
      void invalidateCompetitionQueries(activeCompetitionId);
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
    const title = taskTitle.trim();
    const weight = taskWeight;
    const type = taskType;
    const inputType = taskInputType;
    try {
      const res = await api.eduDeptTeacherCompetitionAddTask(activeCompetitionId, {
        title_ar: title,
        weight_points: weight,
        type,
        input_type: inputType,
      });
      const newTask: TeacherCompetitionTask = {
        id: Number(res.id),
        title_ar: title,
        weight_points: weight,
        sort_order: tasks.length + 1,
        type,
        input_type: inputType,
      };
      patchDetailTasksCache(activeCompetitionId, (prev) => [...prev, newTask]);
      setTaskOpen(false);
      setTaskTitle("");
      setTaskWeight(defaultTaskWeight);
      setTaskType("addition");
      setTaskInputType("boolean");
      toast.success("تمت إضافة المهمة.");
      void invalidateCompetitionQueries(activeCompetitionId);
    } catch (err) {
      const msg = getFriendlyTeacherCompetitionError(err);
      setError(msg);
      toast.error(msg);
    }
  });

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
      await invalidateCompetitionQueries(res.id);
      toast.success("تم إنشاء المنافسة — أضف المهام يدوياً.");
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
      await invalidateCompetitionQueries(activeCompetitionId);
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

  function studentSignedTotal(stId: number): number {
    return tasks.reduce((sum, t) => {
      const raw = Number(scores[scoreKey(t.id, stId)]) || 0;
      const col = toTaskInputCol(t);
      return sum + signedTaskPoints(col, normalizeTaskInput(col, raw));
    }, 0);
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
              منافسات الحلقة — أنشئ المهام يدوياً ورصد النقاط حسب نوع كل مهمة.
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
            منافسة جديدة
          </Button>
        </div>
      )}

      {error && (
        <p className={`${ds.alert.error} print:hidden`} style={tajawal}>
          {error}
        </p>
      )}

      {loading ? (
        <RecitationTableSkeleton showFilters={false} rows={4} columns={4} />
      ) : (
        <>
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 print:hidden">
          <EduKpiCard
            compact
            icon={<Trophy className="w-3.5 h-3.5 text-primary" />}
            label="المنافسات"
            value={items.length}
            sub={activeCompetition ? activeCompetition.name_ar : "—"}
          />
          <EduKpiCard
            compact
            icon={<Medal className="w-3.5 h-3.5 text-primary" />}
            label="المهام"
            value={tasks.length}
            sub={activeCompetitionId != null ? "نشطة" : "—"}
          />
          <EduKpiCard
            compact
            icon={<Users className="w-3.5 h-3.5 text-primary" />}
            label="الطلاب"
            value={students.length}
            sub="الحلقة"
          />
          <EduKpiCard
            compact
            icon={<Medal className="w-3.5 h-3.5 text-amber-600" />}
            label="أعلى نقاط"
            value={topLeaderPoints}
            sub={leaderboard[0]?.full_name_ar ?? "—"}
            highlight={topLeaderPoints > 0}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 print:hidden" dir="rtl">
        <div className={`${ds.card} p-3 space-y-2 text-right`}>
          <Label className="text-sm" style={tajawal}>
            المنافسة النشطة
          </Label>
          <select
            className={`${ds.select} w-full text-sm`}
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
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-sm font-medium truncate" style={tajawal}>
                {activeCompetition.name_ar}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <TableIconAction kind="edit" onClick={openEdit} disabled={detailLoading} />
                <TableIconAction
                  kind="delete"
                  onClick={() => setDeleteOpen(true)}
                  disabled={detailLoading}
                />
              </div>
            </div>
          )}
        </div>

        <div className={`${ds.card} p-3 space-y-2 text-right`}>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm" style={tajawal}>
              المهام
            </Label>
            {activeCompetitionId != null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(ds.btnRound, "rounded-full h-8 px-3")}
                onClick={() => setTaskOpen(true)}
                style={tajawal}
              >
                <Plus className="w-3.5 h-3.5" />
                مهمة
              </Button>
            )}
          </div>
          {(loading || detailLoading) && activeCompetitionId != null ? (
            <p className="text-xs text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground" style={tajawal}>
              لا مهام — أضف مهمة يدوياً بعد إنشاء المنافسة.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs"
                  style={tajawal}
                >
                  <span className="truncate max-w-[140px]">
                    {t.title_ar}{" "}
                    <span className="text-muted-foreground">
                      ({t.weight_points} · {taskTypeLabel(t.type)} · {taskInputLabel(t.input_type)})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-destructive hover:bg-destructive/10 rounded-full p-0.5 disabled:opacity-50"
                    title="حذف المهمة"
                    disabled={deletingTask}
                    onClick={() => deleteTask(t.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
              ] satisfies Array<{
                id: "scores" | "leaderboard";
                label: string;
                icon?: typeof Medal;
              }>
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
            <div className="space-y-3 text-right" dir="rtl">
              {tasks.length > 0 && students.length > 0 ? (
                <>
                  {/* Desktop — wide table */}
                  <div
                    className={`${ds.card} overflow-x-auto text-right hidden md:block border border-border`}
                    dir="rtl"
                  >
                    <Table className={`${ds.tableMin} text-right`}>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead
                            className={`${ds.table.head} sticky right-0 bg-muted/40 z-10 min-w-[140px]`}
                            style={tajawal}
                          >
                            الطالب
                          </TableHead>
                          {tasks.map((t) => {
                            const col = toTaskInputCol(t);
                            return (
                            <TableHead
                              key={t.id}
                              className={`${ds.table.head} min-w-[88px] text-center`}
                              style={tajawal}
                            >
                              {t.title_ar}
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {col.type === "deduction" ? `خصم ×${t.weight_points}` : `+${t.weight_points}`}
                              </span>
                            </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((st, idx) => (
                          <TableRow
                            key={st.id}
                            className={idx % 2 === 1 ? "bg-muted/20" : undefined}
                          >
                            <TableCell
                              className={`${ds.table.cell} sticky right-0 bg-inherit font-medium`}
                              style={tajawal}
                            >
                              {st.full_name_ar}
                            </TableCell>
                            {tasks.map((t) => (
                              <TableCell key={t.id} className={`${ds.table.cell} text-center py-2`}>
                                <TaskInputCell
                                  task={toTaskInputCol(t)}
                                  value={scores[scoreKey(t.id, st.id)] ?? 0}
                                  onChange={(v) => setScore(t.id, st.id, v)}
                                  compact
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
                        const studentTotal = studentSignedTotal(st.id);
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
                                    <TaskInputCell
                                      task={toTaskInputCol(t)}
                                      value={scores[scoreKey(t.id, st.id)] ?? 0}
                                      onChange={(v) => setScore(t.id, st.id, v)}
                                      compact
                                    />
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>

                  <div className="flex justify-center pt-2 print:hidden">
                    <Button
                      type="button"
                      variant="default"
                      className={cn(
                        ds.btnRound,
                        ds.primaryActionBtn,
                        "rounded-full min-w-[10rem]",
                      )}
                      loading={saving}
                      disabled={saving || tasks.length === 0}
                      onClick={saveScores}
                      style={tajawal}
                    >
                      {saving ? "جاري الحفظ…" : "حفظ النقاط"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className={ds.alert.info} style={tajawal}>
                  {tasks.length === 0
                    ? "أنشئ منافسة جديدة ثم أضف المهام يدوياً من بطاقة المهام."
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
                {circleName ? (
                  <p className="text-sm font-medium" style={tajawal}>
                    الحلقة / المسار: {circleName}
                  </p>
                ) : null}
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
              <div className={`${ds.card} text-right border border-border`} dir="rtl">
              {leaderboard.length === 0 ? (
                <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
                  لا توجد نقاط مسجّلة بعد في هذه المنافسة.
                </p>
              ) : (
                <Table className={`${ds.tableMin} text-right`}>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
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
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right [direction:rtl]")}>
          <DialogHeader className="text-right items-stretch" dir="rtl">
            <DialogTitle className="text-right" style={tajawal}>
              مهمة جديدة
            </DialogTitle>
          </DialogHeader>
          <GuardedForm
            onSubmit={addTask}
            className="space-y-4 text-right"
            dir="rtl"
          >
            <div className="space-y-2 text-right" dir="rtl">
              <Label htmlFor="task-title" className="block text-right" style={tajawal}>
                عنوان المهمة
              </Label>
              <Input
                id="task-title"
                className={cn(ds.field, "text-right")}
                dir="rtl"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                style={tajawal}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3" dir="rtl">
              <div className="space-y-2 text-right">
                <Label htmlFor="task-type" className="block text-right" style={tajawal}>
                  نوع المهمة
                </Label>
                <select
                  id="task-type"
                  className={cn(ds.select, "text-right w-full")}
                  dir="rtl"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  style={tajawal}
                >
                  {TEACHER_TASK_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 text-right">
                <Label htmlFor="task-input-type" className="block text-right" style={tajawal}>
                  طريقة الإدخال
                </Label>
                <select
                  id="task-input-type"
                  className={cn(ds.select, "text-right w-full")}
                  dir="rtl"
                  value={taskInputType}
                  onChange={(e) => setTaskInputType(e.target.value as TaskInputType)}
                  style={tajawal}
                >
                  {TEACHER_TASK_INPUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2 text-right" dir="rtl">
              <Label htmlFor="task-weight" className="block text-right" style={tajawal}>
                وزن النقاط
              </Label>
              <Input
                id="task-weight"
                type="number"
                min={0.5}
                step="0.5"
                dir="ltr"
                className={cn(ds.field, "text-left")}
                value={taskWeight}
                onChange={(e) => setTaskWeight(Number(e.target.value) || 1)}
              />
            </div>
            <DialogFooter
              className="gap-2 sm:gap-2 sm:justify-start flex-row-reverse"
              dir="rtl"
            >
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
        </>
      )}
    </div>
  );
}
