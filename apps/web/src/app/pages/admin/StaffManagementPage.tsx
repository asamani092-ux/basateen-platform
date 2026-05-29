import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { UserCog, Users } from "lucide-react";
import { StaffActionDialog } from "../../components/shared/StaffActionDialog";
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
  SUPERVISOR_TYPES,
  stageLabel,
  type StageId,
} from "../../lib/stages";
import {
  api,
  type AdminCircleRow,
  type StaffSupervisorRow,
  type StaffTeacherRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { roleLabelAr } from "../../lib/role-labels";
import { ds, tajawal } from "../../lib/design-system";

type StaffTab = "teachers" | "supervisors";

export function StaffManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: StaffTab =
    searchParams.get("tab") === "supervisors" ? "supervisors" : "teachers";

  function setTab(next: StaffTab) {
    setSearchParams(next === "supervisors" ? { tab: "supervisors" } : {});
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إدارة المنسوبين
        </h2>
        <p className={ds.page.description} style={tajawal}>
          حصرياً للمدير العام — إضافة المعلمين والمشرفين وربط الجوال
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "teachers" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("teachers")}
          style={tajawal}
        >
          المعلمون
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "supervisors" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("supervisors")}
          style={tajawal}
        >
          المشرفون
        </Button>
      </div>

      {tab === "teachers" ? <TeachersPanel /> : <SupervisorsPanel />}
    </div>
  );
}

function TeachersPanel() {
  const [items, setItems] = useState<StaffTeacherRow[]>([]);
  const [circles, setCircles] = useState<AdminCircleRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<StaffTeacherRow | null>(null);
  const [actionTeacher, setActionTeacher] = useState<StaffTeacherRow | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [circleId, setCircleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        api.adminTeachers(),
        api.adminCirclesSummary(),
      ]);
      setItems(t.items);
      setCircles(c.items.filter((x) => x.is_active));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!circleId) {
      setError("اختر حلقة للمعلم");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.adminTeachersCreate({
        full_name_ar: name.trim(),
        mobile: mobile.trim(),
        circle_id: Number(circleId),
      });
      setAddOpen(false);
      setName("");
      setMobile("");
      setCircleId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <Users className="w-5 h-5 text-primary" />
            قائمة المعلمين
          </CardTitle>
          <CardDescription style={tajawal}>
            كل معلم مربوط بحلقة واحدة (إلزامي)
          </CardDescription>
        </div>
        <Button
          className={ds.btnRound}
          style={tajawal}
          type="button"
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
        >
          إضافة معلم
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>إضافة معلم</DialogTitle>
              <DialogDescription style={tajawal}>
                الاسم، الجوال، والحلقة المرتبطة.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitAdd} className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  الاسم *
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  الجوال *
                </label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  الحلقة *
                </label>
                <select
                  value={circleId}
                  onChange={(e) => setCircleId(e.target.value)}
                  required
                  className={ds.select}
                  style={tajawal}
                >
                  <option value="">— اختر الحلقة —</option>
                  {circles.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name_ar} ({c.student_count}/{c.default_capacity})
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
                {saving ? "جاري الحفظ…" : "حفظ المعلم"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {editTeacher && (
          <TeacherEditDialog
            teacher={editTeacher}
            circles={circles}
            open
            onOpenChange={(o) => {
              if (!o) setEditTeacher(null);
            }}
            onSaved={() => {
              setEditTeacher(null);
              void load();
            }}
          />
        )}

        {actionTeacher && (
          <StaffActionDialog
            open
            onOpenChange={(o) => {
              if (!o) setActionTeacher(null);
            }}
            personName={actionTeacher.full_name_ar}
            isActive={Boolean(actionTeacher.is_active)}
            onFreeze={async () => {
              await api.adminTeachersPatch(actionTeacher.id, { is_active: 0 });
              await load();
            }}
            onActivate={async () => {
              await api.adminTeachersPatch(actionTeacher.id, { is_active: 1 });
              await load();
            }}
            onDelete={async () => {
              await api.adminTeachersDelete(actionTeacher.id);
              await load();
            }}
          />
        )}

        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]" style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className="w-[18%]" style={tajawal}>
                  الجوال
                </TableHead>
                <TableHead className="w-[22%]" style={tajawal}>
                  الحلقة
                </TableHead>
                <TableHead className="w-[12%]" style={tajawal}>
                  الحالة
                </TableHead>
                <TableHead className="w-[24%]" style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell style={tajawal}>{t.full_name_ar}</TableCell>
                  <TableCell style={tajawal}>{t.mobile ?? "—"}</TableCell>
                  <TableCell style={tajawal}>{t.circle_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? "secondary" : "destructive"}>
                      {t.is_active ? "نشط" : "مجمّد"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditTeacher(t)}
                    >
                      تعديل
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActionTeacher(t)}
                    >
                      تجميد / حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TeacherEditDialog({
  teacher,
  circles,
  open,
  onOpenChange,
  onSaved,
}: {
  teacher: StaffTeacherRow;
  circles: AdminCircleRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(teacher.full_name_ar);
  const [mobile, setMobile] = useState(teacher.mobile ?? "");
  const [circleId, setCircleId] = useState(
    teacher.circle_id ? String(teacher.circle_id) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.adminTeachersPatch(teacher.id, {
        full_name_ar: name.trim(),
        mobile: mobile.trim(),
        circle_id: circleId ? Number(circleId) : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>تعديل معلم</DialogTitle>
          <DialogDescription style={tajawal}>{teacher.full_name_ar}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <form onSubmit={save} className="grid grid-cols-1 gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <select
            value={circleId}
            onChange={(e) => setCircleId(e.target.value)}
            className={ds.select}
            style={tajawal}
          >
            <option value="">—</option>
            {circles.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name_ar}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupervisorsPanel() {
  const [items, setItems] = useState<StaffSupervisorRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editSupervisor, setEditSupervisor] = useState<StaffSupervisorRow | null>(null);
  const [actionSupervisor, setActionSupervisor] = useState<StaffSupervisorRow | null>(
    null,
  );
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [roleType, setRoleType] = useState(SUPERVISOR_TYPES[0].value);
  const [scope, setScope] = useState<string>(SCOPE_GLOBAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.adminSupervisors();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.adminSupervisorsCreate({
        full_name_ar: name.trim(),
        mobile: mobile.trim(),
        role: roleType,
        supervisor_scope: scope,
      });
      setAddOpen(false);
      setName("");
      setMobile("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <UserCog className="w-5 h-5 text-primary" />
            قائمة المشرفين
          </CardTitle>
          <CardDescription style={tajawal}>
            نوع الصلاحية + نطاق المرحلة إلزاميان
          </CardDescription>
        </div>
        <Button
          className={ds.btnRound}
          style={tajawal}
          type="button"
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
        >
          إضافة مشرف
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>إضافة مشرف</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  الاسم *
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  الجوال *
                </label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  نوع المشرف *
                </label>
                <select
                  value={roleType}
                  onChange={(e) => setRoleType(e.target.value)}
                  className={ds.select}
                  style={tajawal}
                >
                  {SUPERVISOR_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  نطاق المرحلة *
                </label>
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
              <Button
                type="submit"
                disabled={saving}
                className={`sm:col-span-2 ${ds.btnRound}`}
                style={tajawal}
              >
                {saving ? "جاري الحفظ…" : "حفظ المشرف"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {editSupervisor && (
          <SupervisorEditDialog
            supervisor={editSupervisor}
            open
            onOpenChange={(o) => {
              if (!o) setEditSupervisor(null);
            }}
            onSaved={() => {
              setEditSupervisor(null);
              void load();
            }}
          />
        )}

        {actionSupervisor && (
          <StaffActionDialog
            open
            onOpenChange={(o) => {
              if (!o) setActionSupervisor(null);
            }}
            personName={actionSupervisor.full_name_ar}
            isActive={Boolean(actionSupervisor.is_active)}
            onFreeze={async () => {
              await api.adminSupervisorsPatch(actionSupervisor.id, { is_active: 0 });
              await load();
            }}
            onActivate={async () => {
              await api.adminSupervisorsPatch(actionSupervisor.id, { is_active: 1 });
              await load();
            }}
            onDelete={async () => {
              await api.adminSupervisorsDelete(actionSupervisor.id);
              await load();
            }}
          />
        )}

        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]" style={tajawal}>
                  الاسم
                </TableHead>
                <TableHead className="w-[16%]" style={tajawal}>
                  الجوال
                </TableHead>
                <TableHead className="w-[22%]" style={tajawal}>
                  الدور
                </TableHead>
                <TableHead className="w-[18%]" style={tajawal}>
                  النطاق
                </TableHead>
                <TableHead className="w-[12%]" style={tajawal}>
                  الحالة
                </TableHead>
                <TableHead className="w-[12%]" style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell style={tajawal}>{s.full_name_ar}</TableCell>
                  <TableCell style={tajawal}>{s.mobile ?? "—"}</TableCell>
                  <TableCell style={tajawal}>{roleLabelAr(s.role)}</TableCell>
                  <TableCell style={tajawal}>
                    {s.supervisor_scope === SCOPE_GLOBAL
                      ? stageLabel(SCOPE_GLOBAL)
                      : stageLabel(Number(s.supervisor_scope) as StageId)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "secondary" : "destructive"}>
                      {s.is_active ? "نشط" : "مجمّد"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditSupervisor(s)}
                    >
                      تعديل
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setActionSupervisor(s)}
                    >
                      تجميد / حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SupervisorEditDialog({
  supervisor,
  open,
  onOpenChange,
  onSaved,
}: {
  supervisor: StaffSupervisorRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(supervisor.full_name_ar);
  const [mobile, setMobile] = useState(supervisor.mobile ?? "");
  const [roleType, setRoleType] = useState(supervisor.role);
  const [scope, setScope] = useState(supervisor.supervisor_scope ?? SCOPE_GLOBAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.adminSupervisorsPatch(supervisor.id, {
        full_name_ar: name.trim(),
        mobile: mobile.trim(),
        role: roleType,
        supervisor_scope: scope,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.card} max-w-md`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>تعديل مشرف</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <form onSubmit={save} className="grid grid-cols-1 gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <select
            value={roleType}
            onChange={(e) => setRoleType(e.target.value)}
            className={ds.select}
            style={tajawal}
          >
            {SUPERVISOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
