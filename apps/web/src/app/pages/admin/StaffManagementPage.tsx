import { useCallback, useEffect, useState } from "react";
import { GuardedForm } from "../../components/ui/guarded-form";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { AdminEntityActionModal } from "../../components/admin/AdminEntityActionModal";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
import {
  TablePagination,
  type PageInfo,
} from "../../components/shared/TablePagination";
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
} from "../../lib/stages";
import { api, type StaffMemberRow } from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";
import {
  adminInvalidateFor,
  useAdminDataSync,
  useAdminDataSyncContext,
} from "../../context/AdminDataSyncContext";

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
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffMemberRow | null>(null);
  const [actionRow, setActionRow] = useState<StaffMemberRow | null>(null);
  const hasApi = Boolean(getApiToken());
  const { invalidate } = useAdminDataSyncContext();

  const load = useCallback(async () => {
    if (!hasApi) {
      toast.error("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    const staffRes = await Promise.allSettled([api.adminStaff({ page })]);
    if (staffRes[0].status === "fulfilled") {
      const payload = staffRes[0].value as {
        items?: StaffMemberRow[];
        page?: PageInfo;
        error?: string;
        message?: string;
      };
      if (payload.error) {
        toast.error(payload.message ?? "تعذر تحميل المنسوبين");
        setItems([]);
        setPageInfo(null);
      } else {
        setItems(payload.items ?? []);
        setPageInfo(payload.page ?? null);
      }
    } else {
      console.error("[staff] list:", staffRes[0].reason);
      setItems([]);
      setPageInfo(null);
      toast.error(apiErrorMessage(staffRes[0].reason, "تعذر تحميل المنسوبين"));
    }
    setLoading(false);
  }, [hasApi, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useAdminDataSync(["staff"], load);

  function afterStaffMutation() {
    invalidate(adminInvalidateFor("staff"));
    void load();
  }

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
              {pageInfo?.total ?? items.length} منسوب مسجّل
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
            <div className={ds.tableWrap}>
            <Table className={ds.tableMin}>
              <TableHeader>
                <TableRow>
                  <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                    الاسم
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPhone}`} style={tajawal}>
                    الجوال
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPlacement}`} style={tajawal}>
                    الدور / المسمى
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPlacement}`} style={tajawal}>
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
                      <TableTruncatedCell className={ds.table.colName} style={tajawal}>
                        {row.full_name_ar}
                      </TableTruncatedCell>
                      <TableTruncatedCell
                        className={ds.table.colPhone}
                        style={{ direction: "ltr" }}
                      >
                        {row.mobile ?? "—"}
                      </TableTruncatedCell>
                      <TableTruncatedCell style={tajawal}>
                        {staffRoleLabel(row.role)}
                        {row.is_active === 0 ? (
                          <span className="mr-2 text-xs text-amber-700">(معلق)</span>
                        ) : null}
                      </TableTruncatedCell>
                      <TableTruncatedCell title={assignedEntityLabel(row)} style={tajawal}>
                        {assignedEntityLabel(row)}
                      </TableTruncatedCell>
                      <TableActionsCell wide>
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
            {pageInfo && (
              <TablePagination page={pageInfo} onPageChange={setPage} />
            )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          setAddOpen(false);
          afterStaffMutation();
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
            afterStaffMutation();
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
              afterStaffMutation();
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
              afterStaffMutation();
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

    </div>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState<string>(ALL_STAFF_ROLES[4].value);
  const [scope, setScope] = useState<string>(SCOPE_GLOBAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setMobile("");
    setRole(ALL_STAFF_ROLES[4].value);
    setScope(SCOPE_GLOBAL);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedMobile = mobile.trim();
      if (role === "teacher" || role === "track_supervisor") {
        await api.adminTeachersCreate({
          full_name_ar: trimmedName,
          mobile: trimmedMobile,
          role,
        });
      } else {
        await api.adminSupervisorsCreate({
          full_name_ar: trimmedName,
          mobile: trimmedMobile,
          role: roleForApi(role),
          supervisor_scope: scope,
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
  const isSupervisor = !isTeacher && !isTrackSup;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.dialog} sm:max-w-md`} dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle style={tajawal}>إضافة منسوب</DialogTitle>
          <DialogDescription style={tajawal}>
            الاسم، الجوال، والدور
          </DialogDescription>
        </DialogHeader>
        <GuardedForm onSubmit={submit} className="grid gap-3">
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
              onChange={(e) => setRole(e.target.value)}
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
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </GuardedForm>
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
  const [scope, setScope] = useState<string>(SCOPE_GLOBAL);
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
        <GuardedForm onSubmit={submit} className="grid gap-3">
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
        </GuardedForm>
      </DialogContent>
    </Dialog>
  );
}

