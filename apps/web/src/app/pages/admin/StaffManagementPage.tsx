import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { UserCog, Users } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
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

  async function submit(e: React.FormEvent) {
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
      setShowForm(false);
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

  async function toggleActive(id: number, active: number) {
    await api.adminTeachersPatch(id, { is_active: active ? 0 : 1 });
    await load();
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
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "إلغاء" : "إضافة معلم"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        {showForm && (
          <form
            onSubmit={submit}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl border border-border bg-muted/30"
          >
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
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                الحلقة *
              </label>
              <select
                value={circleId}
                onChange={(e) => setCircleId(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
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
        )}
        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={tajawal}>الاسم</TableHead>
                <TableHead style={tajawal}>الجوال</TableHead>
                <TableHead style={tajawal}>الحلقة</TableHead>
                <TableHead style={tajawal}>الحالة</TableHead>
                <TableHead style={tajawal}>إجراء</TableHead>
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
                  <TableCell className="space-x-2 space-x-reverse">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditId(editId === t.id ? null : t.id)}
                    >
                      تعديل
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(t.id, t.is_active)}
                    >
                      {t.is_active ? "تجميد" : "تفعيل"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {editId != null && (
          <TeacherEditRow
            teacher={items.find((x) => x.id === editId)!}
            circles={circles}
            onDone={() => {
              setEditId(null);
              load();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TeacherEditRow({
  teacher,
  circles,
  onDone,
}: {
  teacher: StaffTeacherRow;
  circles: AdminCircleRow[];
  onDone: () => void;
}) {
  const [name, setName] = useState(teacher.full_name_ar);
  const [mobile, setMobile] = useState(teacher.mobile ?? "");
  const [circleId, setCircleId] = useState(
    teacher.circle_id ? String(teacher.circle_id) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await api.adminTeachersPatch(teacher.id, {
      full_name_ar: name.trim(),
      mobile: mobile.trim(),
      circle_id: circleId ? Number(circleId) : undefined,
    });
    setSaving(false);
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border rounded-2xl bg-muted/20"
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
      <select
        value={circleId}
        onChange={(e) => setCircleId(e.target.value)}
        className="rounded-xl border px-3 py-2"
      >
        <option value="">—</option>
        {circles.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name_ar}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={saving}>
        حفظ
      </Button>
    </form>
  );
}

function SupervisorsPanel() {
  const [items, setItems] = useState<StaffSupervisorRow[]>([]);
  const [showForm, setShowForm] = useState(false);
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

  async function submit(e: React.FormEvent) {
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
      setShowForm(false);
      setName("");
      setMobile("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: number, active: number) {
    await api.adminSupervisorsPatch(id, { is_active: active ? 0 : 1 });
    await load();
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
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "إلغاء" : "إضافة مشرف"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        {showForm && (
          <form
            onSubmit={submit}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl border border-border bg-muted/30"
          >
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
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
            <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
              {saving ? "جاري الحفظ…" : "حفظ المشرف"}
            </Button>
          </form>
        )}
        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={tajawal}>الاسم</TableHead>
                <TableHead style={tajawal}>الجوال</TableHead>
                <TableHead style={tajawal}>الدور</TableHead>
                <TableHead style={tajawal}>النطاق</TableHead>
                <TableHead style={tajawal}>الحالة</TableHead>
                <TableHead style={tajawal}>إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell style={tajawal}>{s.full_name_ar}</TableCell>
                  <TableCell style={tajawal}>{s.mobile ?? "—"}</TableCell>
                  <TableCell style={tajawal}>{s.role}</TableCell>
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
                  <TableCell className="gap-2 flex flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(s.id, s.is_active)}
                    >
                      {s.is_active ? "تجميد" : "تفعيل"}
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
