import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { AdminEntityActionModal } from "../../components/admin/AdminEntityActionModal";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
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
  EDUCATIONAL_STAGES,
  SCOPE_GLOBAL,
  stageLabel,
  type StageId,
} from "../../lib/stages";
import {
  api,
  type AdminCircleRow,
  type AdminTrackRow,
  type StaffMemberRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";

const SOVEREIGN_USER_ID = 1;

const STAFF_ROLE_LABELS: Record<string, string> = {
  super_admin: "مشرف عام",
  admin_supervisor: "مشرف عام",
  general_supervisor: "مشرف عام",
  edu_supervisor: "مشرف تعليمي",
  programs_supervisor: "مشرف برامج",
  prog_supervisor: "مشرف برامج",
  track_supervisor: "مشرف مسار",
  teacher: "معلم",
};

const ALL_STAFF_ROLES = [
  { value: "super_admin", label: "مشرف عام" },
  { value: "edu_supervisor", label: "مشرف تعليمي" },
  { value: "programs_supervisor", label: "مشرف برامج" },
  { value: "track_supervisor", label: "مشرف مسار" },
  { value: "teacher", label: "معلم" },
] as const;

function staffRoleLabel(role: string): string {
  return STAFF_ROLE_LABELS[role] ?? role;
}

function assignedEntityLabel(row: StaffMemberRow): string {
  if (row.role === "teacher") return row.circle_name?.trim() || "—";
  if (row.role === "track_supervisor") return row.track_name?.trim() || "—";
  return "—";
}

function normalizeRoleForForm(role: string): string {
  if (
    role === "admin_supervisor" ||
    role === "general_supervisor" ||
    role === "super_admin"
  ) {
    return "super_admin";
  }
  if (role === "prog_supervisor") return "programs_supervisor";
  return role;
}

function roleForApi(role: string): string {
  if (role === "super_admin") return "admin_supervisor";
  return role;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function StaffManagementPage() {
  const [items, setItems] = useState<StaffMemberRow[]>([]);
  const [circles, setCircles] = useState<AdminCircleRow[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffMemberRow | null>(null);
  const [assignRow, setAssignRow] = useState<StaffMemberRow | null>(null);
  const [actionRow, setActionRow] = useState<StaffMemberRow | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      toast.error("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [staffRes, circlesRes, tracksRes] = await Promise.allSettled([
      api.adminStaff(),
      api.adminCirclesSummary(),
      api.adminTracks(),
    ]);
    if (staffRes.status === "fulfilled") {
      const payload = staffRes.value as {
        items?: StaffMemberRow[];
        error?: string;
        message?: string;
      };
      if (payload.error) {
        toast.error(payload.message ?? "تعذر تحميل المنسوبين");
        setItems([]);
      } else {
        setItems(payload.items ?? []);
      }
    } else {
      console.error("[staff] list:", staffRes.reason);
      setItems([]);
      toast.error(apiErrorMessage(staffRes.reason, "تعذر تحميل المنسوبين"));
    }
    if (circlesRes.status === "fulfilled") {
      setCircles((circlesRes.value.items ?? []).filter((c) => c.is_active));
    } else {
      setCircles([]);
    }
    if (tracksRes.status === "fulfilled") {
      setTracks(tracksRes.value.items ?? []);
    } else {
      setTracks([]);
    }
    setLoading(false);
  }, [hasApi]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={ds.page.title} style={tajawal}>
            إدارة المنسوبين
          </h2>
          <p className={ds.page.description} style={tajawal}>
            جدول موحّد لجميع المنسوبين — معلمون ومشرفون
          </p>
        </div>
      </div>

      <Card className={ds.card}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <CardTitle className="flex items-center gap-2" style={tajawal}>
              <UserCog className="w-5 h-5 text-primary" />
              قائمة المنسوبين
            </CardTitle>
            <CardDescription style={tajawal}>
              {items.length} منسوب مسجّل
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="default"
            className={ds.btnRound}
            style={tajawal}
            onClick={() => setAddOpen(true)}
          >
            إضافة منسوب
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
                  <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                    الاسم
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[14%]`} style={tajawal}>
                    الجوال
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                    الدور / المسمى
                  </TableHead>
                  <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                    الكيان المسند إليه
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
                      colSpan={5}
                      className={`${ds.table.cell} text-center text-muted-foreground`}
                      style={tajawal}
                    >
                      لا يوجد منسوبون
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {row.full_name_ar}
                      </TableCell>
                      <TableCell className={ds.table.cell} dir="ltr">
                        {row.mobile ?? "—"}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {staffRoleLabel(row.role)}
                        {row.is_active === 0 ? (
                          <span className="mr-2 text-xs text-amber-700">(معلق)</span>
                        ) : null}
                      </TableCell>
                      <TableCell className={ds.table.cell} style={tajawal}>
                        {assignedEntityLabel(row)}
                      </TableCell>
                      <TableActionsCell wide>
                        {row.role === "teacher" && (
                          <TableIconAction
                            kind="assign"
                            label="إسناد حلقة"
                            onClick={() => setAssignRow(row)}
                          />
                        )}
                        {row.role === "track_supervisor" && (
                          <TableIconAction
                            kind="assign"
                            label="إسناد مسار"
                            onClick={() => setAssignRow(row)}
                          />
                        )}
                        <TableIconAction
                          kind="edit"
                          onClick={() => setEditRow(row)}
                        />
                        {row.id !== SOVEREIGN_USER_ID && (
                          <TableIconAction
                            kind="more"
                            onClick={() => setActionRow(row)}
                          />
                        )}
                      </TableActionsCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddStaffDialog
        open={addOpen}
        circles={circles}
        tracks={tracks}
        onOpenChange={setAddOpen}
        onSaved={() => {
          setAddOpen(false);
          void load();
          toast.success("تمت الإضافة بنجاح");
        }}
      />

      {editRow && (
        <EditStaffDialog
          row={editRow}
          open
          onOpenChange={(o) => {
            if (!o) setEditRow(null);
          }}
          onSaved={() => {
            setEditRow(null);
            void load();
            toast.success("تم حفظ التعديلات");
          }}
        />
      )}

      {actionRow && (
        <AdminEntityActionModal
          open
          onOpenChange={(o) => {
            if (!o) setActionRow(null);
          }}
          entityTitle="المنسوب"
          entityName={actionRow.full_name_ar}
          isActive={actionRow.is_active !== 0}
          onToggleActive={async () => {
            try {
              const next = actionRow.is_active !== 0 ? 0 : 1;
              await api.adminStaffPatch(actionRow.id, { is_active: next });
              setItems((prev) =>
                prev.map((x) =>
                  x.id === actionRow.id ? { ...x, is_active: next } : x,
                ),
              );
              toast.success(next ? "تم التنشيط" : "تم التعليق");
              setActionRow(null);
            } catch (err) {
              toast.error(apiErrorMessage(err, "فشل تحديث الحالة"));
              throw err;
            }
          }}
          onDelete={async () => {
            try {
              await api.adminStaffDelete(actionRow.id);
              toast.success("تم الحذف من قاعدة البيانات");
              setItems((prev) => prev.filter((x) => x.id !== actionRow.id));
              setActionRow(null);
            } catch (err) {
              toast.error(apiErrorMessage(err, "فشل الحذف"));
              throw err;
            }
          }}
          deleteHint="سيتم فك ارتباط الحلقات والمسارات المرتبطة بهذا المنسوب."
        />
      )}

      {assignRow && (
        <AssignStaffDialog
          row={assignRow}
          circles={circles}
          tracks={tracks}
          open
          onOpenChange={(o) => {
            if (!o) setAssignRow(null);
          }}
          onSaved={() => {
            setAssignRow(null);
            void load();
            toast.success("تم الإسناد بنجاح");
          }}
        />
      )}
    </div>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  circles,
  tracks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  circles: AdminCircleRow[];
  tracks: AdminTrackRow[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<string>(ALL_STAFF_ROLES[4].value);
  const [scope, setScope] = useState(SCOPE_GLOBAL);
  const [circleId, setCircleId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setMobile("");
    setRole(ALL_STAFF_ROLES[4].value);
    setScope(SCOPE_GLOBAL);
    setCircleId("");
    setTrackId("");
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedMobile = mobile.trim();
      if (role === "teacher") {
        await api.adminTeachersCreate({
          full_name_ar: trimmedName,
          mobile: trimmedMobile,
          role: "teacher",
          ...(circleId ? { circle_id: Number(circleId) } : {}),
        });
      } else if (role === "track_supervisor") {
        await api.adminTeachersCreate({
          full_name_ar: trimmedName,
          mobile: trimmedMobile,
          role: "track_supervisor",
          ...(trackId ? { track_id: Number(trackId) } : {}),
          ...(circleId ? { circle_id: Number(circleId) } : {}),
        });
      } else {
        await api.adminSupervisorsCreate({
          full_name_ar: trimmedName,
          mobile: trimmedMobile,
          role: roleForApi(role),
          supervisor_scope: scope,
          track_id:
            role === "track_supervisor" && trackId ? Number(trackId) : undefined,
        });
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "فشل الإضافة"));
    } finally {
      setSaving(false);
    }
  }

  const isTeacher = role === "teacher";
  const isTrackSup = role === "track_supervisor";
  const isSupervisor =
    !isTeacher && !isTrackSup;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>إضافة منسوب</DialogTitle>
          <DialogDescription style={tajawal}>
            الاسم، الجوال، والدور
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1">
            <Label style={tajawal}>الاسم *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label style={tajawal}>الجوال *</Label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1">
            <Label style={tajawal}>الدور *</Label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setCircleId("");
                setTrackId("");
              }}
              className={ds.select}
              style={tajawal}
            >
              {ALL_STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {isSupervisor && (
            <div className="space-y-1">
              <Label style={tajawal}>نطاق الإشراف</Label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className={ds.select}
                style={tajawal}
              >
                <option value={SCOPE_GLOBAL}>{stageLabel(SCOPE_GLOBAL)}</option>
                {EDUCATIONAL_STAGES.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(isTeacher || isTrackSup) && (
            <div className="space-y-1">
              <Label style={tajawal}>
                {isTrackSup ? "المسار (اختياري)" : "الحلقة (اختياري)"}
              </Label>
              <select
                value={isTrackSup ? trackId : circleId}
                onChange={(e) =>
                  isTrackSup
                    ? setTrackId(e.target.value)
                    : setCircleId(e.target.value)
                }
                className={ds.select}
                style={tajawal}
              >
                <option value="">— بدون إسناد —</option>
                {(isTrackSup ? tracks : circles).map((x) => (
                  <option key={x.id} value={String(x.id)}>
                    {x.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: StaffMemberRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.full_name_ar);
  const [mobile, setMobile] = useState(row.mobile ?? "");
  const [role, setRole] = useState(() => normalizeRoleForForm(row.role));
  const [scope, setScope] = useState(SCOPE_GLOBAL);
  const [saving, setSaving] = useState(false);
  const readOnly = row.id === SOVEREIGN_USER_ID;

  useEffect(() => {
    if (!open) return;
    setName(row.full_name_ar);
    setMobile(row.mobile ?? "");
    setRole(normalizeRoleForForm(row.role));
    setScope(SCOPE_GLOBAL);
  }, [open, row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      const apiRole =
        role === "teacher" || role === "track_supervisor"
          ? role
          : roleForApi(role);
      await api.adminStaffPatch(row.id, {
        full_name_ar: name.trim(),
        mobile: mobile.trim(),
        role: apiRole,
        supervisor_scope:
          role === "teacher" || role === "track_supervisor" ? undefined : scope,
      });
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "فشل الحفظ"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>تعديل بيانات المنسوب</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="space-y-1">
            <Label style={tajawal}>الاسم</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              required
            />
          </div>
          <div className="space-y-1">
            <Label style={tajawal}>الجوال</Label>
            <Input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              dir="ltr"
              disabled={readOnly}
              required
            />
          </div>
          <div className="space-y-1">
            <Label style={tajawal}>الدور</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={ds.select}
              style={tajawal}
              disabled={readOnly}
            >
              {ALL_STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {role !== "teacher" && role !== "track_supervisor" && (
            <div className="space-y-1">
              <Label style={tajawal}>نطاق الإشراف</Label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className={ds.select}
                style={tajawal}
                disabled={readOnly}
              >
                <option value={SCOPE_GLOBAL}>{stageLabel(SCOPE_GLOBAL)}</option>
                {EDUCATIONAL_STAGES.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name_ar}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!readOnly && (
            <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
              {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignStaffDialog({
  row,
  circles,
  tracks,
  open,
  onOpenChange,
  onSaved,
}: {
  row: StaffMemberRow;
  circles: AdminCircleRow[];
  tracks: AdminTrackRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isTeacher = row.role === "teacher";
  const [circleId, setCircleId] = useState(
    row.circle_id ? String(row.circle_id) : "",
  );
  const [trackId, setTrackId] = useState(row.track_id ? String(row.track_id) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCircleId(row.circle_id ? String(row.circle_id) : "");
    setTrackId(row.track_id ? String(row.track_id) : "");
  }, [open, row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isTeacher) {
        if (!circleId) {
          toast.error("اختر حلقة");
          return;
        }
        await api.adminStaffPatch(row.id, { circle_id: Number(circleId) });
      } else {
        if (!trackId) {
          toast.error("اختر مساراً");
          return;
        }
        await api.adminStaffPatch(row.id, { track_id: Number(trackId) });
      }
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "فشل الإسناد"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>
            {isTeacher ? "إسناد حلقة" : "إسناد مسار"}
          </DialogTitle>
          <DialogDescription style={tajawal}>{row.full_name_ar}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <select
            value={isTeacher ? circleId : trackId}
            onChange={(e) =>
              isTeacher ? setCircleId(e.target.value) : setTrackId(e.target.value)
            }
            className={ds.select}
            style={tajawal}
            required
          >
            <option value="">— اختر —</option>
            {(isTeacher ? circles : tracks).map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.name_ar}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "تأكيد الإسناد"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
