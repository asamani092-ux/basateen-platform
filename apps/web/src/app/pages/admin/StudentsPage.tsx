import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Filter, RotateCcw, Search } from "lucide-react";
import { AdminEntityActionModal } from "../../components/admin/AdminEntityActionModal";
import {
  TableActionsCell,
  TableIconAction,
} from "../../components/admin/TableIconAction";
import { StudentPlacementCell } from "../../components/shared/StudentPlacementCell";
import { TableTruncatedCell } from "../../components/shared/TableTruncatedCell";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  api,
  type EducationalGroupRow,
  type StudentRow,
} from "../../lib/api-client";
import { getApiToken } from "../../lib/api-token";
import { EDUCATIONAL_STAGES } from "../../lib/stages";
import {
  TablePagination,
  type PageInfo,
} from "../../components/shared/TablePagination";
import { ds, tajawal } from "../../lib/design-system";
import { cn } from "../../components/ui/utils";
import {
  adminInvalidateFor,
  useAdminDataSync,
  useAdminDataSyncContext,
} from "../../context/AdminDataSyncContext";
import {
  buildStudentPatchPayload,
  downloadStudentTemplateCsv,
  downloadStudentTemplateXlsx,
  formatStudentApiError,
  parseStudentImportFile,
  validateStudentCreateForm,
  validateStudentPatchForm,
} from "../../lib/students-import";
import {
  facesToStructuredInput,
  parseMemorizationTextToFaces,
} from "../../lib/quran-memorization";

const ALL_FILTER = "all";

type RosterTab = "active" | "archived";

type StatusFilterValue = "active" | "suspended" | "no_circle" | "no_track";

const STATUS_FILTER_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "active", label: "نشط" },
  { value: "suspended", label: "معلّق" },
  { value: "no_circle", label: "بدون حلقة" },
  { value: "no_track", label: "بدون مسار" },
];

export function StudentsPage() {
  const [rosterTab, setRosterTab] = useState<RosterTab>("active");
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState(ALL_FILTER);
  const [circleFilter, setCircleFilter] = useState(ALL_FILTER);
  const [trackFilter, setTrackFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [items, setItems] = useState<StudentRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [actionStudent, setActionStudent] = useState<StudentRow | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [groups, setGroups] = useState<EducationalGroupRow[]>([]);
  const isArchivedView = rosterTab === "archived";
  const hasApi = Boolean(getApiToken());
  const { invalidate } = useAdminDataSyncContext();

  const loadGroups = useCallback(async () => {
    if (!hasApi) return;
    try {
      const res = await api.adminEducationalGroups();
      setGroups(res.items ?? []);
    } catch {
      setGroups([]);
    }
  }, [hasApi]);

  const circles = useMemo(
    () => groups.filter((g) => g.entity_type === "circle"),
    [groups],
  );
  const tracks = useMemo(
    () => groups.filter((g) => g.entity_type === "track"),
    [groups],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!hasApi) {
      setError("أعد تسجيل الدخول لربط النظام");
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.students({
        q,
        archived: isArchivedView,
        stage_id: stageFilter !== ALL_FILTER ? Number(stageFilter) : undefined,
        circle_id: circleFilter !== ALL_FILTER ? Number(circleFilter) : undefined,
        track_id: trackFilter !== ALL_FILTER ? Number(trackFilter) : undefined,
        status_filter:
          !isArchivedView && statusFilter !== ALL_FILTER
            ? (statusFilter as StatusFilterValue)
            : undefined,
        page,
      });
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
        setPageInfo((res as { page?: PageInfo }).page ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الطلاب");
      setItems([]);
      setPageInfo(null);
    } finally {
      setLoading(false);
    }
  }, [hasApi, q, stageFilter, circleFilter, trackFilter, statusFilter, page, isArchivedView]);

  useEffect(() => {
    setPage(1);
  }, [q, stageFilter, circleFilter, trackFilter, statusFilter, rosterTab]);

  const syncAdminData = useCallback(async () => {
    await Promise.all([load(), loadGroups()]);
  }, [load, loadGroups]);

  useAdminDataSync(["students", "groups"], syncAdminData);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  function afterStudentMutation() {
    invalidate(adminInvalidateFor("student"));
    void load();
    void loadGroups();
  }

  async function restoreStudent(student: StudentRow) {
    setRestoringId(student.id);
    try {
      await api.studentsRestore(student.id);
      setItems((prev) => prev.filter((x) => x.id !== student.id));
      afterStudentMutation();
      toast.success(`تمت استعادة ${student.full_name_ar}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستعادة");
    } finally {
      setRestoringId(null);
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
              disabled={!hasApi || isArchivedView}
              style={tajawal}
            >
              إضافة طالب ➕
            </Button>
          </div>
          <Tabs
            value={rosterTab}
            onValueChange={(v) => setRosterTab(v as RosterTab)}
            dir="rtl"
          >
            <TabsList className="w-full sm:w-auto grid grid-cols-2">
              <TabsTrigger value="active" style={tajawal}>
                الطلاب النشطين
              </TabsTrigger>
              <TabsTrigger value="archived" style={tajawal}>
                الطلاب المؤرشفين/المحذوفين
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="rounded-xl border border-border/60 bg-muted/25 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span style={tajawal}>تصفية القائمة</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="relative sm:col-span-2 xl:col-span-2">
                <Label className="text-xs text-muted-foreground mb-1 block" style={tajawal}>
                  البحث
                </Label>
                <Search className="absolute right-3 top-[calc(50%+0.5rem)] -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="ابحث باسم الطالب..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className={`pr-10 h-10 bg-background ${ds.btnRound}`}
                  style={tajawal}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground" style={tajawal}>
                  المرحلة الدراسية
                </Label>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className={`h-10 bg-background ${ds.btnRound}`}>
                    <SelectValue placeholder="كل المراحل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>كل المراحل</SelectItem>
                    {EDUCATIONAL_STAGES.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground" style={tajawal}>
                  الحلقة
                </Label>
                <Select value={circleFilter} onValueChange={setCircleFilter}>
                  <SelectTrigger className={`h-10 bg-background ${ds.btnRound}`}>
                    <SelectValue placeholder="كل الحلقات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>كل الحلقات</SelectItem>
                    {circles.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground" style={tajawal}>
                  المسار
                </Label>
                <Select value={trackFilter} onValueChange={setTrackFilter}>
                  <SelectTrigger className={`h-10 bg-background ${ds.btnRound}`}>
                    <SelectValue placeholder="كل المسارات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>كل المسارات</SelectItem>
                    {tracks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground" style={tajawal}>
                  الحالة
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  disabled={isArchivedView}
                >
                  <SelectTrigger className={`h-10 bg-background ${ds.btnRound}`}>
                    <SelectValue placeholder="كل الحالات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>كل الحالات</SelectItem>
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground" style={tajawal}>
              {loading
                ? "جاري التحميل…"
                : pageInfo
                  ? `${pageInfo.total} طالب — صفحة ${pageInfo.page} من ${pageInfo.total_pages}`
                  : `يعرض ${items.length} طالب`}
            </p>
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
            <div className={ds.tableWrap}>
            <Table className={ds.tableMin}>
              <TableHeader>
                <TableRow>
                  <TableHead className={`${ds.table.head} ${ds.table.colName}`} style={tajawal}>
                    الاسم
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colId}`} style={tajawal}>
                    الهوية
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPhone}`} style={tajawal}>
                    الجوال
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colPlacement}`} style={tajawal}>
                    الحلقة / المسار
                  </TableHead>
                  <TableHead className={`${ds.table.head} ${ds.table.colStatus}`} style={tajawal}>
                    الحالة
                  </TableHead>
                  <TableHead className={ds.table.headActions} style={tajawal}>
                    إجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => {
                  const suspended = !isArchivedView && s.account_status === "suspended";
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(suspended && "opacity-45", isArchivedView && "opacity-70")}
                    >
                      <TableTruncatedCell
                        className="font-medium"
                        title={s.full_name_ar?.trim() || undefined}
                        style={tajawal}
                      >
                        {s.full_name_ar?.trim() || "—"}
                      </TableTruncatedCell>
                      <TableTruncatedCell style={tajawal}>
                        {s.national_id ?? "—"}
                      </TableTruncatedCell>
                      <TableTruncatedCell style={tajawal}>
                        {s.phone ?? "—"}
                      </TableTruncatedCell>
                      <StudentPlacementCell
                        circleName={s.circle_name}
                        trackName={s.track_name}
                      />
                      <TableCell style={tajawal}>
                        {isArchivedView ? (
                          <Badge variant="secondary">مؤرشف</Badge>
                        ) : suspended ? (
                          <Badge variant="secondary">معلّق</Badge>
                        ) : (
                          <Badge variant="outline">نشط</Badge>
                        )}
                      </TableCell>
                      <TableActionsCell>
                        {!isArchivedView && (
                          <>
                            <TableIconAction
                              kind="edit"
                              onClick={() => setEditStudent(s)}
                            />
                            <TableIconAction
                              kind="more"
                              onClick={() => setActionStudent(s)}
                            />
                          </>
                        )}
                        {isArchivedView && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={ds.btnRound}
                            disabled={restoringId === s.id}
                            onClick={() => void restoreStudent(s)}
                            style={tajawal}
                          >
                            <RotateCcw className="w-4 h-4" />
                            {restoringId === s.id ? "جاري الاستعادة…" : "استعادة"}
                          </Button>
                        )}
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
                      {isArchivedView ? "لا يوجد طلاب مؤرشفون" : "لا توجد نتائج"}
                    </TableCell>
                  </TableRow>
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

      <StudentAddDialog
        open={addOpen}
        groups={groups}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false);
          afterStudentMutation();
        }}
      />

      {actionStudent && !isArchivedView && (
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
              afterStudentMutation();
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
              afterStudentMutation();
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
            afterStudentMutation();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unassigned = !student.circle_name && !student.track_name;

  const initialValues = useMemo<Partial<StudentUnifiedFormValues>>(() => {
    const faces =
      student.memorization_faces != null && student.memorization_faces > 0
        ? student.memorization_faces
        : parseMemorizationTextToFaces(student.memorization_amount);
    const structured = facesToStructuredInput(faces);
    return {
      full_name_ar: student.full_name_ar,
      national_id: student.national_id ?? "",
      nationality: student.nationality ?? "سعودي",
      phone: student.phone ?? "",
      guardian_phone: student.guardian_phone ?? "",
      school_name: student.school_name ?? "",
      school_grade: student.school_grade ?? "",
      memorization_amount: student.memorization_amount ?? "",
      memorization_value: structured.value,
      memorization_unit: structured.unit,
      health_notes: student.health_notes ?? "",
      stage_id: student.stage_id != null ? String(student.stage_id) : "",
      age: student.age != null ? String(student.age) : "",
      placement: "",
    };
  }, [student]);

  async function save(values: StudentUnifiedFormValues) {
    if (unassigned && !values.placement.trim()) {
      setError("الطالب غير مسند — اختر حلقة أو مسار للإسناد");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const validated = validateStudentPatchForm(values);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" — ");
        setError(issues || "تحقق من الحقول");
        return;
      }
      const payload = buildStudentPatchPayload(values);
      const res = await api.studentsPatch(student.id, payload);
      const updated = res.student;
      onSaved({
        ...student,
        full_name_ar: (updated?.full_name_ar ?? payload.full_name_ar) as string,
        national_id: payload.national_id as string | null,
        nationality: payload.nationality as string | null,
        phone: payload.phone as string | null,
        guardian_phone: payload.guardian_phone as string | null,
        school_name: payload.school_name as string | null,
        school_grade: payload.school_grade as string | null,
        memorization_amount: payload.memorization_amount as string | null,
        health_notes: payload.health_notes as string | null,
        stage_id: payload.stage_id as number | null,
        age: payload.age as number | null,
        circle_name: updated?.circle_name ?? student.circle_name,
        track_name: updated?.track_name ?? student.track_name,
      });
    } catch (err) {
      setError(formatStudentApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${ds.card} max-w-2xl max-h-[90vh] overflow-y-auto`}
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle style={tajawal}>تعديل بيانات الطالب ✏️</DialogTitle>
          <DialogDescription style={tajawal}>{student.full_name_ar}</DialogDescription>
        </DialogHeader>
        {unassigned && (
          <p className={`${ds.alert.info} text-sm`} style={tajawal}>
            هذا الطالب غير مسند — يجب اختيار حلقة أو مسار عند الحفظ.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" style={tajawal}>
            {error}
          </p>
        )}
        <StudentUnifiedSingleForm
          key={student.id}
          groups={groups}
          initialValues={initialValues}
          requirePlacement={unassigned}
          resetOnSubmit={false}
          submitLabel="حفظ التعديلات"
          submitting={saving}
          onSubmit={save}
        />
      </DialogContent>
    </Dialog>
  );
}
