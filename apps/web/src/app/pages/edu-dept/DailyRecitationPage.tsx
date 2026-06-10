import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Grid3X3, LayoutGrid, MoreHorizontal } from "lucide-react";
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
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api-client";
import { canUseApi } from "../../lib/api-access";
import {
  computeQualityFromCriteria,
  emptyTaskScores,
  type EvalCriterion,
} from "../../lib/evaluation-criteria";
import { ds, tajawal } from "../../lib/design-system";

type Row = {
  student_id: number;
  full_name_ar: string;
  admin_present?: boolean;
  task_scores: Record<string, boolean | number>;
  notes: string;
};

type ViewMode = "grid" | "cards";

const SUPERVISOR_ROLES = new Set(["edu_supervisor", "super_admin", "programs_supervisor"]);

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
    admin_present: Boolean(item.admin_present),
    task_scores: applyDependentScores({ ...base, ...legacyScores }, criteria),
    notes: item.notes ?? "",
  };
}

export function DailyRecitationPage() {
  const { user } = useAuth();
  const isSupervisor = user ? SUPERVISOR_ROLES.has(user.role) : false;

  const [circles, setCircles] = useState<
    Array<{ id: number; name_ar: string; track_id?: number | null }>
  >([]);
  const [tracks, setTracks] = useState<Array<{ id: number; name_ar: string }>>([]);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [circleId, setCircleId] = useState<number | null>(null);
  const [circleName, setCircleName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [criteria, setCriteria] = useState<EvalCriterion[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqStudent, setReqStudent] = useState<Row | null>(null);
  const [reqType, setReqType] = useState<"transfer" | "escalation">("escalation");
  const [reqNotes, setReqNotes] = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const editableCriteria = useMemo(
    () => criteria.filter((c) => !c.requires_all?.length),
    [criteria],
  );
  const bonusCriteria = useMemo(
    () => criteria.filter((c) => c.requires_all?.length),
    [criteria],
  );

  const visibleCircles = useMemo(() => {
    if (!isSupervisor || trackId == null) return circles;
    return circles.filter((c) => c.track_id === trackId);
  }, [circles, isSupervisor, trackId]);

  const loadScopes = useCallback(async () => {
    if (!canUseApi() || !isSupervisor) return;
    try {
      const res = await api.eduDeptFilterScopes();
      setTracks(res.tracks);
      setCircles(res.circles);
    } catch {
      /* ignore */
    }
  }, [isSupervisor]);

  useEffect(() => {
    void loadScopes();
  }, [loadScopes]);

  const load = useCallback(async () => {
    if (!canUseApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = isSupervisor
        ? await api.eduDeptMyStudents({
            date,
            ...(circleId != null ? { circle_id: circleId } : {}),
            ...(trackId != null ? { track_id: trackId } : {}),
          })
        : await api.eduDeptMyStudents({ date });

      const evalCriteria = res.evaluation_criteria ?? [];
      setCriteria(evalCriteria);
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
      if (res.needs_circle_selection && isSupervisor) {
        setRows([]);
        return;
      }
      setCircleId(res.circle_id);
      setCircleName(res.circle_name ?? "");
      setRows((res.items ?? []).map((item) => normalizeRow(item, evalCriteria)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحميل";
      setError(msg.includes("لم يتم ربط حلقة") ? msg : msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, circleId, trackId, isSupervisor]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function save() {
    if (!isSupervisor && rows.length === 0) return;
    if (isSupervisor && circleId == null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
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
      setSuccess("تم حفظ الرصد اليومي.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
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
      setSuccess(
        reqType === "escalation"
          ? "تم إرسال التصعيد للإدارة."
          : "تم إرسال طلب النقل.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setReqSubmitting(false);
    }
  }

  const canSave = rows.length > 0 && (isSupervisor ? circleId != null : true);

  return (
    <div className="space-y-6 max-w-[1200px] pb-24">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className={`${ds.page.title} flex items-center gap-2`} style={tajawal}>
            <ClipboardList className="w-7 h-7 text-primary" />
            الرصد اليومي
          </h2>
          <p className={ds.page.description} style={tajawal}>
            {isSupervisor
              ? "متابعة أو رصد حلقات المسار — المهام تُولَّد تلقائياً من إعدادات التقييم."
              : "سجّل إنجاز الطلاب وفق مهام التقييم المحددة من المشرف."}
          </p>
          {!isSupervisor && circleName && (
            <p className="text-sm font-semibold text-primary mt-1" style={tajawal}>
              الحلقة: {circleName}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
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

      <div className={`${ds.card} p-4 flex flex-col md:flex-row flex-wrap gap-4 md:items-end`}>
        {isSupervisor && tracks.length > 0 && (
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
        {isSupervisor && (
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
        <div className="space-y-1 w-full md:max-w-xs">
          <Label style={tajawal}>التاريخ</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={ds.btnRound}
          />
        </div>
      </div>

      <div className={ds.card}>
        {loading ? (
          <p className="p-4 text-muted-foreground text-sm" style={tajawal}>
            جاري التحميل…
          </p>
        ) : isSupervisor && circleId == null ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            اختر حلقة من قائمة مسارك لعرض الطلاب.
          </p>
        ) : rows.length === 0 ? (
          <p className={`p-4 ${ds.alert.info}`} style={tajawal}>
            لا يوجد طلاب في هذه الحلقة.
          </p>
        ) : viewMode === "grid" ? (
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
                      <span>{r.full_name_ar}</span>
                      {r.admin_present && (
                        <span className="mr-2 text-[10px] text-emerald-600 font-medium">
                          حضور إداري
                        </span>
                      )}
                    </TableCell>
                    {editableCriteria.map((c) => (
                      <TableCell key={c.id} className="text-center align-middle">
                        <TaskInput
                          criterion={c}
                          value={r.task_scores[c.id]}
                          onChange={(v) => patchTaskScore(r.student_id, c.id, v)}
                        />
                      </TableCell>
                    ))}
                    {bonusCriteria.map((c) => (
                      <TableCell key={c.id} className="text-center align-middle">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            r.task_scores[c.id]
                              ? "bg-emerald-500/15 text-emerald-700"
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
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <div
                key={r.student_id}
                className={`${ds.card} p-4 space-y-3 border border-border`}
              >
                <p className="font-bold text-sm" style={tajawal}>
                  {r.full_name_ar}
                </p>
                <div className="space-y-2 text-sm" style={tajawal}>
                  {editableCriteria.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span>{c.name}</span>
                      <TaskInput
                        criterion={c}
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
              </div>
            ))}
          </div>
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
            <form onSubmit={submitRequest} className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={reqType === "escalation" ? "default" : "outline"}
                  className={`flex-1 ${ds.btnRound}`}
                  onClick={() => setReqType("escalation")}
                  style={tajawal}
                >
                  تصعيد للإدارة
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
            </form>
          </DialogContent>
        </Dialog>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 print:hidden md:mx-0 md:rounded-2xl md:border">
        <div className="max-w-[1200px] mx-auto flex justify-end">
          <Button
            type="button"
            variant="default"
            size="lg"
            className={`${ds.btnRound} min-w-[160px] shadow-lg`}
            disabled={saving || !canSave}
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

function TaskInput({
  criterion,
  value,
  onChange,
  compact,
}: {
  criterion: EvalCriterion;
  value: boolean | number | undefined;
  onChange: (v: boolean | number) => void;
  compact?: boolean;
}) {
  const isNumber = criterion.type === "penalty" || criterion.input === "number";

  if (isNumber) {
    return (
      <Input
        type="number"
        min={0}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${ds.btnRound} ${compact ? "h-8 w-20 text-center text-sm" : "w-16 mx-auto h-8 text-center"}`}
      />
    );
  }

  return (
    <input
      type="checkbox"
      checked={Boolean(value)}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 rounded border-border"
    />
  );
}
