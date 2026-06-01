import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CircleDot, Route } from "lucide-react";
import { CircleCapacityBadge } from "../../components/admin/CircleCapacityBadge";
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
  type AdminCircleRow,
  type AdminTrackRow,
  type StaffSupervisorRow,
  type StaffTeacherRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { EDUCATIONAL_STAGES, stageLabel, type StageId } from "../../lib/stages";
import { ds, tajawal } from "../../lib/design-system";

type SetupTab = "circles" | "tracks";

type EntityKind = "circle" | "track";

const ENTITY_TYPE_LABEL: Record<EntityKind, string> = {
  circle: "حلقة",
  track: "مسار",
};

export function CirclesSetupPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SetupTab = searchParams.get("tab") === "tracks" ? "tracks" : "circles";

  function setTab(next: SetupTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "tracks") params.set("tab", "tracks");
    else params.delete("tab");
    setSearchParams(params);
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          إدارة الحلقات والمسارات
        </h2>
        <p className={ds.page.description} style={tajawal}>
          هيكل المجمع — السعة الافتراضية إلزامية؛ العدد الحالي = عدد الطلاب النشطين
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "circles" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("circles")}
          style={tajawal}
        >
          الحلقات
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "tracks" ? "default" : "outline"}
          className={ds.btnRound}
          onClick={() => setTab("tracks")}
          style={tajawal}
        >
          المسارات
        </Button>
      </div>

      {tab === "circles" ? <CirclesPanel /> : <TracksPanel />}
    </div>
  );
}

function CirclesPanel() {
  const [items, setItems] = useState<AdminCircleRow[]>([]);
  const [teachers, setTeachers] = useState<StaffTeacherRow[]>([]);
  const [tracks, setTracks] = useState<AdminTrackRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState<StageId>(2);
  const [defaultCapacity, setDefaultCapacity] = useState("20");
  const [teacherId, setTeacherId] = useState("");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [newTeacherMobile, setNewTeacherMobile] = useState("");
  const [trackId, setTrackId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editCircle, setEditCircle] = useState<AdminCircleRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editStageId, setEditStageId] = useState<StageId>(2);
  const [editCapacity, setEditCapacity] = useState("");
  const [editTrackId, setEditTrackId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hasApi = Boolean(getApiToken());

  const load = useCallback(async () => {
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط API");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [c, t, tr] = await Promise.allSettled([
      api.adminCirclesSummary(),
      api.adminTeachers(),
      api.adminTracks(),
    ]);
    const loadErrors: string[] = [];
    if (c.status === "fulfilled") {
      setItems(c.value.items ?? []);
    } else {
      console.error("[circles-setup] circles:", c.reason);
      setItems([]);
      loadErrors.push("الحلقات");
    }
    if (t.status === "fulfilled") {
      setTeachers(t.value.items ?? []);
    } else {
      console.error("[circles-setup] teachers:", t.reason);
      setTeachers([]);
      loadErrors.push("المعلمين");
    }
    if (tr.status === "fulfilled") {
      setTracks(tr.value.items ?? []);
    } else {
      console.error("[circles-setup] tracks:", tr.reason);
      setTracks([]);
      loadErrors.push("المسارات");
    }
    setError(
      loadErrors.length > 0
        ? `تعذر تحميل: ${loadErrors.join("، ")}`
        : null,
    );
    setLoading(false);
  }, [hasApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId && (!newTeacherName.trim() || !newTeacherMobile.trim())) {
      setError("اختر معلمًا أو أدخل بيانات معلم جديد");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.adminCirclesCreate({
        name_ar: name.trim(),
        stage_id: stageId,
        default_capacity: Number(defaultCapacity),
        teacher_user_id: teacherId ? Number(teacherId) : undefined,
        new_teacher:
          !teacherId && newTeacherName.trim()
            ? {
                full_name_ar: newTeacherName.trim(),
                mobile: newTeacherMobile.trim(),
              }
            : undefined,
        track_id: trackId ? Number(trackId) : null,
      });
      setShowForm(false);
      setName("");
      setTeacherId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <CircleDot className="w-5 h-5 text-primary" />
            الحلقات
          </CardTitle>
          <CardDescription style={tajawal}>
            اسم الحلقة · المعلم · المرحلة · عدد الطلاب · السعة (حالي/افتراضي)
          </CardDescription>
        </div>
        <Button
          variant="default"
          className={`${ds.btnRound} shrink-0`}
          style={tajawal}
          type="button"
          onClick={() => setShowForm(true)}
        >
          إضافة حلقة
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className={ds.dialog} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>إضافة حلقة</DialogTitle>
              <DialogDescription style={tajawal}>
                اسم الحلقة، المرحلة، المعلم، والسعة الافتراضية.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                نوع الكيان *
              </label>
              <select
                value="circle"
                disabled
                className={ds.select}
                style={tajawal}
                aria-readonly
              >
                <option value="circle">{ENTITY_TYPE_LABEL.circle}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                اسم الحلقة *
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                المرحلة *
              </label>
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
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                السعة الافتراضية *
              </label>
              <Input
                type="number"
                min={1}
                value={defaultCapacity}
                onChange={(e) => setDefaultCapacity(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                المعلم *
              </label>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className={ds.select}
                style={tajawal}
              >
                <option value="">— معلم جديد أدناه —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.full_name_ar}
                  </option>
                ))}
              </select>
            </div>
            {!teacherId && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    اسم المعلم الجديد *
                  </label>
                  <Input
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    جوال المعلم *
                  </label>
                  <Input
                    value={newTeacherMobile}
                    onChange={(e) => setNewTeacherMobile(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold mb-1" style={tajawal}>
                مسار (اختياري)
              </label>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className={ds.select}
                style={tajawal}
              >
                <option value="">— بدون مسار —</option>
                {tracks.map((tr) => (
                  <option key={tr.id} value={String(tr.id)}>
                    {tr.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
              {saving ? "جاري الحفظ…" : "حفظ الحلقة"}
            </Button>
            </form>
          </DialogContent>
        </Dialog>
        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                  نوع الكيان
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  اسم الحلقة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[16%]`} style={tajawal}>
                  المعلم
                </TableHead>
                <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                  المرحلة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                  عدد الطلاب
                </TableHead>
                <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                  السعة
                </TableHead>
                <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                  تنبيه
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {ENTITY_TYPE_LABEL.circle}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.name_ar}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.teacher_name ?? "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {stageLabel(c.stage_id as StageId)}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.student_count}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {c.student_count}/{c.default_capacity}
                  </TableCell>
                  <TableCell className={ds.table.cell}>
                    <CircleCapacityBadge circle={c} showFraction={false} />
                  </TableCell>
                  <TableActionsCell>
                    <TableIconAction
                      kind="edit"
                      onClick={() => {
                        setEditCircle(c);
                        setEditName(c.name_ar);
                        setEditStageId(c.stage_id as StageId);
                        setEditCapacity(String(c.default_capacity));
                        setEditTrackId(c.track_id ? String(c.track_id) : "");
                      }}
                    />
                    <TableIconAction
                      kind="delete"
                      onClick={async () => {
                        if (!confirm(`تعطيل الحلقة «${c.name_ar}»؟`)) return;
                        await api.adminCirclesPatch(c.id, { is_active: 0 });
                        await load();
                      }}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Dialog
          open={editCircle != null}
          onOpenChange={(o) => {
            if (!o) setEditCircle(null);
          }}
        >
          <DialogContent className={ds.dialog} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>تعديل حلقة</DialogTitle>
            </DialogHeader>
            {editCircle && (
              <form
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.adminCirclesPatch(editCircle.id, {
                    name_ar: editName.trim(),
                    stage_id: editStageId,
                    default_capacity: Number(editCapacity),
                    track_id: editTrackId ? Number(editTrackId) : null,
                  });
                  setEditCircle(null);
                  await load();
                }}
              >
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    نوع الكيان
                  </label>
                  <select
                    value="circle"
                    disabled
                    className={ds.select}
                    style={tajawal}
                    aria-readonly
                  >
                    <option value="circle">{ENTITY_TYPE_LABEL.circle}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    الاسم
                  </label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    المرحلة
                  </label>
                  <select
                    value={editStageId}
                    onChange={(e) => setEditStageId(Number(e.target.value) as StageId)}
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
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    السعة
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    المسار
                  </label>
                  <select
                    value={editTrackId}
                    onChange={(e) => setEditTrackId(e.target.value)}
                    className={ds.select}
                    style={tajawal}
                  >
                    <option value="">— بدون —</option>
                    {tracks.map((tr) => (
                      <option key={tr.id} value={String(tr.id)}>
                        {tr.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className={`sm:col-span-2 ${ds.btnRound}`} style={tajawal}>
                  حفظ التعديلات
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function TracksPanel() {
  const [items, setItems] = useState<AdminTrackRow[]>([]);
  const [circles, setCircles] = useState<AdminCircleRow[]>([]);
  const [supervisors, setSupervisors] = useState<StaffSupervisorRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [defaultCapacity, setDefaultCapacity] = useState("20");
  const [supervisorId, setSupervisorId] = useState("");
  const [selectedStages, setSelectedStages] = useState<number[]>([3, 4]);
  const [selectedCircles, setSelectedCircles] = useState<number[]>([]);
  const [editTrack, setEditTrack] = useState<AdminTrackRow | null>(null);
  const [editTrackName, setEditTrackName] = useState("");
  const [editTrackCapacity, setEditTrackCapacity] = useState("");
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
    const [tr, c, sup] = await Promise.allSettled([
      api.adminTracks(),
      api.adminCirclesSummary(),
      api.adminSupervisors(),
    ]);
    const loadErrors: string[] = [];
    if (tr.status === "fulfilled") {
      setItems(tr.value.items ?? []);
    } else {
      console.error("[circles-setup] tracks:", tr.reason);
      setItems([]);
      loadErrors.push("المسارات");
    }
    if (c.status === "fulfilled") {
      setCircles(c.value.items ?? []);
    } else {
      console.error("[circles-setup] circles:", c.reason);
      setCircles([]);
      loadErrors.push("الحلقات");
    }
    if (sup.status === "fulfilled") {
      const trackSup = (sup.value.items ?? []).filter((s) =>
        ["track_supervisor", "admin_supervisor", "general_supervisor"].includes(
          s.role,
        ),
      );
      setSupervisors(trackSup.length > 0 ? trackSup : sup.value.items ?? []);
    } else {
      console.error("[circles-setup] supervisors:", sup.reason);
      setSupervisors([]);
      loadErrors.push("المشرفين");
    }
    setError(
      loadErrors.length > 0
        ? `تعذر تحميل: ${loadErrors.join("، ")}`
        : null,
    );
    setLoading(false);
  }, [hasApi]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleStage(id: number) {
    setSelectedStages((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleCircle(id: number) {
    setSelectedCircles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisorId) {
      setError("اختر مشرف المسار");
      return;
    }
    if (selectedStages.length === 0) {
      setError("اختر مرحلة واحدة على الأقل للمسار");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.adminTracksCreate({
        name_ar: name.trim(),
        default_capacity: Number(defaultCapacity),
        supervisor_id: Number(supervisorId),
        stage_ids: selectedStages,
        circle_ids: selectedCircles,
      });
      setShowForm(false);
      setName("");
      setSupervisorId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={ds.card}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <CardTitle className="flex items-center gap-2" style={tajawal}>
            <Route className="w-5 h-5 text-primary" />
            المسارات
          </CardTitle>
          <CardDescription style={tajawal}>
            مسار قد يضم طلاباً من حلقات ومراحل متعددة
          </CardDescription>
        </div>
        <Button
          variant="default"
          className={`${ds.btnRound} shrink-0`}
          style={tajawal}
          type="button"
          onClick={() => setShowForm(true)}
        >
          إضافة مسار
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent
            className={`${ds.card} max-w-lg max-h-[90vh] overflow-y-auto`}
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle style={tajawal}>إضافة مسار</DialogTitle>
              <DialogDescription style={tajawal}>
                اسم المسار، المشرف، المراحل، والحلقات المرتبطة.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  نوع الكيان *
                </label>
                <select
                  value="track"
                  disabled
                  className={ds.select}
                  style={tajawal}
                  aria-readonly
                >
                  <option value="track">{ENTITY_TYPE_LABEL.track}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  اسم المسار *
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  السعة الافتراضية *
                </label>
                <Input
                  type="number"
                  min={1}
                  value={defaultCapacity}
                  onChange={(e) => setDefaultCapacity(e.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-1" style={tajawal}>
                  مشرف المسار *
                </label>
                <select
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className={ds.select}
                  required
                  style={tajawal}
                >
                  <option value="">— اختر المشرف —</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name_ar}
                    </option>
                  ))}
                </select>
                {supervisors.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1" style={tajawal}>
                    أضف مشرفاً من تبويب «المشرفون» في إدارة المنسوبين أولاً.
                  </p>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2" style={tajawal}>
                المراحل المشمولة *
              </p>
              <div className="flex flex-wrap gap-2">
                {EDUCATIONAL_STAGES.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={selectedStages.includes(s.id) ? "default" : "outline"}
                    className={ds.btnRound}
                    onClick={() => toggleStage(s.id)}
                    style={tajawal}
                  >
                    {s.name_ar}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2" style={tajawal}>
                حلقات مرتبطة (اختياري)
              </p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {circles.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    size="sm"
                    variant={selectedCircles.includes(c.id) ? "default" : "outline"}
                    className={ds.btnRound}
                    onClick={() => toggleCircle(c.id)}
                    style={tajawal}
                  >
                    {c.name_ar}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
              {saving ? "جاري الحفظ…" : "حفظ المسار"}
            </Button>
            </form>
          </DialogContent>
        </Dialog>
        {loading ? (
          <p className="text-muted-foreground" style={tajawal}>
            جاري التحميل…
          </p>
        ) : (
          <Table className={ds.tableMin}>
            <TableHeader>
              <TableRow>
                <TableHead className={`${ds.table.head} w-[10%]`} style={tajawal}>
                  نوع الكيان
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  المسار
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  مشرف المسار
                </TableHead>
                <TableHead className={`${ds.table.head} w-[22%]`} style={tajawal}>
                  المراحل
                </TableHead>
                <TableHead className={`${ds.table.head} w-[18%]`} style={tajawal}>
                  الحلقات
                </TableHead>
                <TableHead className={`${ds.table.head} w-[12%]`} style={tajawal}>
                  الطلاب
                </TableHead>
                <TableHead className={ds.table.headActions} style={tajawal}>
                  إجراء
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {ENTITY_TYPE_LABEL.track}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {t.name_ar}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {t.supervisor_name ?? "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {t.stage_ids.length > 0
                      ? t.stage_ids
                          .map((id) => stageLabel(id as StageId))
                          .join(" · ")
                      : "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {t.circles.map((c) => c.name_ar).join("، ") || "—"}
                  </TableCell>
                  <TableCell className={ds.table.cell} style={tajawal}>
                    {t.student_count}
                  </TableCell>
                  <TableActionsCell>
                    <TableIconAction
                      kind="edit"
                      onClick={() => {
                        setEditTrack(t);
                        setEditTrackName(t.name_ar);
                        setEditTrackCapacity(String(t.default_capacity));
                      }}
                    />
                    <TableIconAction
                      kind="delete"
                      onClick={async () => {
                        if (!confirm(`تعطيل المسار «${t.name_ar}»؟`)) return;
                        await api.adminTracksPatch(t.id, { is_active: 0 });
                        await load();
                      }}
                    />
                  </TableActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Dialog
          open={editTrack != null}
          onOpenChange={(o) => {
            if (!o) setEditTrack(null);
          }}
        >
          <DialogContent className={ds.dialog} dir="rtl">
            <DialogHeader>
              <DialogTitle style={tajawal}>تعديل مسار</DialogTitle>
            </DialogHeader>
            {editTrack && (
              <form
                className="grid gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.adminTracksPatch(editTrack.id, {
                    name_ar: editTrackName.trim(),
                    default_capacity: Number(editTrackCapacity),
                  });
                  setEditTrack(null);
                  await load();
                }}
              >
                <div>
                  <label className="block text-sm font-semibold mb-1" style={tajawal}>
                    نوع الكيان
                  </label>
                  <select
                    value="track"
                    disabled
                    className={ds.select}
                    style={tajawal}
                    aria-readonly
                  >
                    <option value="track">{ENTITY_TYPE_LABEL.track}</option>
                  </select>
                </div>
                <Input
                  value={editTrackName}
                  onChange={(e) => setEditTrackName(e.target.value)}
                  required
                />
                <Input
                  type="number"
                  min={1}
                  value={editTrackCapacity}
                  onChange={(e) => setEditTrackCapacity(e.target.value)}
                  required
                />
                <Button type="submit" className={ds.btnRound} style={tajawal}>
                  حفظ
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
