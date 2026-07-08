import { useCallback, useEffect, useMemo, useState } from "react";
import { todayRiyadhIso } from "../../lib/today-riyadh-iso";
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
import { ActiveDayTabs } from "./ActiveDayTabs";
import { SirdPeriodGrid } from "./SirdPeriodGrid";
import { TaskInputCell, type TaskInputCol } from "./TaskInputCell";
import { api } from "../../lib/api-client";
import { matchesArabicName } from "../../lib/attendance-search";
import {
  computeSirdPeriodScore,
  DEFAULT_SIRD_SETTINGS,
  defaultActiveLogDate,
  enumerateActiveCompetitionDates,
  gradingScoreKey,
  isMemorizationTrackingCategory,
  isRecitationCategory,
  isReviewCategory,
  parseActiveWeekdays,
  resolveTaskInputType,
  type CompetitionCategory,
  type SirdPeriodData,
  type SirdSettings,
} from "../../lib/competition-engine";
import { ds, tajawal } from "../../lib/design-system";

type StudentRow = {
  student_id: number;
  full_name_ar: string;
  target_amount: number;
  achieved_amount: number;
  current_memorization?: number;
  daily_faces?: number;
};

type Props = {
  competitionId: number;
};

function normalizePoints(task: TaskInputCol, raw: number): number {
  const inputType = resolveTaskInputType(task);
  if (inputType === "boolean") return raw > 0 ? 1 : 0;
  if (inputType === "numeric") return Math.max(0, Number(raw) || 0);
  return Math.max(0, Math.round(raw));
}

function mapSirdPeriods(
  raw: Record<string, Array<Record<string, unknown>>> | undefined,
  studentId: number,
): Record<number, SirdPeriodData> {
  const list = raw?.[String(studentId)] ?? [];
  const out: Record<number, SirdPeriodData> = {};
  for (const p of list) {
    const idx = Number(p.period_index);
    if (!idx) continue;
    out[idx] = {
      period_index: idx,
      hizb_number: Number(p.hizb_number ?? 0),
      mistakes_count: Number(p.mistakes_count ?? 0),
      warnings_count: Number(p.warnings_count ?? 0),
      is_passed: Boolean(p.is_passed),
      score: p.score != null ? Number(p.score) : null,
    };
  }
  return out;
}

export function CompetitionGradingGrid({ competitionId }: Props) {
  const [logDate, setLogDate] = useState(() => todayRiyadhIso());
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [gradedDates, setGradedDates] = useState<string[]>([]);
  const [category, setCategory] = useState<CompetitionCategory>("recitation");
  const [competitionDays, setCompetitionDays] = useState(1);
  const [sirdSettings, setSirdSettings] = useState<SirdSettings>({
    ...DEFAULT_SIRD_SETTINGS,
  });
  const [tasks, setTasks] = useState<TaskInputCol[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [dayAchievement, setDayAchievement] = useState<Record<number, number>>({});
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [sirdPeriods, setSirdPeriods] = useState<
    Record<number, Record<number, SirdPeriodData>>
  >({});
  const [query, setQuery] = useState("");
  const [recitationStudentId, setRecitationStudentId] = useState<number | null>(null);
  const [activePeriod, setActivePeriod] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.competitionsGradingGet(competitionId, logDate);
      setCategory((res.category as CompetitionCategory) ?? "recitation");
      setCompetitionDays(Number(res.competition_days ?? 1));
      const apiDates = Array.isArray(res.active_dates)
        ? (res.active_dates as string[])
        : [];
      const startDate = String(res.start_date ?? logDate);
      const endDate = String(res.end_date ?? logDate);
      const weekdays = parseActiveWeekdays(
        res.active_weekdays != null
          ? { active_weekdays: res.active_weekdays as number[] }
          : null,
      );
      const dates =
        apiDates.length > 0
          ? apiDates
          : isMemorizationTrackingCategory(String(res.category ?? "recitation"))
            ? enumerateActiveCompetitionDates(startDate, endDate, weekdays)
            : [];
      setActiveDates(dates);
      setGradedDates(
        Array.isArray(res.graded_dates) ? (res.graded_dates as string[]) : [],
      );
      const resolvedLogDate = res.log_date
        ? String(res.log_date)
        : defaultActiveLogDate(dates, logDate);
      if (dates.length) {
        setLogDate(dates.includes(resolvedLogDate) ? resolvedLogDate : defaultActiveLogDate(dates));
      } else if (res.log_date) {
        setLogDate(String(res.log_date));
      }
      if (res.sird_settings) {
        setSirdSettings({
          base_hizb_score: Number(
            res.sird_settings.base_hizb_score ?? DEFAULT_SIRD_SETTINGS.base_hizb_score,
          ),
          mistake_deduction: Number(
            res.sird_settings.mistake_deduction ?? DEFAULT_SIRD_SETTINGS.mistake_deduction,
          ),
          warning_deduction: Number(
            res.sird_settings.warning_deduction ?? DEFAULT_SIRD_SETTINGS.warning_deduction,
          ),
          pass_threshold: Number(
            res.sird_settings.pass_threshold ?? DEFAULT_SIRD_SETTINGS.pass_threshold,
          ),
        });
      }
      setTasks(
        (res.tasks as Array<Record<string, unknown>>).map((t) => ({
          id: Number(t.id),
          name_ar: String(t.name_ar),
          weight: Number(t.weight ?? 1),
          type: t.type === "deduction" ? "deduction" : "addition",
          input_type: t.input_type != null ? String(t.input_type) : undefined,
        })),
      );
      setStudents(
        (res.students ?? []).map((s) => ({
          student_id: Number(s.student_id),
          full_name_ar: String(s.full_name_ar),
          target_amount: Number(s.target_amount ?? 0),
          achieved_amount: Number(s.achieved_amount ?? 0),
          current_memorization: Number(s.current_memorization ?? 0),
          daily_faces: s.daily_faces != null ? Number(s.daily_faces) : undefined,
        })),
      );
      setScores(res.scores ?? {});
      const dayMap: Record<number, number> = {};
      for (const [sid, val] of Object.entries(res.day_achievement ?? {})) {
        dayMap[Number(sid)] = Number(val ?? 0);
      }
      setDayAchievement(dayMap);
      const periodMap: Record<number, Record<number, SirdPeriodData>> = {};
      for (const s of res.students ?? []) {
        const sid = Number(s.student_id);
        periodMap[sid] = mapSirdPeriods(res.sird_periods, sid);
      }
      setSirdPeriods(periodMap);
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

  const recitationStudent = recitationStudentId
    ? students.find((s) => s.student_id === recitationStudentId)
    : null;

  function patchScore(studentId: number, taskId: number, value: number) {
    setScores((prev) => ({
      ...prev,
      [gradingScoreKey(studentId, taskId)]: value,
    }));
  }

  function patchTarget(studentId: number, value: number) {
    setTargets((prev) => ({ ...prev, [studentId]: value }));
  }

  function patchDayAchievement(studentId: number, value: number) {
    setDayAchievement((prev) => ({ ...prev, [studentId]: value }));
  }

  function dayAchievementPayload(studentIds: number[]) {
    return studentIds.map((student_id) => ({
      student_id,
      juz_done: Number(dayAchievement[student_id] ?? 0),
    }));
  }

  function patchSirdPeriod(
    studentId: number,
    periodIndex: number,
    patch: Partial<SirdPeriodData>,
  ) {
    setSirdPeriods((prev) => {
      const cur = prev[studentId]?.[periodIndex] ?? {
        period_index: periodIndex,
        hizb_number: 0,
        mistakes_count: 0,
        warnings_count: 0,
        is_passed: false,
        score: null,
      };
      const next = { ...cur, ...patch };
      const { score, is_passed } = computeSirdPeriodScore(
        next.mistakes_count,
        next.warnings_count,
        sirdSettings,
      );
      return {
        ...prev,
        [studentId]: {
          ...(prev[studentId] ?? {}),
          [periodIndex]: { ...next, score, is_passed },
        },
      };
    });
  }

  function buildStudentRecords(studentId: number) {
    return tasks.map((task) => {
      const key = gradingScoreKey(studentId, task.id);
      const raw = Number(scores[key] ?? 0);
      return {
        student_id: studentId,
        task_id: task.id,
        points: normalizePoints(task, raw),
      };
    });
  }

  function markDayGraded(date: string) {
    setGradedDates((prev) =>
      prev.includes(date) ? prev : [...prev, date].sort(),
    );
  }

  async function saveStudentGrading(studentId: number) {
    setSavingStudentId(studentId);
    setError(null);
    setSuccess(null);
    try {
      await api.competitionsGradingSave(competitionId, {
        log_date: logDate,
        records: buildStudentRecords(studentId),
        targets: [
          {
            student_id: studentId,
            target_amount: Number(targets[studentId] ?? 0),
          },
        ],
        ...(isMemorizationTrackingCategory(category)
          ? { day_achievement: dayAchievementPayload([studentId]) }
          : {}),
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.student_id === studentId
            ? { ...s, target_amount: Number(targets[studentId] ?? s.target_amount) }
            : s,
        ),
      );
      markDayGraded(logDate);
      setSuccess("تم حفظ رصد الطالب.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الرصد");
    } finally {
      setSavingStudentId(null);
    }
  }

  async function saveGrading() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isRecitationCategory(category) && recitationStudentId && activePeriod) {
        const period = sirdPeriods[recitationStudentId]?.[activePeriod];
        if (!period) return;
        await api.competitionsGradingSave(competitionId, {
          log_date: logDate,
          records: [],
          sird_records: [
            {
              student_id: recitationStudentId,
              period_index: activePeriod,
              hizb_number: period.hizb_number,
              mistakes_count: period.mistakes_count,
              warnings_count: period.warnings_count,
            },
          ],
        });
      } else {
        const records: Array<{
          student_id: number;
          task_id: number;
          points: number;
        }> = [];
        for (const student of students) {
          records.push(...buildStudentRecords(student.student_id));
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
          ...(isMemorizationTrackingCategory(category)
            ? { day_achievement: dayAchievementPayload(students.map((s) => s.student_id)) }
            : {}),
        });
      }
      markDayGraded(logDate);
      setSuccess("تم حفظ الرصد بنجاح.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الرصد");
    } finally {
      setSaving(false);
    }
  }

  const showDailyColumn = isMemorizationTrackingCategory(category);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
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

      <div className="flex flex-wrap gap-3 items-end rounded-2xl border border-border bg-muted/30 p-4">
        {isMemorizationTrackingCategory(category) && activeDates.length > 0 ? (
          <div className="space-y-2 w-full md:max-w-xs">
            <Label style={tajawal}>يوم التسميع</Label>
            <ActiveDayTabs
              activeDates={activeDates}
              selectedDate={logDate}
              gradedDates={gradedDates}
              disabled={loading || saving || savingStudentId != null}
              onSelect={(d) => {
                setLogDate(d);
              }}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label style={tajawal}>تاريخ الرصد</Label>
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className={ds.btnRound}
            />
          </div>
        )}
        <Button type="button" variant="outline" className={ds.btnRound} onClick={() => void load()} style={tajawal}>
          تحميل
        </Button>
        {!isRecitationCategory(category) && (
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
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground" style={tajawal}>
          جاري التحميل…
        </p>
      ) : students.length === 0 ? (
        <p className={ds.alert.info} style={tajawal}>
          لا مستهدفين في هذه المنافسة.
        </p>
      ) : isRecitationCategory(category) ? (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="اختر طالبًا للسرد…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${ds.btnRound} pr-10`}
              style={tajawal}
            />
          </div>
          {query.trim() && (
            <div className="flex flex-wrap gap-2">
              {filtered.map((s) => (
                <Button
                  key={s.student_id}
                  type="button"
                  variant={recitationStudentId === s.student_id ? "default" : "outline"}
                  className={ds.btnRound}
                  onClick={() => {
                    setRecitationStudentId(s.student_id);
                    setActivePeriod(null);
                    setQuery(s.full_name_ar);
                  }}
                  style={tajawal}
                >
                  {s.full_name_ar}
                </Button>
              ))}
            </div>
          )}
          {recitationStudent && (
            <>
              <p className="text-sm text-muted-foreground" style={tajawal}>
                {recitationStudent.full_name_ar} · {competitionDays} فترة
              </p>
              <SirdPeriodGrid
                totalPeriods={competitionDays}
                activePeriod={activePeriod}
                periods={sirdPeriods[recitationStudent.student_id] ?? {}}
                settings={sirdSettings}
                disabled={saving}
                onSelectPeriod={setActivePeriod}
                onPatchPeriod={(period, patch) =>
                  patchSirdPeriod(recitationStudent.student_id, period, patch)
                }
              />
            </>
          )}
        </div>
      ) : tasks.length === 0 ? (
        <p className={ds.alert.info} style={tajawal}>
          أضف مهام المنافسة أولاً من تبويب «المهام والأوزان».
        </p>
      ) : (
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
                const rowDisabled =
                  saving || savingStudentId === student.student_id;
                return (
                <TableRow key={student.student_id} className="hover:bg-muted/30">
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {student.full_name_ar}
                  </TableCell>
                  <TableCell className={`${ds.table.cell} text-center`}>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      disabled={rowDisabled}
                      value={targets[student.student_id] ?? student.target_amount}
                      onChange={(e) =>
                        patchTarget(student.student_id, Number(e.target.value))
                      }
                      className={`${ds.btnRound} h-8 w-20 mx-auto text-center text-sm tabular-nums`}
                    />
                  </TableCell>
                  {showDailyColumn && (
                    <TableCell className={`${ds.table.cell} text-center tabular-nums text-muted-foreground`}>
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
                        value={dayAchievement[student.student_id] ?? 0}
                        onChange={(e) =>
                          patchDayAchievement(
                            student.student_id,
                            Number(e.target.value) || 0,
                          )
                        }
                        className={`${ds.btnRound} h-8 w-20 mx-auto text-center text-sm tabular-nums`}
                      />
                    </TableCell>
                  )}
                  {tasks.map((task) => {
                    const key = gradingScoreKey(student.student_id, task.id);
                    const raw = Number(scores[key] ?? 0);
                    return (
                      <TableCell key={task.id} className={`${ds.table.cell} text-center`}>
                        <TaskInputCell
                          task={task}
                          value={raw}
                          compact
                          disabled={rowDisabled}
                          onChange={(v) => patchScore(student.student_id, task.id, v)}
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
                      onClick={() => void saveStudentGrading(student.student_id)}
                      style={tajawal}
                    >
                      {savingStudentId === student.student_id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "حفظ"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && filtered.length === 0 && students.length > 0 && !isRecitationCategory(category) && tasks.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-4" style={tajawal}>
          لا يوجد طالب مطابق للبحث.
        </p>
      )}

      {!loading && students.length > 0 && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            type="button"
            className={ds.btnRound}
            disabled={
              saving ||
              savingStudentId != null ||
              (isRecitationCategory(category)
                ? !recitationStudentId || !activePeriod
                : tasks.length === 0)
            }
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
