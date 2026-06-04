import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { AdminEntityActionModal } from "../../components/admin/AdminEntityActionModal";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { Badge } from "../../components/ui/badge";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  api,
  type EducationalGroupRow,
  type StaffMemberRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { EDUCATIONAL_STAGES, type StageId } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

type EntityKind = "circle" | "track";

const ENTITY_LABEL: Record<EntityKind, string> = {
  circle: "حلقة قرآنية",
  track: "مسار تعليمي",
};

const ENTITY_BADGE: Record<EntityKind, string> = {
  circle: "حلقة",
  track: "مسار",
};

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function CirclesSetupPage() {
  const [items, setItems] = useState<EducationalGroupRow[]>([]);
  const [staff, setStaff] = useState<StaffMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<EducationalGroupRow | null>(null);
  const [actionRow, setActionRow] = useState<EducationalGroupRow | null>(null);
  const hasApi = Boolean(getApiToken());

  const teachers = useMemo(
    () => staff.filter((s) => s.role === "teacher"),
    [staff],
  );
  const trackSupervisors = useMemo(
    () => staff.filter((s) => s.role === "track_supervisor"),
    [staff],
  );

  const load = useCallback(async () => {
    if (!hasApi) {
      toast.error("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [groupsRes, staffRes] = await Promise.allSettled([
      api.adminEducationalGroups(),
      api.adminStaff(),
    ]);
    if (groupsRes.status === "fulfilled") {
      setItems(
        (groupsRes.value.items ?? []).filter((g) => g.is_active !== 0),
      );
    } else {
      console.error("[groups] load:", groupsRes.reason);
      setItems([]);
      toast.error(apiErrorMessage(groupsRes.reason, "تعذر تحميل الحلقات والمسارات"));
    }
    if (staffRes.status === "fulfilled") {
      setStaff(staffRes.value.items ?? []);
    } else {
      setStaff([]);
    }
    setLoading(false);
  }, [hasApi]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditRow(null);
    setModalOpen(true);
  }

  function openEdit(row: EducationalGroupRow) {
    setEditRow(row);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إعداد الحلقات والمسارات
        </h2>
        <p className={ds.page.description} style={tajawal}>
          كيان واحد موحّد — الحلقة والمسار يختلفان في المسمى والإسناد فقط
        </p>
      </div>

      <Card className={ds.card}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <CardTitle className="flex items-center gap-2" style={tajawal}>
              <Layers className="w-5 h-5 text-primary" />
              المجموعات التعليمية
            </CardTitle>
            <CardDescription style={tajawal}>
              {items.length} كيان نشط
            </CardDescription>
          </div>
          <Button
            type="button"
            className={ds.btnRound}
            style={tajawal}
            onClick={openCreate}
          >
            إضافة كيان
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground" style={tajawal}>
              جاري التحميل…
            </p>
          ) : (
            <Table className={ds.tableMin}>
              <TableHeader>
                <TableRow>
                  <TableHead className={`${ds.table.head} w-[20%]`} style={tajawal}>
                    اسم الكيان
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                    النوع
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                    المعلم / المشرف
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                    الطلاب
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                    السعة
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                    تنبيه
                  </TableHead>
                  <TableHead className={ds.table.headActions} style={tajawal}>
                    إجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className={`${ds.table.cell} text-center text-muted-foreground`}
                      style={tajawal}
                    >
                      لا توجد حلقات أو مسارات
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={`${row.entity_type}-${row.id}`}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.name_ar}
                      </TableCell>
                      <TableCell className={ds.table.cell}>
                        <Badge
                          variant={
                            row.entity_type === "track" ? "default" : "secondary"
                          }
                          className={
                            row.entity_type === "track"
                              ? "bg-sky-600 hover:bg-sky-600 text-white"
                              : "bg-emerald-700 hover:bg-emerald-700 text-white"
                          }
                          style={tajawal}
                        >
                          {ENTITY_BADGE[row.entity_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.assignee_id ? (
                          row.assignee_name ?? "—"
                        ) : (
                          <span className="text-destructive font-medium">
                            غير معين
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.student_count}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.student_count}/{row.default_capacity}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.entity_type === "circle" && row.capacity_warning ? (
                          <span className="text-sm text-amber-700 dark:text-amber-400">
                            {row.capacity_warning}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableActionsCell>
                        <TableIconAction
                          kind="edit"
                          onClick={() => openEdit(row)}
                        />
                        <TableIconAction
                          kind="more"
                          onClick={() => setActionRow(row)}
                        />
                      </TableActionsCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {actionRow && (
        <AdminEntityActionModal
          open
          onOpenChange={(o) => {
            if (!o) setActionRow(null);
          }}
          entityTitle={ENTITY_BADGE[actionRow.entity_type]}
          entityName={actionRow.name_ar}
          isActive={actionRow.is_active !== 0}
          onToggleActive={async () => {
            const next = actionRow.is_active !== 0 ? 0 : 1;
            if (actionRow.entity_type === "circle") {
              await api.adminCirclesPatch(actionRow.id, { is_active: next });
            } else {
              await api.adminTracksPatch(actionRow.id, { is_active: next });
            }
            if (next === 0) {
              setItems((prev) =>
                prev.filter(
                  (x) =>
                    !(
                      x.id === actionRow.id &&
                      x.entity_type === actionRow.entity_type
                    ),
                ),
              );
            } else {
              setItems((prev) =>
                prev.map((x) =>
                  x.id === actionRow.id &&
                  x.entity_type === actionRow.entity_type
                    ? { ...x, is_active: next }
                    : x,
                ),
              );
            }
            toast.success(next ? "تم التنشيط" : "تم التعليق");
          }}
          onDelete={async () => {
            await api.adminEducationalGroupDelete(
              actionRow.entity_type,
              actionRow.id,
            );
            setItems((prev) =>
              prev.filter(
                (x) =>
                  !(x.id === actionRow.id && x.entity_type === actionRow.entity_type),
              ),
            );
            toast.success("تم الحذف بنجاح");
          }}
          deleteHint="سيتم فك ارتباط الطلاب المسجّلين في هذا الكيان."
        />
      )}

      <GroupFormDialog
        open={modalOpen}
        editRow={editRow}
        teachers={teachers}
        trackSupervisors={trackSupervisors}
        onOpenChange={setModalOpen}
        onSaved={() => {
          setModalOpen(false);
          setEditRow(null);
          void load();
          toast.success(editRow ? "تم حفظ التعديلات" : "تمت الإضافة بنجاح");
        }}
      />
    </div>
  );
}

function GroupFormDialog({
  open,
  editRow,
  teachers,
  trackSupervisors,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  editRow: EducationalGroupRow | null;
  teachers: StaffMemberRow[];
  trackSupervisors: StaffMemberRow[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = editRow != null;
  const [entityType, setEntityType] = useState<EntityKind>("circle");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [stageId, setStageId] = useState<StageId>(2);
  const [teacherId, setTeacherId] = useState("");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherMobile, setNewTeacherMobile] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      setEntityType(editRow.entity_type);
      setName(editRow.name_ar);
      setCapacity(String(editRow.default_capacity));
      setStageId((editRow.stage_id as StageId) ?? 2);
      if (editRow.entity_type === "circle") {
        setTeacherId(editRow.assignee_id ? String(editRow.assignee_id) : "");
        setSupervisorId("");
      } else {
        setSupervisorId(editRow.assignee_id ? String(editRow.assignee_id) : "");
        setTeacherId("");
      }
      setNewTeacherName("");
      setNewTeacherMobile("");
    } else {
      setEntityType("circle");
      setName("");
      setCapacity("20");
      setStageId(2);
      setTeacherId("");
      setSupervisorId("");
      setNewTeacherName("");
      setNewTeacherMobile("");
    }
  }, [open, editRow]);

  const isCircle = entityType === "circle";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && editRow) {
        if (editRow.entity_type === "circle") {
          if (!teacherId) {
            toast.error("اختر معلمًا للحلقة");
            return;
          }
          await api.adminCirclesPatch(editRow.id, {
            name_ar: name.trim(),
            stage_id: stageId,
            default_capacity: Number(capacity),
            teacher_user_id: Number(teacherId),
          });
        } else {
          await api.adminTracksPatch(editRow.id, {
            name_ar: name.trim(),
            default_capacity: Number(capacity),
          });
        }
      } else if (isCircle) {
        if (!teacherId && (!newTeacherName.trim() || !newTeacherMobile.trim())) {
          toast.error("اختر معلمًا أو أدخل بيانات معلم جديد");
          return;
        }
        await api.adminCirclesCreate({
          name_ar: name.trim(),
          stage_id: stageId,
          default_capacity: Number(capacity),
          teacher_user_id: teacherId ? Number(teacherId) : undefined,
          new_teacher:
            !teacherId && newTeacherName.trim()
              ? {
                  full_name_ar: newTeacherName.trim(),
                  mobile: newTeacherMobile.trim(),
                }
              : undefined,
        });
      } else {
        if (!supervisorId) {
          toast.error("اختر مشرف المسار");
          return;
        }
        await api.adminTracksCreate({
          name_ar: name.trim(),
          default_capacity: Number(capacity),
          supervisor_id: Number(supervisorId),
          stage_ids: [stageId],
          circle_ids: [],
        });
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "فشل الحفظ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-lg`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>
            {isEdit ? "تعديل كيان" : "إضافة كيان"}
          </DialogTitle>
          <DialogDescription style={tajawal}>
            اختر نوع الكيان ثم أكمل البيانات
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <fieldset className="space-y-2" disabled={isEdit}>
            <legend className="text-sm font-semibold mb-2" style={tajawal}>
              نوع الكيان *
            </legend>
            <div className="flex flex-wrap gap-4">
              {(["circle", "track"] as const).map((kind) => (
                <label
                  key={kind}
                  className="flex items-center gap-2 cursor-pointer"
                  style={tajawal}
                >
                  <input
                    type="radio"
                    name="entity_type"
                    value={kind}
                    checked={entityType === kind}
                    onChange={() => setEntityType(kind)}
                    className="size-4"
                  />
                  {ENTITY_LABEL[kind]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label style={tajawal}>الاسم *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label style={tajawal}>السعة الافتراضية *</Label>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </div>
            {isCircle && (
              <div className="space-y-1">
                <Label style={tajawal}>المرحلة *</Label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(Number(e.target.value) as StageId)}
                  className={ds.select}
                  style={tajawal}
                >
                  {EDUCATIONAL_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {isCircle ? (
            <>
              <div className="space-y-1">
                <Label style={tajawal}>المعلم *</Label>
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className={ds.select}
                  style={tajawal}
                  required={isEdit}
                >
                  <option value="">
                    {isEdit ? "— اختر معلمًا —" : "— معلم جديد أدناه —"}
                  </option>
                  {teachers.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.full_name_ar}
                    </option>
                  ))}
                </select>
              </div>
              {!teacherId && !isEdit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label style={tajawal}>اسم المعلم الجديد</Label>
                    <Input
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label style={tajawal}>جوال المعلم</Label>
                    <Input
                      value={newTeacherMobile}
                      onChange={(e) => setNewTeacherMobile(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1">
              <Label style={tajawal}>مشرف المسار *</Label>
              <select
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className={ds.select}
                style={tajawal}
                required={!isEdit}
              >
                <option value="">— اختر المشرف —</option>
                {trackSupervisors.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.full_name_ar}
                  </option>
                ))}
              </select>
              {trackSupervisors.length === 0 && (
                <p className="text-xs text-muted-foreground" style={tajawal}>
                  أضف مشرف مسار من تبويب إدارة المنسوبين أولاً
                </p>
              )}
            </div>
          )}

          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : isEdit ? "حفظ التعديلات" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
