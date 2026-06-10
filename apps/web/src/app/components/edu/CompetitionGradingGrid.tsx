import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { api } from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import { ds, tajawal } from "../../lib/design-system";

type TaskCol = {
  id: number;
  name_ar: string;
  weight: number;
  type: "addition" | "deduction";
};

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  target_amount: number;
  achieved_amount: number;
};

type Props = {
  competitionId: number;
};

function scoreKey(studentId: number, taskId: number) {
  return `${studentId}:${taskId}`;
}

function TaskScoreCell({
  task,
  value,
  onChange,
}: {
  task: TaskCol;
  value: number;
  onChange: (next: number) => void;
}) {
  if (task.type === "addition") {
    const checked = value > 0;
    return (
      <div className="flex flex-col items-center gap-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="size-5 rounded border-border cursor-pointer"
          aria-label={task.name_ar}
        />
        {checked && (
          <span className="text-[10px] text-emerald-600 tabular-nums">+{task.weight}</span>
        )}
      </div>
    );
  }

  const count = Math.max(0, Math.round(value));
  const totalPenalty = count * task.weight;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-7 w-7 rounded-full"
          disabled={count <= 0}
          onClick={() => onChange(count - 1)}
          aria-label="إنقاص"
        >
          <Minus className="w-3 h-3" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{count}</span>
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => onChange(count + 1)}
          aria-label="زيادة"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {count > 0 && (
        <span className="text-[10px] text-destructive tabular-nums">−{totalPenalty}</span>
      )}
    </div>
  );
}

export function CompetitionGradingGrid({ competitionId }: Props) {
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tasks, setTasks] = useState<TaskCol[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.competitionsGradingGet(competitionId, logDate);
      setTasks(
        (res.tasks ?? []).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
          weight: Number(t.weight ?? 1),
          type: t.type === "deduction" ? "deduction" : "addition",
        })),
      );
      setStudents(
        (res.students ?? []).map((s) => ({
          student_id: Number(s.student_id),
          full_name_ar: String(s.full_name_ar),
          target_amount: Number(s.target_amount ?? 0),
          achieved_amount: Number(s.achieved_amount ?? 0),
        })),
      );
      setScores(res.scores ?? {});
      const targetMap: Record<number, number> = {};
      for (const s of res.students ?? []) {
        targetMap[Number(s.student_id)] = Number(s.target_amount ?? 0);
      }
      setTargets(targetMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل شبكة الرصد");
    } finally {
      setLoading(false);
    }
  }, [competitionId, logDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => students.filter((s) => matchesArabicName(query, s.full_name_ar)),
    [students, query],
  );

  function patchScore(studentId: number, taskId: number, value: number) {
    setScores((prev) => ({ ...prev, [scoreKey(studentId, taskId)]: value }));
  }

  function patchTarget(studentId: number, value: number) {
    setTargets((prev) => ({ ...prev, [studentId]: value }));
  }

  async function saveGrading() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const records: Array<{ student_id: number; task_id: number; points: number }> = [];
      for (const student of students) {
        for (const task of tasks) {
          const key = scoreKey(student.student_id, task.id);
          const raw = Number(scores[key] ?? 0);
          records.push({
            student_id: student.student_id,
            task_id: task.id,
            points: task.type === "addition" ? (raw > 0 ? 1 : 0) : Math.max(0, Math.round(raw)),
          });
        }
      }
      const targetUpdates = students
        .filter((s) => targets[s.student_id] != null)
        .map((s) => ({
          student_id: s.student_id,
          target_amount: Number(targets[s.student_id] ?? 0),
        }));

      await api.competitionsGradingSave(competitionId, {
        log_date: logDate,
        records,
        targets: targetUpdates,
      });
      setSuccess("تم حفظ الرصد بنجاح.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الرصد");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label style={tajawal}>تاريخ الرصد</Label>
          <Input
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            className={ds.btnRound}
          />
        </div>
        <Button type="button" variant="outline" className={ds.btnRound} onClick={() => void load()} style={tajawal}>
          تحميل
        </Button>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="بحث عن طالب…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${ds.btnRound} pr-10`}
            style={tajawal}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground" style={tajawal}>
          جاري التحميل…
        </p>
      ) : tasks.length === 0 ? (
        <p className={ds.alert.info} style={tajawal}>
          أضف مهام المنافسة أولاً من تبويب «المهام والأوزان».
        </p>
      ) : students.length === 0 ? (
        <p className={ds.alert.info} style={tajawal}>
          لا مستهدفين في هذه المنافسة.
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[70vh] border rounded-xl">
          <Table className={`${ds.tableMin} text-right edu-recitation-grid`}>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className={ds.table.head} style={tajawal}>
                  الطالب
                </TableHead>
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  المستهدف
                </TableHead>
                {tasks.map((task) => (
                  <TableHead
                    key={task.id}
                    className={`${ds.table.head} text-center min-w-[96px]`}
                    style={tajawal}
                    title={`وزن ${task.weight}`}
                  >
                    {task.name_ar}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {task.type === "deduction" ? `خصم ×${task.weight}` : `إضافة +${task.weight}`}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => (
                <TableRow key={student.student_id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {student.full_name_ar}
                  </TableCell>
                  <TableCell className={`${ds.table.cell} text-center`}>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={targets[student.student_id] ?? student.target_amount}
                      onChange={(e) =>
                        patchTarget(student.student_id, Number(e.target.value))
                      }
                      className={`${ds.btnRound} h-8 w-20 mx-auto text-center text-sm`}
                    />
                  </TableCell>
                  {tasks.map((task) => {
                    const key = scoreKey(student.student_id, task.id);
                    const raw = Number(scores[key] ?? 0);
                    const displayValue =
                      task.type === "addition" ? (raw > 0 ? 1 : 0) : Math.max(0, Math.round(raw));
                    return (
                      <TableCell key={task.id} className={`${ds.table.cell} text-center`}>
                        <TaskScoreCell
                          task={task}
                          value={displayValue}
                          onChange={(v) => patchScore(student.student_id, task.id, v)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && tasks.length > 0 && students.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            className={ds.btnRound}
            disabled={saving}
            onClick={() => void saveGrading()}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : "حفظ الرصد"}
          </Button>
        </div>
      )}
    </div>
  );
}
