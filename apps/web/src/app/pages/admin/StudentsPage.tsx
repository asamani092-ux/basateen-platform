import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  api,
  type EducationalGroupRow,
  type StudentRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { ds, tajawal } from "../../lib/design-system";
import { cn } from "../../components/ui/utils";

const BULK_PLACEHOLDER =
  "انسخ البيانات من الإكسل والصقها هنا\n" +
  "الترتيب (مفصولة بتاب): الاسم، الهوية، الجنسية، جوال الطالب، جوال الولي، المدرسة، الصف، اسم الحلقة/المسار";

function parsePlacementValue(value: string): {
  circle_id: number | null;
  track_id: number | null;
} {
  if (!value) return { circle_id: null, track_id: null };
  const [kind, idStr] = value.split(":");
  const id = Number(idStr);
  if (!Number.isFinite(id)) return { circle_id: null, track_id: null };
  if (kind === "circle") return { circle_id: id, track_id: null };
  if (kind === "track") return { circle_id: null, track_id: id };
  return { circle_id: null, track_id: null };
}

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [groups, setGroups] = useState<EducationalGroupRow[]>([]);
  const hasApi = Boolean(getApiToken());

  useEffect(() => {
    if (!hasApi) return;
    void api
      .adminEducationalGroups()
      .then((res) => setGroups(res.items))
      .catch(() => setGroups([]));
  }, [hasApi]);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط النظام");
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.students(query);
      const payload = res as {
        items?: StudentRow[];
        error?: string;
        message?: string;
      };
      if (payload.error) {
        setError(payload.message ?? "تعذّر تحميل قائمة الطلاب");
        setItems(payload.items ?? []);
      } else {
        setItems(payload.items ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hasApi]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  async function toggleSuspend(student: StudentRow) {
    const suspended = student.account_status === "suspended";
    const next = suspended ? "active" : "suspended";
    const label = suspended ? "تنشيط" : "تعليق";
    if (
      !confirm(
        `${label} الطالب «${student.full_name_ar}»؟`,
      )
    ) {
      return;
    }
    try {
      await api.studentsPatch(student.id, { account_status: next });
      setItems((prev) =>
        prev.map((x) =>
          x.id === student.id ? { ...x, account_status: next } : x,
        ),
      );
      toast.success(suspended ? "تم تنشيط الطالب" : "تم تعليق الطالب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تحديث الحالة");
    }
  }

  async function removeStudent(student: StudentRow) {
    if (
      !confirm(
        `حذف الطالب «${student.full_name_ar}» نهائياً مع سجلاته المرتبطة؟`,
      )
    ) {
      return;
    }
    try {
      await api.studentsDelete(student.id);
      setItems((prev) => prev.filter((x) => x.id !== student.id));
      toast.success("تم الحذف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className={ds.page.title} style={tajawal}>
          بيانات الطلاب
        </h2>
        <p className={ds.page.description} style={tajawal}>
          إدارة الطلاب — إضافة فردية أو جماعية من نافذة واحدة
        </p>
      </div>

      <Card className={ds.card}>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className={ds.page.section} style={tajawal}>
                قائمة الطلاب
              </CardTitle>
              <CardDescription style={tajawal}>
                ابحث بالاسم — الصفوف المعلّقة تظهر باهتة
              </CardDescription>
            </div>
            <Button
              type="button"
              className={ds.btnRound}
              onClick={() => setAddOpen(true)}
              disabled={!hasApi}
              style={tajawal}
            >
              إضافة طالب ➕
            </Button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم الطالب..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={`pr-10 ${ds.btnRound}`}
              style={tajawal}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {error && (
            <div className={`${ds.alert.error} mb-4`} style={tajawal}>
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-muted-foreground" style={tajawal}>
              جاري التحميل...
            </p>
          ) : (
            <Table className={ds.tableMin}>
              <TableHeader>
                <TableRow>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الاسم
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الهوية
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الجوال
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الحلقة / المسار
                  </TableHead>
                  <TableHead className={ds.table.head} style={tajawal}>
                    الحالة
                  </TableHead>
                  <TableHead className={ds.table.headActions} style={tajawal}>
                    إجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const suspended = s.account_status === "suspended";
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(suspended && "opacity-45")}
                    >
                      <TableCell className="font-medium" style={tajawal}>
                        {s.full_name_ar}
                      </TableCell>
                      <TableCell style={tajawal}>{s.national_id ?? "—"}</TableCell>
                      <TableCell style={tajawal}>{s.phone ?? "—"}</TableCell>
                      <TableCell style={tajawal}>
                        {s.circle_name ?? s.track_name ?? "—"}
                      </TableCell>
                      <TableCell style={tajawal}>
                        {suspended ? (
                          <Badge variant="secondary">معلّق</Badge>
                        ) : (
                          <Badge variant="outline">نشط</Badge>
                        )}
                      </TableCell>
                      <TableActionsCell wide>
                        <TableIconAction
                          kind="edit"
                          onClick={() => setEditStudent(s)}
                        />
                        <TableIconAction
                          kind="suspend"
                          label={suspended ? "تنشيط ⏸️" : "تعليق ⏸️"}
                          onClick={() => void toggleSuspend(s)}
                        />
                        <TableIconAction
                          kind="delete"
                          onClick={() => void removeStudent(s)}
                        />
                      </TableActionsCell>
                    </TableRow>
                  );
                })}
                {items.length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                      style={tajawal}
                    >
                      لا توجد نتائج
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StudentAddDialog
        open={addOpen}
        groups={groups}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false);
          void load(q);
        }}
      />

      {editStudent && (
        <StudentEditDialog
          student={editStudent}
          groups={groups}
          open
          onOpenChange={(o) => {
            if (!o) setEditStudent(null);
          }}
          onSaved={(updated) => {
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)),
            );
            setEditStudent(null);
            toast.success("تم حفظ التعديلات");
          }}
        />
      )}
    </div>
  );
}

function StudentAddDialog({
  open,
  onOpenChange,
  groups,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: EducationalGroupRow[];
  onCreated: () => void;
}) {
  const [tab, setTab] = useState("single");
  const [pasteText, setPasteText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const [name, setName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nationality, setNationality] = useState("سعودي");
  const [phone, setPhone] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [placement, setPlacement] = useState("");
  const [healthNotes, setHealthNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: `${g.entity_type}:${g.id}`,
        label: `${g.name_ar} (${g.entity_type === "circle" ? "حلقة" : "مسار"})`,
      })),
    [groups],
  );

  useEffect(() => {
    if (!open) return;
    setTab("single");
    setPasteText("");
    setFormError(null);
    setName("");
    setNationalId("");
    setNationality("سعودي");
    setPhone("");
    setGuardianPhone("");
    setSchool("");
    setGrade("");
    setPlacement("");
    setHealthNotes("");
  }, [open]);

  async function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { circle_id, track_id } = parsePlacementValue(placement);
    if (!circle_id && !track_id) {
      setFormError("اختر حلقة أو مساراً");
      return;
    }
    setSaving(true);
    try {
      await api.studentsCreate({
        full_name_ar: name.trim(),
        national_id: nationalId.trim(),
        nationality: nationality.trim(),
        phone: phone.trim(),
        guardian_phone: guardianPhone.trim(),
        school_name: school.trim() || null,
        school_grade: grade.trim() || null,
        health_notes: healthNotes.trim() || null,
        circle_id,
        track_id,
      });
      toast.success("تمت إضافة الطالب");
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function submitBulk() {
    if (!pasteText.trim()) {
      setFormError("الصق بيانات الطلاب أولاً");
      return;
    }
    setBulkLoading(true);
    setFormError(null);
    try {
      const res = await api.studentsBulkPaste(pasteText);
      toast.success(`تم حفظ ${res.success} طالب — تم تجاوز ${res.skipped} سطر`);
      if (res.success > 0) {
        setPasteText("");
        onCreated();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "فشل الاستيراد");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ds.card} max-w-lg max-h-[90vh] overflow-y-auto`} dir="rtl">
        <DialogHeader>
          <DialogTitle style={tajawal}>إضافة طلاب</DialogTitle>
          <DialogDescription style={tajawal}>
            إضافة فردية أو لصق جماعي من Excel
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <p className="text-sm text-destructive" style={tajawal}>
            {formError}
          </p>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1" style={tajawal}>
              إضافة فردية
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1" style={tajawal}>
              إضافة جماعية
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-4">
            <form onSubmit={submitSingle} className="grid gap-3">
              <div>
                <Label style={tajawal}>الاسم الرباعي *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label style={tajawal}>رقم الهوية *</Label>
                <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} required />
              </div>
              <div>
                <Label style={tajawal}>الجنسية *</Label>
                <Input value={nationality} onChange={(e) => setNationality(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label style={tajawal}>جوال الطالب *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div>
                  <Label style={tajawal}>جوال ولي الأمر *</Label>
                  <Input
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label style={tajawal}>الحلقة / المسار *</Label>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                  className={ds.select}
                  style={tajawal}
                  required
                >
                  <option value="">— اختر —</option>
                  {groupOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label style={tajawal}>المدرسة</Label>
                  <Input value={school} onChange={(e) => setSchool(e.target.value)} />
                </div>
                <div>
                  <Label style={tajawal}>الصف</Label>
                  <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
                </div>
              </div>
              <div>
                <Label style={tajawal}>ملاحظات صحية</Label>
                <Input value={healthNotes} onChange={(e) => setHealthNotes(e.target.value)} />
              </div>
              <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
                {saving ? "جاري الحفظ…" : "حفظ الطالب"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="bulk" className="mt-4 space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={BULK_PLACEHOLDER}
              rows={12}
              dir="rtl"
              className={`w-full min-h-[220px] border border-border rounded-2xl p-4 text-sm bg-background ${ds.btnRound}`}
              style={tajawal}
            />
            <p className="text-xs text-muted-foreground" style={tajawal}>
              الصق من Excel — الأعمدة مفصولة بتاب (Tab). السطور غير الصالحة تُتجاوز بصمت.
            </p>
            <Button
              type="button"
              className={ds.btnRound}
              onClick={() => void submitBulk()}
              disabled={bulkLoading}
              style={tajawal}
            >
              {bulkLoading ? "جاري الاستيراد…" : "استيراد الطلاب"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function StudentEditDialog({
  student,
  groups,
  open,
  onOpenChange,
  onSaved,
}: {
  student: StudentRow;
  groups: EducationalGroupRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (student: StudentRow) => void;
}) {
  const [name, setName] = useState(student.full_name_ar);
  const [nationalId, setNationalId] = useState(student.national_id ?? "");
  const [nationality, setNationality] = useState(student.nationality ?? "سعودي");
  const [phone, setPhone] = useState(student.phone ?? "");
  const [guardianPhone, setGuardianPhone] = useState(student.guardian_phone ?? "");
  const [school, setSchool] = useState(student.school_name ?? "");
  const [grade, setGrade] = useState(student.school_grade ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(student.full_name_ar);
    setNationalId(student.national_id ?? "");
    setNationality(student.nationality ?? "سعودي");
    setPhone(student.phone ?? "");
    setGuardianPhone(student.guardian_phone ?? "");
    setSchool(student.school_name ?? "");
    setGrade(student.school_grade ?? "");
    setError(null);
  }, [open, student]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.studentsPatch(student.id, {
        full_name_ar: name.trim(),
        national_id: nationalId.trim() || null,
        nationality: nationality.trim() || null,
        phone: phone.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
        school_name: school.trim() || null,
        school_grade: grade.trim() || null,
      });
      onSaved({
        ...student,
        full_name_ar: name.trim(),
        national_id: nationalId.trim() || null,
        nationality: nationality.trim() || null,
        phone: phone.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
        school_name: school.trim() || null,
        school_grade: grade.trim() || null,
      });
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
          <DialogTitle style={tajawal}>تعديل طالب ✏️</DialogTitle>
          <DialogDescription style={tajawal}>{student.full_name_ar}</DialogDescription>
        </DialogHeader>
        {groups.length > 0 && (
          <p className="text-xs text-muted-foreground" style={tajawal}>
            لتغيير الحلقة استخدم أدوات النقل من قسم التعليم عند الحاجة.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <form onSubmit={save} className="grid gap-3">
          <div>
            <Label style={tajawal}>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label style={tajawal}>الهوية</Label>
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>الجنسية</Label>
            <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>جوال الطالب</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>جوال ولي الأمر</Label>
            <Input
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
            />
          </div>
          <div>
            <Label style={tajawal}>المدرسة</Label>
            <Input value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>
          <div>
            <Label style={tajawal}>الصف</Label>
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving} className={ds.btnRound} style={tajawal}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
