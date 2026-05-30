import { useCallback, useEffect, useState } from "react";
import { Medal, Plus, Trash2, Trophy } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<
    Array<{ id: number; title_ar: string; weight_points: number }>
  >([]);
  const [students, setStudents] = useState<Array<{ id: number; full_name_ar: string }>>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [tab, setTab] = useState<"scores" | "leaderboard">("scores");
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
  }, [selectedId]);

  const loadDetail = useCallback(async (id: number) => {
    if (!canUseApi()) return;
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
      await loadDetail(res.id);
      setSuccess("تم إنشاء المنافسة مع مهام افتراضية.");
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

  async function deleteTask(taskId: number) {
    if (selectedId == null) return;
    if (!window.confirm("حذف هذه المهمة وجميع نقاطها؟")) return;
    try {
      await api.eduDeptTeacherCompetitionDeleteTask(selectedId, taskId);
      await loadDetail(selectedId);
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
    if (selectedId == null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = Object.entries(scores).map(([key, points]) => {
        const [taskId, studentId] = key.split("-").map(Number);
        return { task_id: taskId, student_id: studentId, points: Number(points) || 0 };
      });
      await api.eduDeptTeacherCompetitionSaveScores(selectedId, payload);
      setSuccess("تم حفظ النقاط.");
      await loadDetail(selectedId);
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
            منافسات مع مهام جاهزة — رصد النقاط ومتابعة لوحة الصدارة.
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
        {selectedId != null && tab === "scores" && (
          <div className="flex gap-2 items-end flex-wrap">
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

      {selectedId != null && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "scores" | "leaderboard")}>
          <TabsList className={ds.btnRound}>
            <TabsTrigger value="scores" style={tajawal}>
              رصد النقاط
            </TabsTrigger>
            <TabsTrigger value="leaderboard" style={tajawal}>
              <Medal className="w-4 h-4 ml-1 inline" />
              لوحة الصدارة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-4 space-y-4">
            {tasks.length > 0 && (
              <div className={`${ds.card} p-4 flex flex-wrap gap-2`}>
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm"
                    style={tajawal}
                  >
                    <span>
                      {t.title_ar}{" "}
                      <span className="text-muted-foreground">({t.weight_points})</span>
                    </span>
                    <button
                      type="button"
                      className="text-destructive hover:bg-destructive/10 rounded p-0.5"
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
              <div className={`${ds.card} overflow-x-auto`}>
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
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-4">
            <div className={ds.card}>
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
                          {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
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
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
