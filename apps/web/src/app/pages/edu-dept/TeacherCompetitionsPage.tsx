import { useCallback, useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { ds, tajawal } from "../../lib/design-system";

type Comp = { id: number; name_ar: string; start_date: string | null; end_date: string | null };

export function TeacherCompetitionsPage() {
  const [items, setItems] = useState<Comp[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<
    Array<{ id: number; title_ar: string; weight_points: number }>
  >([]);
  const [students, setStudents] = useState<Array<{ id: number; full_name_ar: string }>>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskWeight, setTaskWeight] = useState(1);

  const loadList = useCallback(async () => {
    if (!canUseApi()) return;
    setLoading(true);
    try {
      const res = await api.eduDeptTeacherCompetitionsList();
      setItems(res.items);
      if (res.items.length && selectedId == null) setSelectedId(res.items[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    if (!canUseApi()) return;
    try {
      const res = await api.eduDeptTeacherCompetitionDetail(id);
      setTasks(res.tasks);
      setStudents(res.students);
      const map: Record<string, number> = {};
      for (const s of res.scores) {
        map[`${s.task_id}-${s.student_id}`] = s.points;
      }
      setScores(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل التفاصيل");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function createCompetition(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const res = await api.eduDeptTeacherCompetitionCreate({ name_ar: newName.trim() });
      setCreateOpen(false);
      setNewName("");
      setSelectedId(res.id);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId == null || !taskTitle.trim()) return;
    try {
      await api.eduDeptTeacherCompetitionAddTask(selectedId, {
        title_ar: taskTitle.trim(),
        weight_points: taskWeight,
      });
      setTaskOpen(false);
      setTaskTitle("");
      setTaskWeight(1);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إضافة المهمة");
    }
  }

  function scoreKey(taskId: number, studentId: number) {
    return `${taskId}-${studentId}`;
  }

  function setScore(taskId: number, studentId: number, value: number) {
    setScores((prev) => ({ ...prev, [scoreKey(taskId, studentId)]: value }));
  }

  async function saveScores() {
    if (selectedId == null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = Object.entries(scores).map(([key, points]) => {
        const [taskId, studentId] = key.split("-").map(Number);
        return { task_id: taskId, student_id: studentId, points };
      });
      await api.eduDeptTeacherCompetitionSaveScores(selectedId, payload);
      setSuccess("تم حفظ النقاط.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <Trophy className="w-7 h-7 text-primary" />
            منافسات الحلقة
          </h2>
          <p className={ds.page.description} style={tajawal}>
            بيئة معزولة لحوافز حلقتك — منافسات ومهام ونقاط يدوية.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          className={ds.btnRound}
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

      <div className="flex flex-wrap gap-4">
        <div className={`${ds.card} p-4 min-w-[200px]`}>
          <Label style={tajawal}>المنافسة</Label>
          <select
            className={`${ds.select} mt-2`}
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value) || null)}
            style={tajawal}
          >
            <option value="">— اختر —</option>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </select>
          {loading && (
            <p className="text-xs text-muted-foreground mt-2" style={tajawal}>
              جاري التحميل…
            </p>
          )}
        </div>
        {selectedId != null && (
          <div className="flex gap-2 items-end">
            <Button
              type="button"
              variant="outline"
              className={ds.btnRound}
              onClick={() => setTaskOpen(true)}
              style={tajawal}
            >
              <Plus className="w-4 h-4" />
              مهمة
            </Button>
            <Button
              type="button"
              variant="default"
              className={ds.btnRound}
              disabled={saving || tasks.length === 0}
              onClick={() => saveScores()}
              style={tajawal}
            >
              {saving ? "جاري الحفظ…" : "حفظ النقاط"}
            </Button>
          </div>
        )}
      </div>

      {selectedId != null && tasks.length > 0 && students.length > 0 && (
        <div className={`${ds.card} overflow-x-auto`}>
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} sticky right-0 bg-card z-10 min-w-[140px]`} style={tajawal}>
                  الطالب
                </TableHead>
                {tasks.map((t) => (
                  <TableHead key={t.id} className={`${ds.table.head} min-w-[100px] text-center`} style={tajawal}>
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
                  <TableCell className={`${ds.table.cell} sticky right-0 bg-card font-medium`} style={tajawal}>
                    {st.full_name_ar}
                  </TableCell>
                  {tasks.map((t) => (
                    <TableCell key={t.id} className={ds.table.cell}>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
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
      )}

      {selectedId != null && tasks.length === 0 && (
        <p className={ds.alert.info} style={tajawal}>
          أضف مهاماً للمنافسة ثم رصد نقاط الطلاب.
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>منافسة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={createCompetition} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>اسم المنافسة</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={ds.btnRound}
                required
              />
            </div>
            <Button type="submit" className={`w-full ${ds.btnRound}`} style={tajawal}>
              إنشاء
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className={`${ds.card} max-w-md rounded-2xl`} dir="rtl">
          <DialogHeader>
            <DialogTitle style={tajawal}>مهمة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={addTask} className="space-y-4">
            <div className="space-y-2">
              <Label style={tajawal}>عنوان المهمة</Label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className={ds.btnRound}
                required
              />
            </div>
            <div className="space-y-2">
              <Label style={tajawal}>الوزن / النقاط</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={taskWeight}
                onChange={(e) => setTaskWeight(Number(e.target.value))}
                className={ds.btnRound}
              />
            </div>
            <Button type="submit" className={`w-full ${ds.btnRound}`} style={tajawal}>
              إضافة
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
