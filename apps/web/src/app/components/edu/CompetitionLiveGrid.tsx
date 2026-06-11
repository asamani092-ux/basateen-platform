import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
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
import { matchesArabicName } from "../../lib/attendance-search";
import {
  isMemorizationTrackingCategory,
  isReviewCategory,
  type MemorizationUnit,
} from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";
import { ActiveDayTabs } from "./ActiveDayTabs";
import { TaskInputCell, type TaskInputCol } from "./TaskInputCell";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  target_amount?: number;
  daily_faces?: number;
};

type AuditRow = {
  juz_done?: number;
  task_points?: Record<number, number>;
};

type Props = {
  category: string;
  memorizationUnit: MemorizationUnit;
  students: StudentRow[];
  tasks: TaskInputCol[];
  audit: Record<number, AuditRow>;
  activeDates?: string[];
  gradedDates?: string[];
  logDate?: string;
  onLogDateChange?: (isoDate: string) => void;
  saving: boolean;
  savingStudentId?: number | null;
  onPatchStudent: (
    studentId: number,
    patch: { juz_done?: number; task_points?: Record<number, number> },
  ) => void;
  onSaveStudent: (studentId: number) => Promise<void>;
  onSaveAll: () => Promise<void>;
};

/** O(S×T) render — S students, T task columns; single scrollable grid. */
export function CompetitionLiveGrid({
  category,
  memorizationUnit,
  students,
  tasks,
  audit,
  activeDates = [],
  gradedDates = [],
  logDate = "",
  onLogDateChange,
  saving,
  savingStudentId = null,
  onPatchStudent,
  onSaveStudent,
  onSaveAll,
}: Props) {
  const [query, setQuery] = useState("");
  const unitLabel =
    isReviewCategory(category) ? "جزء" : memorizationUnit === "hizb" ? "حزب" : "جزء";
  const showDailyColumn = isMemorizationTrackingCategory(category);

  const filtered = useMemo(
    () => students.filter((s) => matchesArabicName(query, s.full_name_ar)),
    [students, query],
  );

  function patchTask(studentId: number, taskId: number, value: number) {
    const cur = audit[studentId]?.task_points ?? {};
    onPatchStudent(studentId, { task_points: { ...cur, [taskId]: value } });
  }

  function patchDailyFaces(studentId: number, value: number) {
    onPatchStudent(studentId, { juz_done: value });
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap gap-3 items-end rounded-2xl border border-border bg-muted/30 p-4">
        {showDailyColumn && activeDates.length > 0 && onLogDateChange && (
          <div className="space-y-2 w-full md:max-w-xs">
            <Label style={tajawal}>يوم التسميع</Label>
            <ActiveDayTabs
              activeDates={activeDates}
              selectedDate={logDate}
              gradedDates={gradedDates}
              disabled={saving || savingStudentId != null}
              onSelect={onLogDateChange}
            />
          </div>
        )}
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

      <div className="overflow-x-auto max-h-[70vh] rounded-2xl border border-border shadow-sm bg-card">
        <Table className={`${ds.tableMin} text-right edu-recitation-grid`}>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${ds.table.head} min-w-[140px]`} style={tajawal}>
                الطالب
              </TableHead>
              <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                {isReviewCategory(category) ? "أجزاء المراجعة" : "المستهدف"}
              </TableHead>
              {showDailyColumn && (
                <TableHead className={`${ds.table.head} text-center`} style={tajawal}>
                  وجوه/يوم
                </TableHead>
              )}
              {showDailyColumn && (
                <TableHead
                  className={`${ds.table.head} text-center min-w-[96px]`}
                  style={tajawal}
                >
                  إنجاز اليوم (وجه)
                </TableHead>
              )}
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
              <TableHead className={`${ds.table.head} text-center w-24`} style={tajawal}>
                حفظ
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((student) => {
              const rowAudit = audit[student.student_id] ?? {};
              const dailyDone = Number(rowAudit.juz_done ?? 0);
              const rowSaving = savingStudentId === student.student_id;
              const rowDisabled = saving || rowSaving;
              return (
                <TableRow key={student.student_id} className="hover:bg-muted/30">
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {student.full_name_ar}
                  </TableCell>
                  <TableCell className={`${ds.table.cell} text-center tabular-nums`}>
                    {student.target_amount ?? 0}{" "}
                    <span className="text-muted-foreground text-xs">{unitLabel}</span>
                  </TableCell>
                  {showDailyColumn && (
                    <TableCell
                      className={`${ds.table.cell} text-center tabular-nums text-muted-foreground`}
                    >
                      {student.daily_faces ?? "—"}
                    </TableCell>
                  )}
                  {showDailyColumn && (
                    <TableCell className={`${ds.table.cell} text-center`}>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        disabled={rowDisabled}
                        value={dailyDone}
                        onChange={(e) =>
                          patchDailyFaces(student.student_id, Number(e.target.value) || 0)
                        }
                        className={`${ds.btnRound} h-8 w-20 mx-auto text-center text-sm tabular-nums`}
                      />
                    </TableCell>
                  )}
                  {tasks.map((task) => {
                    const raw = Number(rowAudit.task_points?.[task.id] ?? 0);
                    return (
                      <TableCell key={task.id} className={`${ds.table.cell} text-center`}>
                        <TaskInputCell
                          task={task}
                          value={raw}
                          compact
                          disabled={rowDisabled}
                          onChange={(v) => patchTask(student.student_id, task.id, v)}
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell className={`${ds.table.cell} text-center`}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={ds.btnRound}
                      disabled={rowDisabled || savingStudentId != null}
                      onClick={() => void onSaveStudent(student.student_id)}
                      style={tajawal}
                    >
                      {rowSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length === 0 && (
        <p className={`${ds.alert.info} text-center`} style={tajawal}>
          {students.length === 0
            ? "لا مستهدفين في هذه المنافسة."
            : "لا يوجد طالب مطابق للبحث."}
        </p>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          className={ds.btnRound}
          disabled={saving || savingStudentId != null || filtered.length === 0}
          onClick={() => void onSaveAll()}
          style={tajawal}
        >
          {saving ? "جاري الحفظ…" : "حفظ الكل"}
        </Button>
      </div>
    </div>
  );
}
