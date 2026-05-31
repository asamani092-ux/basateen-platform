import { useCallback, useEffect, useMemo, useState } from "react";
import { Medal, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { TableIconAction } from "../../components/admin/TableIconAction";
import { DoubleConfirmDialog } from "../../components/shared/DoubleConfirmDialog";
import { Button } from "../../components/ui/button";
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
import { ds, tajawal } from "../../lib/design-system";

type Comp = { id: number; name_ar: string; start_date: string | null; end_date: string | null };

type LeaderRow = {
  rank: number;
  student_id: number;
  full_name_ar: string;
  total_points: number;
};

export function TeacherCompetitionsPage() {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : "فشل التحميل");
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
      setError(e instanceof Error ? e.message : "فشل تحميل التفاصيل");
    } finally {
      setDetailLoading(false);
    }
  }, []);

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
    setSuccess(null);
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
      setSuccess("تم إنشاء المنافسة مع مهام افتراضية.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
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
      setSuccess("تم تحديث المنافسة.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCompetition() {
    if (activeCompetitionId == null) return;
    const deletedId = activeCompetitionId;
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
    setSuccess("تم حذف المنافسة وجميع سجلاتها.");
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
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
      setError(err instanceof Error ? err.message : "فشل إضافة المهمة");
    }
  }

  async function deleteTask(taskId: number) {
    if (activeCompetitionId == null) return;
    if (!window.confirm("حذف هذه المهمة وجميع نقاطها؟")) return;
    try {
      await api.eduDeptTeacherCompetitionDeleteTask(activeCompetitionId, taskId);
      await loadDetail(activeCompetitionId);
      setSuccess("تم حذف المهمة.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحذف");
    }
  }

  function scoreKey(taskId: number, studentId: number) {
    return `${taskId}-${studentId}`;
  }

  function setScore(taskId: number, studentId: number, value: number) {
    setScores((prev) => ({ ...prev, [scoreKey(taskId, studentId)]: value }));
  }

  async function saveScores() {
    if (activeCompetitionId == null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = Object.entries(scores).map(([key, points]) => {
        const [taskId, studentId] = key.split("-").map(Number);
        return { task_id: taskId, student_id: studentId, points: Number(points) || 0 };
      });
      await api.eduDeptTeacherCompetitionSaveScores(activeCompetitionId, payload);
      setSuccess("تم حفظ النقاط.");
      await loadDetail(activeCompetitionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-6 max-w-[1400px] text-right">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
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

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}
      {success && (
        <p className={ds.alert.success} style={tajawal}>
          {success}
        </p>
      )}

      <div className={`${ds.card} p-4 space-y-3 text-right`} dir="rtl">
        <Label style={tajawal}>المنافسة النشطة</Label>
        <div className="flex flex-wrap items-end gap-3">
          <select
            className={`${ds.select} min-w-[220px] max-w-full flex-1`}
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
              className={cn(ds.btnRound, "rounded-full")}
              disabled={saving || tasks.length === 0}
              onClick={() => saveScores()}
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
            className="inline-flex flex-row-reverse items-center gap-1 rounded-full border border-border bg-muted/40 p-1"
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
                        className="text-destructive hover:bg-destructive/10 rounded-full p-0.5"
                        title="حذف المهمة"
                        onClick={() => deleteTask(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {tasks.length > 0 && students.length > 0 ? (
                <div className={`${ds.card} overflow-x-auto text-right`} dir="rtl">
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
                        <TableCell className={ds.table.cell} style={tajawal}>
                          {row.full_name_ar}
                        </TableCell>
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
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>منافسة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCompetition} className="space-y-4 text-right">
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
          </form>
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
          <form onSubmit={saveEdit} className="space-y-4 text-right">
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
                        className="text-destructive hover:bg-destructive/10 rounded-full p-0.5"
                        title="حذف المهمة"
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
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent dir="rtl" className={cn(ds.dialog, "text-right")}>
          <DialogHeader className="text-right">
            <DialogTitle style={tajawal}>مهمة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={addTask} className="space-y-4 text-right">
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
              <Button type="submit" className={cn(ds.btnRound, "rounded-full")} style={tajawal}>
                إضافة
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
          </form>
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
