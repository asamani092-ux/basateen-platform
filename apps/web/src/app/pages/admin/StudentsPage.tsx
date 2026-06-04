import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
  StudentUnifiedSingleForm,
  type StudentUnifiedFormValues,
} from "../../components/admin/StudentUnifiedSingleForm";
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
import {
  downloadStudentTemplateCsv,
  downloadStudentTemplateXlsx,
  formatStudentApiError,
  parseStudentImportFile,
  validateStudentCreateForm,
} from "../../lib/students-import";

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [actionStudent, setActionStudent] = useState<StudentRow | null>(null);
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
                          kind="more"
                          onClick={() => setActionStudent(s)}
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

      {actionStudent && (
        <AdminEntityActionModal
          open
          onOpenChange={(o) => {
            if (!o) setActionStudent(null);
          }}
          entityTitle="الطالب"
          entityName={actionStudent.full_name_ar}
          isActive={actionStudent.account_status !== "suspended"}
          activeLabel="نشط"
          suspendedLabel="معلّق"
          onToggleActive={async () => {
            try {
              const suspended = actionStudent.account_status === "suspended";
              const next = suspended ? "active" : "suspended";
              await api.studentsPatch(actionStudent.id, { account_status: next });
              setItems((prev) =>
                prev.map((x) =>
                  x.id === actionStudent.id ? { ...x, account_status: next } : x,
                ),
              );
              setActionStudent(null);
              toast.success(suspended ? "تم تنشيط الطالب" : "تم تعليق الطالب");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل تحديث الحالة");
              throw e;
            }
          }}
          onDelete={async () => {
            try {
              await api.studentsDelete(actionStudent.id);
              setItems((prev) => prev.filter((x) => x.id !== actionStudent.id));
              setActionStudent(null);
              toast.success("تم الحذف");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "فشل الحذف");
              throw e;
            }
          }}
          deleteHint="يُحذف الطالب مع سجلاته المرتبطة ولا يمكن التراجع."
        />
      )}

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
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedCount, setParsedCount] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("single");
    setImportFile(null);
    setParsedCount(0);
    setFormError(null);
  }, [open]);

  async function onFileSelected(file: File | null) {
    setImportFile(file);
    setParsedCount(0);
    if (!file) return;
    try {
      const rows = await parseStudentImportFile(file);
      setParsedCount(rows.length);
      if (rows.length === 0) {
        setFormError("لم يُعثر على صفوف صالحة — استخدم النموذج الرسمي");
      } else {
        setFormError(null);
      }
    } catch {
      setFormError("تعذّر قراءة الملف");
    }
  }

  async function submitSingle(values: StudentUnifiedFormValues) {
    setFormError(null);
    const validated = validateStudentCreateForm(values);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" — ");
      setFormError(issues || "تحقق من الحقول الإلزامية والحلقة/المسار");
      return;
    }
    setSaving(true);
    try {
      await api.studentsCreate(validated.data);
      toast.success("تمت إضافة الطالب");
      onCreated();
    } catch (err) {
      setFormError(formatStudentApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitBulk() {
    if (!importFile) {
      setFormError("اختر ملف Excel أو CSV");
      return;
    }
    setBulkLoading(true);
    setFormError(null);
    try {
      const rows = await parseStudentImportFile(importFile);
      if (rows.length === 0) {
        setFormError("لا توجد صفوف صالحة في الملف");
        return;
      }
      const res = await api.adminStudentsBulk(rows);
      toast.success(res.message);
      if (res.failedDetails && res.failedDetails.length > 0) {
        console.warn("bulk_import_failures", res.failedDetails);
      }
      if ((res.successCount ?? res.success) > 0) {
        setImportFile(null);
        setParsedCount(0);
        onCreated();
      }
    } catch (err) {
      setFormError(formatStudentApiError(err));
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
            إضافة فردية أو رفع ملف Excel/CSV بعد تنزيل النموذج
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
            <StudentUnifiedSingleForm
              groups={groups}
              submitting={saving}
              onSubmit={submitSingle}
            />
          </TabsContent>

          <TabsContent value="bulk" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                className={ds.btnRound}
                onClick={() => downloadStudentTemplateXlsx()}
                style={tajawal}
              >
                تنزيل نموذج الإضافة ⬇️
              </Button>
              <Button
                type="button"
                variant="outline"
                className={ds.btnRound}
                onClick={() => downloadStudentTemplateCsv()}
                style={tajawal}
              >
                تنزيل CSV
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" style={tajawal}>
              عبّئ النموذج ثم ارفع الملف. تُقرأ البيانات في المتصفح وترسل كـ JSON — بدون رفع
              ملف للسيرفر.
            </p>
            <div>
              <Label style={tajawal}>ملف الطلاب (.xlsx أو .csv)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="mt-2"
                onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
              />
              {importFile && (
                <p className="text-xs text-muted-foreground mt-2" style={tajawal}>
                  {importFile.name}
                  {parsedCount > 0 ? ` — ${parsedCount} صف جاهز` : ""}
                </p>
              )}
            </div>
            <Button
              type="button"
              className={ds.btnRound}
              onClick={() => void submitBulk()}
              disabled={bulkLoading || !importFile || parsedCount === 0}
              style={tajawal}
            >
              {bulkLoading ? "جاري الاستيراد…" : "رفع واستيراد الطلاب"}
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
