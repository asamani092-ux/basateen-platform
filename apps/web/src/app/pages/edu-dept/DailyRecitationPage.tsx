import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatGregorianAr,
  formatHijriUmalqura,
  todayRiyadhIso,
} from "../../lib/today-riyadh-iso";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { GuardedForm } from "../../components/ui/guarded-form";
import {
  ClipboardList,
  Grid3X3,
  LayoutGrid,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { TableActionsCell } from "../../components/admin/TableIconAction";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import {
  QuranicInputCell,
  type QuranicUnit,
} from "../../components/ui/QuranicInputCell";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import { TaskInputCell, type TaskInputCol } from "../../components/edu/TaskInputCell";
import {
  activeCriteria,
  computeQualityFromCriteria,
  emptyTaskScores,
  type EvalCriterion,
} from "../../lib/evaluation-criteria";
import { ds, tajawal } from "../../lib/design-system";
import { cn } from "../../components/ui/utils";
import { StudentTrackBadge } from "../../components/edu/StudentTrackBadge";
import { StudentCircleBadge } from "../../components/edu/StudentCircleBadge";
import { queryKeys } from "../../lib/query-keys";
import { RecitationTableSkeleton } from "../../components/shared/RecitationTableSkeleton";
import { teacherBootstrapToRecitationPayload } from "../../lib/teacher-bootstrap";

type Row = {
  student_id: number;
  full_name_ar: string;
  track_name?: string | null;
  circle_name?: string | null;
  admin_present?: boolean;
  task_scores: Record<string, boolean | number>;
  notes: string;
};

type ViewMode = "grid" | "cards";

const SUPERVISOR_ROLES = new Set([
  "edu_supervisor",
  "super_admin",
  "programs_supervisor",
  "track_supervisor",
]);

function applyDependentScores(
  taskScores: Record<string, boolean | number>,
  criteria: EvalCriterion[],
): Record<string, boolean | number> {
  const next = { ...taskScores };
  for (const c of criteria) {
    if (c.requires_all?.length) {
      next[c.id] = c.requires_all.every((id) => Boolean(next[id]));
    }
  }
  return next;
}

function normalizeRow(
  item: {
    student_id: number;
    full_name_ar: string;
    track_name?: string | null;
    circle_name?: string | null;
    admin_present?: boolean;
    task_scores?: Record<string, boolean | number>;
    notes?: string;
    listened?: boolean;
    repeated?: boolean;
    revised?: boolean;
    error_count?: number;
    tune_errors?: number;
    face_count?: number;
  },
  criteria: EvalCriterion[],
): Row {
  const base = emptyTaskScores(criteria);
  const legacyScores: Record<string, boolean | number> = {};
  if (item.task_scores) {
    Object.assign(legacyScores, item.task_scores);
  } else {
    if (item.listened != null) legacyScores.listening = Boolean(item.listened);
    if (item.repeated != null) legacyScores.repeat = Boolean(item.repeated);
    if (item.revised != null) legacyScores.revision = Boolean(item.revised);
    if (item.error_count != null) legacyScores.error = Number(item.error_count);
    if (item.tune_errors != null) legacyScores.tune = Number(item.tune_errors);
    if (item.face_count != null) legacyScores.faces = Number(item.face_count);
  }
  return {
    student_id: item.student_id,
    full_name_ar: item.full_name_ar,
    track_name: item.track_name ?? null,
    circle_name: item.circle_name ?? null,
    admin_present: Boolean(item.admin_present),
    task_scores: applyDependentScores({ ...base, ...legacyScores }, criteria),
    notes: item.notes ?? "",
  };
}

function patchRecitationCaches(
  queryClient: QueryClient,
  opts: {
    date: string;
    studentId: number;
    row: Row;
    isTeacher: boolean;
    isSupervisor: boolean;
    isBroadSupervisor: boolean;
    isTrackSupervisor: boolean;
    trackId: number | null;
    circleId: number | null;
  },
) {
  const payloadRow = {
    student_id: opts.row.student_id,
    full_name_ar: opts.row.full_name_ar,
    track_name: opts.row.track_name,
    circle_name: opts.row.circle_name,
    admin_present: opts.row.admin_present,
    task_scores: opts.row.task_scores,
    notes: opts.row.notes,
  };

  const patchItems = <T extends { items?: Array<{ student_id: number }> }>(
    old: T | undefined,
  ): T | undefined => {
    if (!old?.items) return old;
    return {
      ...old,
      items: old.items.map((item) =>
        item.student_id === opts.studentId ? { ...item, ...payloadRow } : item,
      ),
    };
  };

  if (opts.isTeacher) {
    queryClient.setQueryData(
      queryKeys.eduDept.teacherBootstrap(opts.date),
      (old: { items?: Array<{ student_id: number }> } | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((item) =>
            item.student_id === opts.studentId ? { ...item, ...payloadRow } : item,
          ),
        };
      },
    );
  } else {
    queryClient.setQueriesData(
      { queryKey: queryKeys.eduDept.myStudentsAll },
      patchItems,
    );
  }

  void queryClient.invalidateQueries({
    queryKey: opts.isTeacher
      ? queryKeys.eduDept.teacherBootstrapAll
      : queryKeys.eduDept.myStudentsAll,
    refetchType: "none",
  });
}

export function DailyRecitationPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSupervisor = user ? SUPERVISOR_ROLES.has(user.role) : false;
  const isTrackSupervisor = user?.role === "track_supervisor";
  const isBroadSupervisor = isSupervisor && !isTrackSupervisor;
  const teacherLikeUi = !isSupervisor || isTrackSupervisor;

  const [circles, setCircles] = useState<
    Array<{ id: number; name_ar: string; track_id?: number | null }>
  >([]);
  const [tracks, setTracks] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [circleId, setCircleId] = useState<number | null>(null);
  const [circleName, setCircleName] = useState("");
  const [date, setDate] = useState(() => todayRiyadhIso());
  const [rows, setRows] = useState<Row[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [saving, setSaving] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqStudent, setReqStudent] = useState<Row | null>(null);
  const [reqType, setReqType] = useState<"transfer" | "escalation">("escalation");
  const [reqNotes, setReqNotes] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const visibleCircles = useMemo(() => {
    if (!isSupervisor || trackId == null) return circles;
    return circles.filter((c) => c.track_id === trackId);
  }, [circles, isSupervisor, trackId]);

  const assignedTrackName = useMemo(() => {
    if (!isTrackSupervisor || trackId == null) return null;
    return tracks.find((t) => t.id === trackId)?.name_ar ?? null;
  }, [isTrackSupervisor, trackId, tracks]);

  const circleIdRef = useRef(circleId);
  circleIdRef.current = circleId;

  const supervisorCircle = isSupervisor ? circleId : null;

  const isTeacher = user?.role === "teacher";

  const criteriaQuery = useQuery({
    queryKey: queryKeys.evaluationCriteria,
    queryFn: async () => {
      const res = await api.eduDeptSettingsGet();
      return res.settings.evaluation_criteria;
    },
    enabled: canUseApi() && isBroadSupervisor,
    staleTime: 600_000,
  });

  const scopesQuery = useQuery({
    queryKey: queryKeys.eduDept.filterScopes,
    queryFn: () => api.eduDeptFilterScopes(),
    enabled: canUseApi() && isSupervisor,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!scopesQuery.data || !isSupervisor) return;
    setTracks(scopesQuery.data.tracks);
    setCircles(scopesQuery.data.circles);
    if (isTrackSupervisor) {
      const assigned = scopesQuery.data.assigned_track_ids ?? [];
      if (assigned.length >= 1) {
        setTrackId(assigned[0]);
      }
    }
  }, [scopesQuery.data, isSupervisor, isTrackSupervisor]);

  const studentsQuery = useQuery({
    queryKey: isTeacher
      ? queryKeys.eduDept.teacherBootstrap(date)
      : queryKeys.eduDept.myStudents({
          date,
          trackId: isSupervisor ? trackId : null,
          circleId: isBroadSupervisor ? supervisorCircle : null,
          isSupervisor,
          isTrackSupervisor,
        }),
    queryFn: async () => {
      if (isTeacher) {
        const boot = await api.eduDeptTeacherBootstrap({ date });
        return teacherBootstrapToRecitationPayload(boot);
      }
      const requestCircleId = isBroadSupervisor ? circleIdRef.current : null;
      const requestTrackId = isSupervisor ? trackId : null;
      return await api.eduDeptMyStudents({
        date,
        ...(requestCircleId != null ? { circle_id: requestCircleId } : {}),
        ...(requestTrackId != null ? { track_id: requestTrackId } : {}),
      });
    },
    enabled: canUseApi(),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const criteria = useMemo(
    () =>
      criteriaQuery.data ??
      studentsQuery.data?.evaluation_criteria ??
      [],
    [criteriaQuery.data, studentsQuery.data?.evaluation_criteria],
  );

  const enabledCriteria = useMemo(() => activeCriteria(criteria), [criteria]);
  const editableCriteria = useMemo(
    () => enabledCriteria.filter((c) => !c.requires_all?.length),
    [enabledCriteria],
  );
  const { booleans: booleanCriteria, others: nonBooleanCriteria } = useMemo(
    () => splitEditableCriteria(editableCriteria),
    [editableCriteria],
  );
  const bonusCriteria = useMemo(
    () => enabledCriteria.filter((c) => c.requires_all?.length),
    [enabledCriteria],
  );

  useEffect(() => {
    const res = studentsQuery.data;
    if (!res) return;

    const evalCriteria =
      criteria.length > 0 ? criteria : (res.evaluation_criteria ?? []);

    if (isSupervisor && res.circles?.length) {
      setCircles((prev) => {
        const trackMap = new Map(prev.map((c) => [c.id, c.track_id]));
        return res.circles!.map((c) => ({
          id: c.id,
          name_ar: c.name_ar,
          track_id: trackMap.get(c.id) ?? null,
        }));
      });
    }
    if (res.needs_circle_selection && isBroadSupervisor) {
      setRows([]);
      return;
    }
    if (!isSupervisor && res.circle_id != null) {
      setCircleId((prev) => (prev === res.circle_id ? prev : res.circle_id ?? prev));
    }
    setCircleName(res.circle_name ?? "");
    setRows((res.items ?? []).map((item) => normalizeRow(item, evalCriteria)));
  }, [studentsQuery.data, criteria, isSupervisor]);

  useEffect(() => {
    if (!studentsQuery.isError) return;
    const e = studentsQuery.error;
    const msg = e instanceof Error ? e.message : "فشل التحميل";
    const isNoCircleErr = /no_circle_assigned|لم يتم ربط حلقة/i.test(msg);
    if (isTrackSupervisor && isNoCircleErr && (tracks.length > 0 || circles.length > 0)) {
      setError(null);
      setRows([]);
      return;
    }
    setError(msg.includes("لم يتم ربط حلقة") ? msg : msg);
    setRows([]);
  }, [
    studentsQuery.isError,
    studentsQuery.error,
    isTrackSupervisor,
    tracks.length,
    circles.length,
  ]);

  useEffect(() => {
    if (studentsQuery.isSuccess) setError(null);
  }, [studentsQuery.isSuccess, studentsQuery.dataUpdatedAt]);

  /** هيكل الجدول يبقى ظاهراً عند تبديل التاريخ — لا يُفرَّغ إلا عند أول تحميل */
  const loading = studentsQuery.isPending && !studentsQuery.data;
  const dateRefreshing =
    studentsQuery.isFetching && Boolean(studentsQuery.data);

  function patchTaskScore(studentId: number, taskId: string, value: boolean | number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.student_id !== studentId) return r;
        const nextScores = applyDependentScores(
          { ...r.task_scores, [taskId]: value },
          criteria,
        );
        return { ...r, task_scores: nextScores };
      }),
    );
  }

  async function saveStudent(studentId: number) {
    const row = rows.find((r) => r.student_id === studentId);
    if (!row) return;
    if (!isSupervisor && rows.length === 0) return;
    if (isBroadSupervisor && circleId == null) return;
    setSavingStudentId(studentId);
    setError(null);
    try {
      await api.eduDeptDailyRecitationSave({
        ...(circleId != null ? { circle_id: circleId } : {}),
        recitation_date: date,
        rows: [
          {
            student_id: row.student_id,
            task_scores: row.task_scores,
            notes: row.notes,
          },
        ],
      });
      toast.success(`تم حفظ رصد ${row.full_name_ar}`);
      patchRecitationCaches(queryClient, {
        date,
        studentId,
        row,
        isTeacher,
        isSupervisor,
        isBroadSupervisor,
        isTrackSupervisor,
        trackId,
        circleId: supervisorCircle,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل الحفظ";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingStudentId(null);
    }
  }

  async function save() {
    if (!isSupervisor && rows.length === 0) return;
    if (isBroadSupervisor && circleId == null) return;
    setSaving(true);
    setError(null);
    try {
      await api.eduDeptDailyRecitationSave({
        ...(circleId != null ? { circle_id: circleId } : {}),
        recitation_date: date,
        rows: rows.map((r) => ({
          student_id: r.student_id,
          task_scores: r.task_scores,
          notes: r.notes,
        })),
      });
      toast.success("تم حفظ الرصد اليومي");
      for (const row of rows) {
        patchRecitationCaches(queryClient, {
          date,
          studentId: row.student_id,
          row,
          isTeacher,
          isSupervisor,
          isBroadSupervisor,
          isTrackSupervisor,
          trackId,
          circleId: supervisorCircle,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل الحفظ";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqStudent || user?.role !== "teacher") return;
    setReqSubmitting(true);
    setError(null);
    try {
      await api.eduDeptCreateTeacherRequest({
        student_id: reqStudent.student_id,
        request_type: reqType,
        notes: reqNotes.trim() || undefined,
      });
      setReqOpen(false);
      setReqNotes("");
      toast.success(
        reqType === "escalation"
          ? "تم رفع التعهد"
          : "تم إرسال طلب النقل",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل الإرسال";
      setError(msg);
      toast.error(msg);
    } finally {
      setReqSubmitting(false);
    }
  }

  const canSave = rows.length > 0 && (isBroadSupervisor ? circleId != null : true);

  return (
    <div
      className={`space-y-6 max-w-[1200px] ${embedded ? "pb-28 md:pb-24" : "pb-24"}`}
      dir="rtl"
    >
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
              <ClipboardList className="w-7 h-7 text-primary" />
              الرصد اليومي
            </h2>
            <p className={ds.page.description} style={tajawal}>
              {isTrackSupervisor
                ? "رصد إنجاز طلاب حلقات مسارك — نفس تجربة المعلم."
                : isSupervisor
                  ? "متابعة أو رصد حلقات المسار — المهام تُولَّد تلقائياً من إعدادات التقييم."
                  : "سجّل إنجاز الطلاب وفق مهام التقييم المحددة من المشرف."}
            </p>
            {teacherLikeUi && !isTrackSupervisor && circleName && (
              <p className="text-sm font-semibold text-primary mt-1" style={tajawal}>
                الحلقة: {circleName}
              </p>
            )}
            {isTrackSupervisor && assignedTrackName && (
              <p className="text-sm font-medium text-sky-700 dark:text-sky-300 mt-0.5" style={tajawal}>
                المسار: {assignedTrackName}
              </p>
            )}
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-2">
            {isBroadSupervisor && (
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as ViewMode)}
              className="border border-border rounded-xl p-1"
            >
              <ToggleGroupItem value="grid" aria-label="جدول" className={ds.btnRound}>
                <Grid3X3 className="w-4 h-4 ml-1" />
                جدول
              </ToggleGroupItem>
              <ToggleGroupItem value="cards" aria-label="بطاقات" className={ds.btnRound}>
                <LayoutGrid className="w-4 h-4 ml-1" />
                بطاقات
              </ToggleGroupItem>
            </ToggleGroup>
            )}
          </div>
        </div>
      )}

      {embedded && teacherLikeUi && !isTrackSupervisor && circleName && (
        <p className="text-sm font-semibold text-primary" style={tajawal}>
          الحلقة: {circleName}
        </p>
      )}

      {error && (
        <p className={ds.alert.error} style={tajawal}>
          {error}
        </p>
      )}

      <div className={`${ds.card} p-4 flex flex-col md:flex-row flex-wrap gap-4 md:items-end`}>
        {isBroadSupervisor && tracks.length > 0 && (
          <div className="space-y-1 w-full md:max-w-xs">
            <Label style={tajawal}>المسار التعليمي</Label>
            <select
              value={trackId ?? ""}
              onChange={(e) => {
                const next = e.target.value ? Number(e.target.value) : null;
                setTrackId(next);
                setCircleId(null);
              }}
              className={ds.select}
              style={tajawal}
            >
              <option value="">— كل المسارات —</option>
              {tracks.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name_ar}
                </option>
              ))}
            </select>
          </div>
        )}
        {isTrackSupervisor && assignedTrackName && (
          <div className="space-y-1 w-full md:max-w-xs">
            <Label style={tajawal}>المسار المسند</Label>
            <p
              className={`${ds.field} flex items-center min-h-9 bg-muted/40 text-sm font-medium`}
              style={tajawal}
            >
              {assignedTrackName}
            </p>
          </div>
        )}
        {isBroadSupervisor && (
          <div className="space-y-1 w-full md:max-w-xs">
            <Label style={tajawal}>الحلقة</Label>
            <select
              value={circleId ?? ""}
              onChange={(e) =>
                setCircleId(e.target.value ? Number(e.target.value) : null)
              }
              className={ds.select}
              style={tajawal}
            >
              <option value="">— اختر الحلقة —</option>
              {visibleCircles.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1 w-full md:max-w-sm">
          <Label style={tajawal}>التاريخ</Label>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5",
              dateRefreshing && "opacity-80",
            )}
          >
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn(
                ds.btnRound,
                "h-9 w-[9.5rem] shrink-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-1",
              )}
              aria-label="التاريخ الميلادي"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-medium text-foreground truncate" style={tajawal}>
                {formatGregorianAr(date)}
              </p>
              <p className="text-[11px] text-muted-foreground truncate" style={tajawal}>
                {formatHijriUmalqura(date)}
              </p>
            </div>
            {dateRefreshing && (
              <Loader2
                className="size-3.5 shrink-0 animate-spin text-primary"
                aria-label="جاري تحديث التاريخ"
              />
            )}
          </div>
        </div>
      </div>

      <div className={cn(ds.card, dateRefreshing && "relative")}>
        {loading ? (
          <RecitationTableSkeleton showFilters={false} columns={editableCriteria.length || 4} />
        ) : isBroadSupervisor && circleId == null ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            اختر حلقة من قائمة مسارك لعرض الطلاب.
          </p>
        ) : rows.length === 0 ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            {isTrackSupervisor
              ? "لا يوجد طلاب في مسارك حالياً."
              : "لا يوجد طلاب في هذه الحلقة."}
          </p>
        ) : (
          <>
            {/* Desktop / tablet — wide grid table */}
            <div className="hidden md:block">
              {viewMode === "grid" ? (
                <div className="overflow-x-auto max-h-[70vh]">
                  <Table className={`${ds.tableMin} text-right edu-recitation-grid`}>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                          الطالب
                        </TableHead>
                        {editableCriteria.map((c) => (
                          <TableHead
                            key={c.id}
                            className={`${ds.table.head} text-center`}
                            style={tajawal}
                          >
                            {c.name}
                          </TableHead>
                        ))}
                        {bonusCriteria.map((c) => (
                          <TableHead
                            key={c.id}
                            className={`${ds.table.head} text-center text-muted-foreground`}
                            style={tajawal}
                          >
                            {c.name}
                          </TableHead>
                        ))}
                        <TableHead
                          className={`${ds.table.head} text-center w-[8%]`}
                          style={tajawal}
                        >
                          الجودة %
                        </TableHead>
                        <TableHead
                          className={`${ds.table.head} text-center w-[8%]`}
                          style={tajawal}
                        >
                          حفظ
                        </TableHead>
                        {!isSupervisor && (
                          <TableHead className={ds.table.headActions} style={tajawal}>
                            إجراء
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.student_id} className="print:break-inside-avoid">
                          <TableCell className={ds.table.cell} style={tajawal}>
                            <StudentNameCell row={r} showCircleBadge={isTrackSupervisor} />
                          </TableCell>
                          {editableCriteria.map((c, idx) => (
                            <TableCell key={c.id} className="text-center align-middle">
                              <CriterionInput
                                criterion={c}
                                taskCol={criterionToTaskCol(c, idx)}
                                value={r.task_scores[c.id]}
                                onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                                compact
                              />
                            </TableCell>
                          ))}
                          {bonusCriteria.map((c) => (
                            <TableCell key={c.id} className="text-center align-middle">
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  r.task_scores[c.id]
                                    ? "bg-success-surface text-success-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {r.task_scores[c.id] ? "نعم" : "—"}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell
                            className={`${ds.table.cell} text-center font-semibold tabular-nums`}
                            style={tajawal}
                          >
                            {computeQualityFromCriteria(r.task_scores, criteria)}%
                          </TableCell>
                          <TableCell className={`${ds.table.cell} text-center`}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={ds.btnRound}
                              disabled={saving || savingStudentId != null || !canSave}
                              onClick={() => void saveStudent(r.student_id)}
                              style={tajawal}
                            >
                              {savingStudentId === r.student_id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "حفظ"
                              )}
                            </Button>
                          </TableCell>
                          {!isSupervisor && (
                            <TableActionsCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={ds.btnRound}
                                title="إجراء / طلب"
                                onClick={() => {
                                  setReqStudent(r);
                                  setReqType("escalation");
                                  setReqNotes("");
                                  setReqOpen(true);
                                }}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </TableActionsCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {rows.map((r) => (
                    <div
                      key={r.student_id}
                      className={`${ds.card} p-4 space-y-3 border border-border`}
                    >
                      <p className="font-bold text-sm" style={tajawal}>
                        {r.full_name_ar}
                      </p>
                      {isTrackSupervisor && r.circle_name ? (
                        <StudentCircleBadge circleName={r.circle_name} />
                      ) : r.track_name ? (
                        <StudentTrackBadge trackName={r.track_name} />
                      ) : null}
                      <div className="space-y-3 text-sm" style={tajawal}>
                        {booleanCriteria.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {booleanCriteria.map((c) => (
                              <BooleanCriterionPill
                                key={c.id}
                                criterion={c}
                                checked={Boolean(r.task_scores[c.id])}
                                onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                              />
                            ))}
                          </div>
                        )}
                        {nonBooleanCriteria.map((c, idx) => (
                          <div key={c.id} className="flex items-center justify-between gap-2">
                            <span>{c.name}</span>
                            <CriterionInput
                              criterion={c}
                              taskCol={criterionToTaskCol(c, idx)}
                              value={r.task_scores[c.id]}
                              onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                              compact
                            />
                          </div>
                        ))}
                        {bonusCriteria.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">{c.name}</span>
                            <span className="text-xs">
                              {r.task_scores[c.id] ? "مكتمل" : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className={`${ds.saveActionWrap} pt-2 border-t border-border`}>
                        <span className="text-sm font-semibold tabular-nums w-full text-center" style={tajawal}>
                          الجودة: {computeQualityFromCriteria(r.task_scores, criteria)}%
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(ds.btnRound, "min-w-[8rem]")}
                          disabled={saving || savingStudentId != null || !canSave}
                          onClick={() => void saveStudent(r.student_id)}
                          style={tajawal}
                        >
                          {savingStudentId === r.student_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "حفظ"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile — expandable student cards */}
            <div className="md:hidden p-2">
              <Accordion type="single" collapsible className="space-y-2">
                {rows.map((r) => {
                  const quality = computeQualityFromCriteria(r.task_scores, criteria);
                  return (
                    <AccordionItem
                      key={r.student_id}
                      value={String(r.student_id)}
                      className={`${ds.card} border border-border rounded-2xl px-3 overflow-hidden`}
                    >
                      <AccordionTrigger
                        className="py-2.5 hover:no-underline text-right [&>svg]:mr-auto [&>svg]:ml-0"
                        style={tajawal}
                      >
                        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0 text-right flex-1">
                            <p className="font-semibold text-sm truncate">{r.full_name_ar}</p>
                            {isTrackSupervisor && r.circle_name ? (
                              <StudentCircleBadge
                                circleName={r.circle_name}
                                className="mt-1 max-w-full"
                              />
                            ) : r.track_name ? (
                              <StudentTrackBadge trackName={r.track_name} className="mt-1 max-w-full" />
                            ) : null}
                            {r.admin_present && (
                              <span className="text-[10px] text-success font-medium">
                                حضور إداري
                              </span>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                              quality >= 75
                                ? "bg-success-surface text-success-foreground"
                                : quality >= 50
                                  ? "bg-warning-surface text-warning-foreground"
                                  : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {quality}%
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2 pt-0">
                        <div className="space-y-2 border-t border-border/80 pt-2">
                          {booleanCriteria.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 py-1">
                              {booleanCriteria.map((c) => (
                                <BooleanCriterionPill
                                  key={c.id}
                                  criterion={c}
                                  checked={Boolean(r.task_scores[c.id])}
                                  onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                                  disabled={saving || savingStudentId != null}
                                />
                              ))}
                            </div>
                          )}
                          {nonBooleanCriteria.map((c) => (
                            <div
                              key={c.id}
                              className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 py-1 min-h-11"
                            >
                              <span
                                className="shrink-0 text-xs font-medium text-foreground truncate max-w-[38%]"
                                style={tajawal}
                                title={c.name}
                              >
                                {c.name}
                              </span>
                              <div className="ms-auto flex min-w-[7.5rem] flex-1 items-center justify-end">
                                <MobileCriterionInput
                                  criterion={c}
                                  value={r.task_scores[c.id]}
                                  onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                                  disabled={saving || savingStudentId != null}
                                />
                              </div>
                            </div>
                          ))}
                          {bonusCriteria.map((c) => (
                            <div
                              key={c.id}
                              className="flex flex-row items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5 min-h-9"
                              style={tajawal}
                            >
                              <span className="text-xs text-muted-foreground truncate">
                                {c.name}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-xs font-medium",
                                  r.task_scores[c.id]
                                    ? "text-secondary-foreground bg-secondary/80 rounded-md px-2 py-0.5"
                                    : "text-muted-foreground",
                                )}
                              >
                                {r.task_scores[c.id] ? "✓" : "—"}
                              </span>
                            </div>
                          ))}

                          <div className={cn(ds.saveActionWrap, "border-t border-border/70 pt-3 mt-1")}>
                            <Button
                              type="button"
                              size="lg"
                              variant="default"
                              className={cn(
                                ds.btnRound,
                                ds.primaryActionBtn,
                                "h-11 w-full max-w-[11.5rem] shadow-md touch-manipulation",
                              )}
                              disabled={saving || savingStudentId != null || !canSave}
                              onClick={() => void saveStudent(r.student_id)}
                              style={tajawal}
                            >
                              {savingStudentId === r.student_id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin ml-1.5" />
                                  جاري الحفظ…
                                </>
                              ) : (
                                "حفظ"
                              )}
                            </Button>
                            {!isSupervisor && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={cn(ds.btnRound, "h-9 text-muted-foreground")}
                                onClick={() => {
                                  setReqStudent(r);
                                  setReqType("escalation");
                                  setReqNotes("");
                                  setReqOpen(true);
                                }}
                                style={tajawal}
                              >
                                <MoreHorizontal className="w-4 h-4 ml-1" />
                                إجراء / طلب
                              </Button>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          </>
        )}
      </div>

      {!isSupervisor && (
        <Dialog open={reqOpen} onOpenChange={setReqOpen}>
          <DialogContent className={`${ds.dialog} max-w-md`} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>طلب للطالب</DialogTitle>
              <DialogDescription style={tajawal}>
                {reqStudent?.full_name_ar}
              </DialogDescription>
            </DialogHeader>
            <GuardedForm onSubmit={submitRequest} className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={reqType === "escalation" ? "default" : "outline"}
                  className={`flex-1 ${ds.btnRound}`}
                  onClick={() => setReqType("escalation")}
                  style={tajawal}
                >
                  رفع تعهد
                </Button>
                <Button
                  type="button"
                  variant={reqType === "transfer" ? "default" : "outline"}
                  className={`flex-1 ${ds.btnRound}`}
                  onClick={() => setReqType("transfer")}
                  style={tajawal}
                >
                  طلب نقل
                </Button>
              </div>
              <div className="space-y-2">
                <Label style={tajawal}>ملاحظة</Label>
                <Input
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  className={ds.btnRound}
                  required
                />
              </div>
              <Button
                type="submit"
                variant="default"
                className={`w-full ${ds.btnRound}`}
                disabled={reqSubmitting}
                style={tajawal}
              >
                {reqSubmitting ? "جاري الإرسال…" : "إرسال الطلب"}
              </Button>
            </GuardedForm>
          </DialogContent>
        </Dialog>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 print:hidden md:mx-0 md:rounded-2xl md:border">
        <div className="max-w-[1200px] mx-auto flex justify-center">
          <Button
            type="button"
            variant="default"
            size="lg"
            className={cn(ds.btnRound, ds.primaryActionBtn, "min-w-[160px] shadow-lg")}
            disabled={saving || savingStudentId != null || !canSave}
            onClick={() => save()}
            style={tajawal}
          >
            {saving ? "جاري الحفظ…" : "حفظ الرصد"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StudentNameCell({
  row,
  showCircleBadge = false,
}: {
  row: Row;
  showCircleBadge?: boolean;
}) {
  return (
    <div className="min-w-0 flex flex-col items-start gap-1 text-right max-w-full">
      <span className="truncate max-w-full">{row.full_name_ar}</span>
      {showCircleBadge && row.circle_name ? (
        <StudentCircleBadge circleName={row.circle_name} />
      ) : row.track_name ? (
        <StudentTrackBadge trackName={row.track_name} />
      ) : null}
      {row.admin_present && (
        <span className="text-[10px] text-success font-medium">
          حضور إداري
        </span>
      )}
    </div>
  );
}

function criterionToTaskCol(c: EvalCriterion, idx: number): TaskInputCol {
  return {
    id: idx + 1,
    name_ar: c.name,
    weight: c.max_weight,
    type: c.type === "penalty" ? "deduction" : "addition",
    input_type:
      c.type === "penalty" ? "counter" : c.input === "number" ? "numeric" : "boolean",
  };
}

function scoreToNumber(value: boolean | number | undefined): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  return Number(value ?? 0);
}

function numberToScore(c: EvalCriterion, n: number): boolean | number {
  if (c.type === "penalty" || c.input === "number") return n;
  return n > 0;
}

function isNumericCriterion(c: EvalCriterion): boolean {
  return c.input === "number" || c.input_type === "numeric";
}

function isCounterCriterion(c: EvalCriterion): boolean {
  return c.type === "penalty" || c.input_type === "counter";
}

function isBooleanCriterion(c: EvalCriterion): boolean {
  if (c.input_type === "boolean") return true;
  if (
    c.input_type === "numeric" ||
    c.input_type === "counter" ||
    c.type === "penalty" ||
    c.input === "number"
  ) {
    return false;
  }
  return true;
}

function splitEditableCriteria(criteria: EvalCriterion[]) {
  const booleans: EvalCriterion[] = [];
  const others: EvalCriterion[] = [];
  for (const c of criteria) {
    if (isBooleanCriterion(c)) booleans.push(c);
    else others.push(c);
  }
  return { booleans, others };
}

function BooleanCriterionPill({
  criterion,
  checked,
  onChange,
  disabled,
  compact,
}: {
  criterion: EvalCriterion;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const isPenalty = criterion.type === "penalty";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={criterion.name}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        ds.btnRound,
        "inline-flex min-h-11 w-full items-center justify-center border px-2.5 font-semibold transition-colors touch-manipulation",
        compact ? "py-1.5 text-[11px]" : "py-2 text-xs",
        isPenalty
          ? checked
            ? "border-destructive bg-destructive text-destructive-foreground"
            : "border-destructive/40 bg-destructive/5 text-destructive hover:border-destructive/60"
          : checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:border-primary/40",
        disabled && "pointer-events-none opacity-50",
      )}
      style={tajawal}
    >
      <span className="truncate">{criterion.name}</span>
    </button>
  );
}

function MobileCounterInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const count = Math.max(0, Math.round(value));
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5" aria-label={label}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-7 w-7 min-h-11 min-w-11 rounded-lg p-0"
        disabled={disabled || count <= 0}
        onClick={() => onChange(count - 1)}
        aria-label="إنقاص"
      >
        <Minus className="size-3" />
      </Button>
      <span className="w-5 text-center text-xs font-semibold tabular-nums">{count}</span>
      <Button
        type="button"
        size="icon"
        className="h-7 w-7 min-h-11 min-w-11 rounded-lg p-0"
        disabled={disabled}
        onClick={() => onChange(count + 1)}
        aria-label="زيادة"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

function MobileCriterionInput({
  criterion,
  value,
  onChange,
  disabled,
}: {
  criterion: EvalCriterion;
  value: boolean | number | undefined;
  onChange: (v: boolean | number) => void;
  disabled?: boolean;
}) {
  const [unit, setUnit] = useState<QuranicUnit>("face");
  const numericValue = scoreToNumber(value);

  if (isNumericCriterion(criterion)) {
    return (
      <QuranicInputCell
        value={numericValue}
        unit={unit}
        onValueChange={(n) => onChange(numberToScore(criterion, n))}
        onUnitChange={setUnit}
        disabled={disabled}
        aria-label={criterion.name}
        className="max-w-[10.5rem] min-w-[8.5rem]"
      />
    );
  }

  if (isCounterCriterion(criterion)) {
    return (
      <MobileCounterInput
        value={numericValue}
        onChange={(n) => onChange(numberToScore(criterion, n))}
        disabled={disabled}
        label={criterion.name}
      />
    );
  }

  return null;
}

function CriterionInput({
  criterion,
  taskCol,
  value,
  onChange,
  compact,
}: {
  criterion: EvalCriterion;
  taskCol: TaskInputCol;
  value: boolean | number | undefined;
  onChange: (v: boolean | number) => void;
  compact?: boolean;
}) {
  if (isBooleanCriterion(criterion)) {
    return (
      <BooleanCriterionPill
        criterion={criterion}
        checked={Boolean(value)}
        onChange={(next) => onChange(next)}
        compact={compact}
      />
    );
  }

  return (
    <TaskInputCell
      task={taskCol}
      value={scoreToNumber(value)}
      compact={compact}
      onChange={(n) => onChange(numberToScore(criterion, n))}
    />
  );
}
